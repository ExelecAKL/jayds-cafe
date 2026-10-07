import {
  JsonBodyError,
  readJsonBody,
} from "@cafeos/shared/server/request-body";
import { CatalogValidationError } from "@cafeos/shared/inventory/orders";
import { cashierError, requireCashier } from "../../../../lib/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

// Forward the approved cashier's own session to the existing checked provider
// endpoints. Their attempt ledger handles retries and uncertain booking results.
export async function POST(req: Request) {
  try {
    const { db } = await requireCashier(req);
    const body = await readJsonBody<{ order_id?: unknown; action?: unknown }>(
      req,
    );
    if (
      typeof body.order_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        body.order_id,
      ) ||
      !["dispatch", "status"].includes(String(body.action))
    )
      throw new CatalogValidationError(
        "Choose a valid delivery order and action.",
        400,
      );
    const { data: order, error } = await db
      .from("orders")
      .select("order_type,status,payment_status,lalamove_order_id")
      .eq("id", body.order_id)
      .maybeSingle();
    if (error)
      throw new CatalogValidationError(
        "Delivery order could not be checked. Retry after refreshing.",
        503,
      );
    if (!order) throw new CatalogValidationError("Order not found.", 404);
    if (order.order_type !== "delivery")
      throw new CatalogValidationError(
        "Use pickup actions for this order.",
        409,
      );
    if (
      body.action === "dispatch" &&
      (order.payment_status !== "paid" ||
        !["preparing", "ready"].includes(order.status))
    )
      throw new CatalogValidationError(
        "A paid delivery must be preparing or ready before booking a rider.",
        409,
      );
    if (body.action === "status" && !order.lalamove_order_id)
      throw new CatalogValidationError(
        "Book a rider before refreshing delivery status.",
        409,
      );
    const base = new URL(
      process.env.NEXT_PUBLIC_CUSTOMER_URL?.trim() || "http://localhost:4000",
    );
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password
    )
      throw new CatalogValidationError(
        "The customer application URL is not configured correctly.",
        503,
      );
    const dispatch = body.action === "dispatch";
    const url = new URL(
      dispatch ? "/api/lalamove/dispatch" : "/api/lalamove/status",
      base,
    );
    if (!dispatch) url.searchParams.set("dbOrderId", body.order_id);
    const result = await fetch(url, {
      method: dispatch ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.get("Authorization")!,
      },
      ...(dispatch ? { body: JSON.stringify({ orderId: body.order_id }) } : {}),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
    });
    const data = await result.json().catch(() => null);
    if (!result.ok)
      throw new CatalogValidationError(
        typeof data?.error === "string"
          ? data.error
          : "Delivery could not be confirmed. Refresh before trying again.",
        result.status,
      );
    if (
      !data ||
      (dispatch ? data.success !== true : typeof data.status !== "string")
    )
      throw new CatalogValidationError(
        "Delivery confirmation could not be read. Refresh before booking again.",
        503,
      );
    return Response.json(data, { headers });
  } catch (error) {
    if (error instanceof JsonBodyError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );
    return cashierError(error);
  }
}
