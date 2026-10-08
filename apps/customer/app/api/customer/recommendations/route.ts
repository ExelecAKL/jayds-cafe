import { NextResponse } from "next/server";
import {
  requireCustomer,
  apiAccessErrorResponse,
  ApiAccessError,
  PRIVATE_HEADERS,
} from "../../../../lib/server-access";
import {
  buildHomeRecommendations,
  type RecommendationHistory,
} from "../../../../utils/recommendations";
import type { MenuItem } from "@cafeos/shared/types";

export async function GET(req: Request) {
  try {
    const { db, userId } = await requireCustomer(req);
    const [history, catalog] = await Promise.all([
      db.rpc("get_customer_recommendation_history", { p_customer: userId }),
      db.rpc("get_published_catalog"),
    ]);
    if (
      history.error ||
      catalog.error ||
      !history.data ||
      !Array.isArray(catalog.data?.menuItems)
    )
      throw new ApiAccessError(
        "Your suggestions could not load. Please retry when online.",
        503,
      );
    return NextResponse.json(
      buildHomeRecommendations(
        history.data as RecommendationHistory,
        catalog.data.menuItems as MenuItem[],
      ),
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return apiAccessErrorResponse(error);
  }
}
