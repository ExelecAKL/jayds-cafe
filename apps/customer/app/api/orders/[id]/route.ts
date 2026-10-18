import { NextRequest, NextResponse } from "next/server";
import { acceptedTicketTax } from "../../../../lib/accepted-ticket";
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
    const [items, history, qr, financials] = await Promise.all([
      db
        .from("order_items")
        .select(
          "id,menu_item_id,name,price,quantity,variants,subtotal,notes,created_at,menu_item:menu_items(image_url)",
        )
        .eq("order_id", order.id)
        .order("created_at"),
      db
        .from("order_status_history")
        .select("previous_status,new_status,created_at")
        .eq("order_id", order.id)
        .order("created_at"),
      orderPickupCredentials(db, order, canManage),
      db
        .from("order_financials")
        .select("breakdown")
        .eq("order_id", order.id)
        .maybeSingle(),
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
          items: (items.data ?? []).map(({ menu_item, ...item }) => {
            const photo = Array.isArray(menu_item) ? menu_item[0] : menu_item;
            return { ...item, image_url: photo?.image_url ?? null };
          }),
          tax_summary: financials.error
            ? null
            : acceptedTicketTax(
                financials.data?.breakdown,
                Number(order.total),
              ),
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
