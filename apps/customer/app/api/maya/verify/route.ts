import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@cafeos/shared/server/request-body";
import { MayaService } from "@cafeos/shared/maya";
import {
  ApiAccessError,
  PRIVATE_HEADERS,
  apiAccessErrorResponse,
  getServerDb,
  requireOrderAccess,
} from "../../../../lib/server-access";
import { readMayaReturnState } from "../../../../lib/maya-return-state";

export async function POST(req: NextRequest) {
  try {
    const { checkoutId, returnState, returnOutcome } = await readJsonBody(req);
    if (
      typeof checkoutId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        checkoutId,
      )
    )
      throw new ApiAccessError("Invalid checkout ID.", 400);
    // This authenticates the browser handoff only. It never grants order access
    // or settles a payment without retrieving Maya's merchant-side record.
    const state =
      returnState === undefined ? null : readMayaReturnState(returnState);
    if (
      returnState !== undefined &&
      (!state || returnOutcome !== state.outcome)
    )
      throw new ApiAccessError(
        "This payment return has expired or could not be verified. Refresh your order to check its payment.",
        400,
      );
    const db = getServerDb();
    const { data: attempt, error } = await db
      .from("customer_provider_attempts")
      .select("id,order_id")
      .eq("provider", "maya")
      .eq("remote_id", checkoutId)
      .maybeSingle();
    if (error)
      throw new ApiAccessError(
        "Payment verification is temporarily unavailable.",
        503,
      );
    const legacy = attempt
      ? null
      : (
          await db
            .from("orders")
            .select("id")
            .eq("maya_checkout_id", checkoutId)
            .maybeSingle()
        ).data;
    const orderId = attempt?.order_id ?? legacy?.id;
    if (!orderId) throw new ApiAccessError("Payment not found.", 404);
    if (state && (state.orderId !== orderId || state.attemptId !== attempt?.id))
      throw new ApiAccessError(
        "This payment return does not match the accepted order.",
        403,
      );
    await requireOrderAccess(req, orderId, {
      scope: "pay",
      allowStaff: true,
      db,
    });
    const result = await MayaService.verifyAndUpdateOrder(checkoutId, db);
    if (!result.success || result.orderId !== orderId)
      throw new ApiAccessError(
        "Payment verification is temporarily unavailable.",
        503,
      );
    return NextResponse.json(
      { success: true, orderId: result.orderId, paymentStatus: result.status },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return apiAccessErrorResponse(error);
  }
}
