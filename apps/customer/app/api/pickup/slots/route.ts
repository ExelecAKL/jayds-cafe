import { createAdminSupabaseClient } from "@cafeos/shared/supabase/server";
import { manilaDate } from "@cafeos/shared/customer/scheduling";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? manilaDate();
  const units = Number(url.searchParams.get("item_units") ?? 1);
  const headers = { "Cache-Control": "no-store" };
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isSafeInteger(units) ||
    units < 1 ||
    units > 10000
  ) {
    return Response.json(
      { error: "Choose a valid date and cart quantity." },
      { status: 400, headers },
    );
  }
  try {
    const { data, error } = await createAdminSupabaseClient().rpc(
      "get_customer_pickup_slots",
      { p_date: date, p_item_units: units },
    );
    if (error)
      return Response.json(
        {
          error:
            error.code === "P0001" ||
            error.code === "22007" ||
            error.code === "22008"
              ? "Choose today or tomorrow and a valid date."
              : "Pickup times are unavailable. Please try again.",
        },
        {
          status: ["P0001", "22007", "22008"].includes(error.code) ? 400 : 503,
          headers,
        },
      );
    return Response.json(data, { headers });
  } catch {
    return Response.json(
      { error: "Pickup times are unavailable. Please try again." },
      { status: 503, headers },
    );
  }
}
