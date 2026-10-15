import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@cafeos/shared/server/request-body";
import { MayaService, MayaProviderError } from "@cafeos/shared/maya";
import {
  mayaAmountDetails,
  type FinancialBreakdown,
} from "@cafeos/shared/finance/calculations";
import {
  ApiAccessError,
  PRIVATE_HEADERS,
  apiAccessErrorResponse,
  requireOrderAccess,
} from "../../../../lib/server-access";
import {
  claimProviderAttempt,
  finishProviderAttempt,
  markUncertain,
  pendingAttemptError,
  safeProviderUrl,
} from "../../../../lib/provider-attempts";
import {
  createMayaReturnUrls,
  resolveMayaReturnOrigin,
} from "../../../../lib/maya-return-state";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const { db, order, actorId, isStaff } = await requireOrderAccess(
      req,
      body.orderId,
      { scope: "pay", allowStaff: true, staffOnly: !!body.reconcileCheckoutId },
    );
    // Only authenticated merchant retrieval can attach a provider-dashboard result.
    if (body.reconcileCheckoutId) {
      if (!isStaff) throw new ApiAccessError("Approved staff access required.");
      const { data: attempt, error } = await db
        .from("customer_provider_attempts")
        .select("*")
        .eq("order_id", order.id)
        .eq("provider", "maya")
        .in("state", ["creating", "uncertain"])
        .maybeSingle();
      if (error || !attempt)
        throw new ApiAccessError(
          "No payment attempt requires reconciliation.",
          409,
        );
      const payment = await MayaService.getCheckoutStatus(
        String(body.reconcileCheckoutId),
      );
      if (
        payment.id !== body.reconcileCheckoutId ||
        payment.requestReferenceNumber !== attempt.id ||
        (payment.currency ?? payment.totalAmount?.currency) !== "PHP" ||
        Math.round(
          Number(payment.amount ?? payment.totalAmount?.value) * 100,
        ) !== Math.round(Number(order.total) * 100)
      ) {
        throw new ApiAccessError(
          "The provider payment does not match this attempt.",
          409,
        );
      }
      await finishProviderAttempt(db, attempt, "ready", payment.id, null);
      const verified = await MayaService.verifyAndUpdateOrder(payment.id, db);
      if (!verified.success)
        throw new ApiAccessError(
          "Payment reconciliation is temporarily unavailable.",
          503,
        );
      return NextResponse.json(
        { reconciled: true, paymentStatus: verified.status },
        { headers: PRIVATE_HEADERS },
      );
    }
    if (
      order.payment_method !== "maya" ||
      ["paid", "refunded"].includes(order.payment_status) ||
      !["pending", "confirmed"].includes(order.status)
    ) {
      throw new ApiAccessError("This order cannot start another payment.", 409);
    }
    const { data: items, error: itemsError } = await db
      .from("order_items")
      .select("id,menu_item_id,name,price,quantity,notes")
      .eq("order_id", order.id);
    if (itemsError || !items?.length)
      throw new ApiAccessError("Order items are temporarily unavailable.", 503);
    const customer = order.customer_id
      ? (
          await db
            .from("profiles")
            .select("email,full_name,phone")
            .eq("id", order.customer_id)
            .maybeSingle()
        ).data
      : null;
    if (!process.env.NEXT_PUBLIC_MAYA_PUBLIC_KEY)
      throw new ApiAccessError(
        "Maya checkout is temporarily unavailable. Please contact the cafe.",
        503,
      );
    const origin = resolveMayaReturnOrigin(req);
    const { data: financial, error: financialError } = await db
      .from("order_financials")
      .select("breakdown")
      .eq("order_id", order.id)
      .maybeSingle();
    if (financialError)
      throw new ApiAccessError(
        "The payment breakdown is temporarily unavailable. Please retry.",
        503,
      );
    const financialDetails = financial
      ? mayaAmountDetails(financial.breakdown as FinancialBreakdown)
      : null;
    if (
      financial &&
      Math.round(Number(order.total) * 100) !== financial.breakdown.total
    )
      throw new ApiAccessError("The payment total needs staff review.", 409);
    const { claimed, attempt } = await claimProviderAttempt(
      db,
      order.id,
      "maya",
      actorId,
    );
    if (!claimed) {
      const redirectUrl = safeProviderUrl(attempt.remote_url);
      if (attempt.state === "ready" && attempt.remote_id && redirectUrl)
        return NextResponse.json(
          { checkoutId: attempt.remote_id, redirectUrl },
          { headers: PRIVATE_HEADERS },
        );
      pendingAttemptError(attempt);
    }
    const redirectUrls = createMayaReturnUrls(origin, order.id, attempt.id);
    const [firstName, ...lastName] = String(
      customer?.full_name || order.delivery_name || "",
    )
      .trim()
      .split(/\s+/);
    const subtotal = Number(order.subtotal),
      total = Number(order.total),
      shippingFee = Number(order.delivery_fee ?? 0);
    try {
      const checkout = await MayaService.createCheckout({
        totalAmount: {
          value: total,
          currency: "PHP",
          details: financialDetails ?? {
            subtotal,
            discount: Math.max(0, subtotal + shippingFee - total),
            serviceCharge: 0,
            shippingFee,
            tax: 0,
          },
        },
        buyer: {
          firstName,
          lastName: lastName.join(" "),
          contact: {
            phone: customer?.phone || order.delivery_phone || undefined,
            email: customer?.email || undefined,
          },
          shippingAddress:
            order.order_type === "delivery" && order.delivery_address
              ? { line1: order.delivery_address, countryCode: "PH" }
              : undefined,
        },
        items: items.map((item) => ({
          name: item.name,
          quantity: Number(item.quantity),
          code: item.menu_item_id || item.id,
          description: item.notes || item.name,
          amount: { value: Number(item.price), currency: "PHP" },
          totalAmount: {
            value: Number(item.price) * Number(item.quantity),
            currency: "PHP",
          },
        })),
        redirectUrl: redirectUrls,
        requestReferenceNumber: attempt.id,
        metadata: { orderId: order.id, attemptId: attempt.id },
      });
      const redirectUrl = safeProviderUrl(checkout.redirectUrl);
      if (!redirectUrl)
        throw new MayaProviderError("Incomplete provider response.", true);
      await finishProviderAttempt(
        db,
        attempt,
        "ready",
        checkout.checkoutId,
        redirectUrl,
      );
      return NextResponse.json(
        { checkoutId: checkout.checkoutId, redirectUrl },
        { headers: PRIVATE_HEADERS },
      );
    } catch (error) {
      if (error instanceof MayaProviderError && !error.uncertain)
        await finishProviderAttempt(
          db,
          attempt,
          "failed",
          null,
          null,
          "PROVIDER_DECLINED",
        );
      else await markUncertain(db, attempt, "CHECKOUT_RESPONSE_UNCERTAIN");
      throw new ApiAccessError(
        error instanceof MayaProviderError && !error.uncertain
          ? "Maya could not create this checkout. Please retry."
          : "The payment response needs reconciliation. Please contact the cafe before retrying.",
        503,
      );
    }
  } catch (error) {
    return apiAccessErrorResponse(error);
  }
}
