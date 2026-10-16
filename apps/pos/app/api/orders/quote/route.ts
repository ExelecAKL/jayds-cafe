import { requireCashier, cashierError } from "../../../../lib/server";
import {
  CatalogValidationError,
  priceCatalogItems,
  type SubmittedItem,
} from "@cafeos/shared/inventory/orders";
import { quoteFinancials, paymentQuote } from "@cafeos/shared/finance/quote";
import {
  readJsonBody,
  ORDER_BODY_LIMIT,
  JsonBodyError,
} from "@cafeos/shared/server/request-body";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
export async function POST(request: Request) {
  try {
    return await withRequestDeadline(async () => {
      const { db } = await requireCashier(request);
      const body = await readJsonBody<{
        items?: SubmittedItem[];
        order_id?: string;
        customer_id?: string;
        points_redeemed?: number;
      }>(request, { maxBytes: ORDER_BODY_LIMIT });
      if (body.order_id && !body.items) {
        const { data, error } = await db.rpc("finance_unpaid_quote", {
          p_order: body.order_id,
        });
        if (error) throw new CatalogValidationError(error.message, 409);
        return Response.json(paymentQuote(data.breakdown, data.total), {
          headers,
        });
      }
      if (
        !Array.isArray(body.items) ||
        !body.items.length ||
        body.items.length > 200 ||
        body.items.some((i) => !i || typeof i !== "object")
      )
        throw new CatalogValidationError(
          "Add valid items to the ticket first.",
          400,
        );
      const items = await priceCatalogItems(db, body.items, "base");
      const points = Number(body.points_redeemed ?? 0);
      if (
        !Number.isSafeInteger(points) ||
        points < 0 ||
        (points > 0 && !body.customer_id)
      )
        throw new CatalogValidationError("Invalid points amount.", 400);
      if (body.customer_id) {
        const { data, error } = await db
          .from("profiles")
          .select("points")
          .eq("id", body.customer_id)
          .maybeSingle();
        if (error || !data || points > Number(data.points))
          throw new CatalogValidationError(
            "Customer points could not be verified.",
            409,
          );
      }
      return Response.json(
        paymentQuote(await quoteFinancials(db, { items, points })),
        { headers },
      );
    });
  } catch (error) {
    if (error instanceof JsonBodyError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );
    if (error instanceof Error && error.name === "RequestTimeoutError")
      return Response.json(
        { error: "Pricing took too long. Try again." },
        { status: 503, headers },
      );
    const response = cashierError(error);
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    response.headers.set("Vary", "Authorization");
    return response;
  }
}
