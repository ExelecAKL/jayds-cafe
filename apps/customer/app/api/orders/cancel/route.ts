import { NextResponse } from "next/server";
import { readJsonBody } from "@cafeos/shared/server/request-body";
import { lalamoveRequest } from "../../lalamove/lib";
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
} from "../../../../lib/provider-attempts";
export async function POST(req: Request) {
  try {
    const { orderId } = await readJsonBody(req);
    const { db, order, actorId, isStaff } = await requireOrderAccess(
      req,
      orderId,
      { scope: "manage", allowStaff: true },
    );
    if (order.payment_status === "paid") {
      const { data: approver } = isStaff
        ? await db
            .from("profiles")
            .select("role,is_approved")
            .eq("id", actorId)
            .maybeSingle()
        : { data: null };
      if (!approver?.is_approved || approver.role !== "admin")
        throw new ApiAccessError(
          "Paid cancellations require Admin refund review. Submit a request through Help.",
          403,
        );
    }
    if (order.status === "cancelled")
      return NextResponse.json(
        { success: true, refundRequired: order.payment_status === "paid" },
        { headers: PRIVATE_HEADERS },
      );
    if (!["pending", "confirmed"].includes(order.status))
      throw new ApiAccessError("The order can no longer be cancelled.", 409);
    if (order.order_type === "delivery" && order.lalamove_order_id) {
      const { claimed, attempt } = await claimProviderAttempt(
        db,
        order.id,
        "lalamove_cancel",
        actorId,
      );
      if (!claimed && attempt.state === "uncertain") {
        const detail = await lalamoveRequest<{
          data: { orderId: string; status: string };
        }>("GET", `/v3/orders/${order.lalamove_order_id}`);
        const remote = detail.data?.data;
        if (
          remote &&
          remote.orderId === order.lalamove_order_id &&
          remote.status === "CANCELED"
        )
          await finishProviderAttempt(db, attempt, "cancelled", null, null);
        else pendingAttemptError(attempt);
      } else if (!claimed && attempt.state !== "cancelled")
        pendingAttemptError(attempt);
      if (claimed) {
        const result = await lalamoveRequest(
          "DELETE",
          `/v3/orders/${order.lalamove_order_id}`,
          undefined,
          attempt.request_key,
        );
        if (result.error || result.status !== 204) {
          if (
            !result.status ||
            result.status >= 500 ||
            [408, 429].includes(result.status)
          )
            await markUncertain(db, attempt, "CANCELLATION_RESPONSE_UNCERTAIN");
          else
            await finishProviderAttempt(
              db,
              attempt,
              "failed",
              null,
              null,
              "CANCELLATION_DECLINED",
            );
          throw new ApiAccessError(
            result.status === 409
              ? "The driver has already picked up this delivery."
              : "Delivery cancellation needs review. Contact the cafe before retrying.",
            409,
          );
        }
        await finishProviderAttempt(db, attempt, "cancelled", null, null);
      }
    }
    const { data, error } = await db.rpc("customer_cancel_order", {
      p_order: order.id,
      p_expected: order.status,
      p_payment: order.payment_status,
    });
    if (error || !data?.success)
      throw new ApiAccessError(
        "The order changed or its provider operation needs reconciliation. Refresh it before cancelling.",
        409,
      );
    return NextResponse.json(
      { success: true, refundRequired: data.refundRequired },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return apiAccessErrorResponse(error);
  }
}
