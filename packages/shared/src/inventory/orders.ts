import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export class CatalogValidationError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}
interface Selected {
  variant_group: string;
  label: string;
  price_modifier: number;
}
interface CatalogRow {
  id: string;
  name: string;
  price: number;
  status: string;
  is_available: boolean;
  manually_available?: boolean;
  category?: { is_active: boolean; status: string } | null;
  variants: (Selected & { applicable_items: string[] | null })[];
}
export interface SubmittedItem {
  menu_item_id: string;
  quantity: number;
  price: number;
  subtotal?: number;
  variants: unknown[];
  notes?: string | null;
}
const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
export async function priceCatalogItems(
  db: SupabaseClient,
  input: SubmittedItem[],
  priceMode: "base" | "inclusive" = "inclusive",
) {
  const { data, error } = await db
    .from("menu_items")
    .select(
      "id,name,price,status,is_available,manually_available,category:categories(is_active,status),variants:item_variants(variant_group,label,price_modifier,applicable_items)",
    )
    .in("id", [...new Set(input.map((item) => item.menu_item_id))]);
  if (error)
    throw new CatalogValidationError("Failed to load current menu prices", 500);
  const catalog = new Map(
    ((data ?? []) as unknown as CatalogRow[]).map((row) => [row.id, row]),
  );
  return input.map((item) => {
    const row = catalog.get(item.menu_item_id);
    if (
      !row ||
      row.status !== "active" ||
      !(row.manually_available ?? row.is_available) ||
      (row.category &&
        (!row.category.is_active || row.category.status === "archived"))
    )
      throw new CatalogValidationError(
        "An item is no longer available. Please refresh your cart.",
      );
    if (
      !Number.isSafeInteger(Number(item.quantity)) ||
      Number(item.quantity) <= 0 ||
      !Array.isArray(item.variants)
    )
      throw new CatalogValidationError("Invalid item quantity or options", 400);
    const groups = new Set<string>();
    const variants = item.variants.map((raw) => {
      if (
        !raw ||
        typeof raw !== "object" ||
        !("label" in raw) ||
        !("variant_group" in raw)
      )
        throw new CatalogValidationError(
          `Invalid customization for ${row.name}`,
          400,
        );
      const variant = row.variants.find(
        (v) =>
          v.label === raw.label &&
          v.variant_group === raw.variant_group &&
          (!v.applicable_items || v.applicable_items.includes(row.id)),
      );
      const groupKey =
        variant?.variant_group === "add_on"
          ? "add_on:" + variant.label
          : variant?.variant_group;
      if (!variant || !groupKey || groups.has(groupKey))
        throw new CatalogValidationError(
          `A customization for ${row.name} has changed. Please add the item again.`,
        );
      groups.add(groupKey);
      return {
        variant_group: variant.variant_group,
        label: variant.label,
        price_modifier: Number(variant.price_modifier),
      };
    });
    const price = money(
      Number(row.price) +
        variants.reduce((sum, variant) => sum + variant.price_modifier, 0),
    );
    const subtotal = money(price * Number(item.quantity));
    const expectedSubmitted = priceMode === "base" ? Number(row.price) : price;
    if (
      !Number.isFinite(Number(item.price)) ||
      money(Number(item.price)) !== money(expectedSubmitted) ||
      price < 0 ||
      (item.subtotal !== undefined && money(Number(item.subtotal)) !== subtotal)
    )
      throw new CatalogValidationError(
        `The price of ${row.name} has changed. Please add it to your cart again.`,
      );
    return {
      menu_item_id: row.id,
      name: row.name,
      price,
      quantity: Number(item.quantity),
      subtotal,
      variants,
      notes: item.notes || null,
    };
  });
}
export function submissionIdentity(
  req: Request,
  source: string,
  actor: string | null,
  body: unknown,
) {
  const raw = req.headers.get("Idempotency-Key") ?? randomUUID();
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(raw))
    throw new CatalogValidationError("Invalid submission key", 400);
  return {
    key: `${source}:${actor ?? "guest"}:${raw}`,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex"),
  };
}
export async function findSubmission(
  db: SupabaseClient,
  identity: { key: string; fingerprint: string },
) {
  const { data, error } = await db
    .from("orders")
    .select("id,order_number,total,points_redeemed,request_fingerprint")
    .eq("idempotency_key", identity.key)
    .maybeSingle();
  if (error)
    throw new CatalogValidationError(
      error.code === "42703" || error.code === "PGRST204"
        ? "The inventory database upgrade must be applied before accepting orders."
        : "Failed to verify submission",
      503,
    );
  if (!data) return null;
  if (data.request_fingerprint !== identity.fingerprint)
    throw new CatalogValidationError(
      "Submission key reused with different data",
    );
  return {
    id: data.id,
    order_number: data.order_number,
    total: data.total,
    points_redeemed: data.points_redeemed,
  };
}
export async function submitAtomicOrder(
  db: SupabaseClient,
  order: Record<string, unknown>,
  items: unknown[],
  identity: { key: string; fingerprint: string },
  actor: string | null,
  voucher: string | null = null,
) {
  const { data, error } = await db.rpc("inv_create_order", {
    p_order: order,
    p_items: items,
    p_key: identity.key,
    p_actor: actor,
    p_voucher: voucher,
    p_fingerprint: identity.fingerprint,
  });
  if (error)
    throw new CatalogValidationError(
      error.code === "PGRST202"
        ? "The inventory database upgrade must be applied before accepting orders."
        : error.code === "P0001"
          ? error.message
          : "Checkout is temporarily unavailable. Your bag is saved. Please retry or contact the café.",
      error.code === "P0001" ? 409 : 503,
    );
  return data as {
    id: string;
    order_number: string;
    total: number;
    points_redeemed: number;
  };
}
