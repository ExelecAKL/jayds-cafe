import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@cafeos/shared/server/request-body";
import {
  ApiAccessError,
  PRIVATE_HEADERS,
  apiAccessErrorResponse,
  getServerDb,
  guestDeviceHash,
  publicOrder,
  requireOrderAccess,
} from "../../../../lib/server-access";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(req: NextRequest) {
  try {
    const { orderIds } = await readJsonBody(req);
    if (!Array.isArray(orderIds) || orderIds.length > 20)
      throw new ApiAccessError("Provide at most 20 guest order IDs.", 400);
    if (!orderIds.length)
      return NextResponse.json({ orders: [] }, { headers: PRIVATE_HEADERS });
    const db = getServerDb();
    // A signed device cookie plus a per-order server grant is necessary; UUID possession is insufficient.
    if (!guestDeviceHash(req) && !req.headers.get("authorization"))
      throw new ApiAccessError(
        "Guest orders require their original device. Contact the cafe for recovery.",
        403,
      );
    const orders: Record<string, unknown>[] = [];
    for (const id of [...new Set(orderIds)]) {
      try {
        const access = await requireOrderAccess(req, id, {
          scope: "read",
          allowStaff: true,
          db,
        });
        if (access.order.customer_id) continue;
        const { data: items, error } = await db
          .from("order_items")
          .select("id,name,quantity")
          .eq("order_id", id);
        if (error)
          throw new ApiAccessError(
            "Order details are temporarily unavailable.",
            503,
          );
        orders.push({ ...publicOrder(access.order), items: items ?? [] });
      } catch (error) {
        // Batch lookup reveals no information for unauthorized IDs, while infrastructure failures surface.
        if (
          !(error instanceof ApiAccessError) ||
          ![403, 404].includes(error.status)
        )
          throw error;
      }
    }
    orders.sort(
      (a, b) =>
        Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)),
    );
    return NextResponse.json({ orders }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return apiAccessErrorResponse(error);
  }
}
