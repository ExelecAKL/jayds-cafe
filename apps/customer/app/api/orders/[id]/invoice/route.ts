import { NextRequest, NextResponse } from "next/server";
import {
  requireOrderAccess,
  PRIVATE_HEADERS,
  apiAccessErrorResponse,
  ApiAccessError,
} from "../../../../../lib/server-access";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { db, order } = await requireOrderAccess(req, id, {
      scope: "read",
      allowStaff: true,
    });
    const { data, error } = await db
      .from("finance_invoices")
      .select(
        "id,order_id,number,kind,issued_at,original_invoice,original_number,business,buyer,breakdown",
      )
      .eq("order_id", order.id)
      .order("issued_at");
    if (error)
      throw new ApiAccessError(
        "Invoices are temporarily unavailable. Please retry.",
        503,
      );
    return NextResponse.json(
      {
        invoices: data ?? [],
        reason: !data?.length
          ? "An invoice is issued after confirmed payment and invoice identity setup. Historical orders without tax snapshots remain unchanged."
          : null,
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return apiAccessErrorResponse(error);
  }
}
