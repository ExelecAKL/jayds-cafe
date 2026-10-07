import { NextResponse } from "next/server";
import { readJsonBody } from "@cafeos/shared/server/request-body";
import {
  requireCustomer,
  apiAccessErrorResponse,
  assertSameOrigin,
} from "../../../../lib/server-access";
const uuid = /^[0-9a-f-]{36}$/i;
export async function GET(req: Request) {
  try {
    const { db, userId } = await requireCustomer(req);
    const { data, error } = await db
      .from("customer_favorites")
      .select("menu_item_id,configuration,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Favorites unavailable");
    return NextResponse.json(
      { items: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiAccessErrorResponse(e);
  }
}
async function change(req: Request, remove: boolean) {
  try {
    assertSameOrigin(req);
    const { db, userId } = await requireCustomer(req);
    const body = await readJsonBody(req);
    if (
      !uuid.test(body.menu_item_id) ||
      !Array.isArray(body.configuration) ||
      body.configuration.length > 30
    )
      return NextResponse.json({ error: "Invalid favorite" }, { status: 400 });
    const configuration = body.configuration
      .map((v: Record<string, unknown>) => {
        if (typeof v.variant_group !== "string" || typeof v.label !== "string")
          throw new Error("Invalid favorite");
        return { variant_group: v.variant_group, label: v.label };
      })
      .sort(
        (
          a: { variant_group: string; label: string },
          b: { variant_group: string; label: string },
        ) => JSON.stringify(a).localeCompare(JSON.stringify(b)),
      );
    const { data: product, error: catalogError } = await db
      .from("menu_items")
      .select("id,status,variants:item_variants(variant_group,label)")
      .eq("id", body.menu_item_id)
      .maybeSingle();
    if (catalogError) throw new Error("Catalog unavailable");
    if (
      !remove &&
      (!product ||
        product.status !== "active" ||
        configuration.some(
          (v: { variant_group: string; label: string }) =>
            !product.variants?.some(
              (p: { variant_group: string; label: string }) =>
                p.variant_group === v.variant_group && p.label === v.label,
            ),
        ))
    )
      return NextResponse.json(
        { error: "This product or its options are no longer published." },
        { status: 409 },
      );
    const result = remove
      ? await db
          .from("customer_favorites")
          .delete()
          .eq("user_id", userId)
          .eq("menu_item_id", body.menu_item_id)
          .eq("configuration_key", JSON.stringify(configuration))
      : await db.from("customer_favorites").upsert(
          {
            user_id: userId,
            menu_item_id: body.menu_item_id,
            configuration,
            configuration_key: JSON.stringify(configuration),
          },
          { onConflict: "user_id,menu_item_id,configuration_key" },
        );
    if (result.error) throw new Error("Favorite could not save");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiAccessErrorResponse(e);
  }
}
export function POST(req: Request) {
  return change(req, false);
}
export function DELETE(req: Request) {
  return change(req, true);
}
