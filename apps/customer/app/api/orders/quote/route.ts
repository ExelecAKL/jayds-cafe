import {
  priceOrder,
  OrderValidationError,
  type PricingInput,
} from "../create/pricing";
import { paymentQuote } from "@cafeos/shared/finance/quote";
import { CatalogValidationError } from "@cafeos/shared/inventory/orders";
import {
  readJsonBody,
  ORDER_BODY_LIMIT,
} from "@cafeos/shared/server/request-body";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import {
  assertSameOrigin,
  getServerDb,
  requireCustomer,
  PRIVATE_HEADERS,
  apiAccessErrorResponse,
  ApiAccessError,
} from "../../../../lib/server-access";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return await withRequestDeadline(async () => {
      const { db, userId } = request.headers.has("authorization")
        ? await requireCustomer(request)
        : { db: getServerDb(), userId: null };
      const body = await readJsonBody<PricingInput>(request, {
        maxBytes: ORDER_BODY_LIMIT,
      });
      if (
        !Array.isArray(body.items) ||
        body.items.length < 1 ||
        body.items.length > 200 ||
        body.items.some((i) => !i || typeof i !== "object")
      )
        throw new ApiAccessError(
          "Add valid items before reviewing your order.",
          400,
        );
      const priced = await priceOrder(db, body, userId, false);
      return Response.json(paymentQuote(priced.financialBreakdown), {
        headers: PRIVATE_HEADERS,
      });
    });
  } catch (error) {
    if (
      error instanceof OrderValidationError ||
      error instanceof CatalogValidationError
    )
      return Response.json(
        { error: error.message },
        { status: error.status, headers: PRIVATE_HEADERS },
      );
    if (error instanceof Error && error.name === "RequestTimeoutError")
      return Response.json(
        { error: "Pricing took too long. Please try again." },
        { status: 503, headers: PRIVATE_HEADERS },
      );
    return apiAccessErrorResponse(error);
  }
}
