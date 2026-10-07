import { NextRequest, NextResponse } from "next/server";
import {
  ApiAccessError,
  PRIVATE_HEADERS,
  apiAccessErrorResponse,
  orderPickupCredentials,
  publicOrder,
  requireOrderAccess,
} from "../../../../lib/server-access";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { db, order, canManage } = await requireOrderAccess(req, id, {
      scope: "read",
      allowStaff: true,
    });
    const [items, history, qr] = await Promise.all([
      db
        .from("order_items")
        .select(
          "id,menu_item_id,name,price,quantity,variants,subtotal,notes,created_at",
        )
        .eq("order_id", order.id)
        .order("created_at"),
      db
        .from("order_status_history")
        .select("previous_status,new_status,created_at")
        .eq("order_id", order.id)
        .order("created_at"),
      orderPickupCredentials(db, order, canManage),
    ]);
    if (items.error || history.error)
      throw new ApiAccessError(
        "Order details are temporarily unavailable.",
        503,
      );
    return NextResponse.json(
      {
        order: {
          ...publicOrder(order),
          items: items.data ?? [],
          status_history: history.data ?? [],
          ...qr,
        },
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return apiAccessErrorResponse(error);
  }
}
