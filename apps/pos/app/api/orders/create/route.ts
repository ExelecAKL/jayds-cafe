import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CatalogValidationError,
  findSubmission,
  priceCatalogItems,
  submissionIdentity,
  submitAtomicOrder,
  type SubmittedItem,
} from "@cafeos/shared/inventory/orders";
import { cashierRpc } from "../../../../lib/server";
import { calculateFinancials } from "@cafeos/shared/finance/calculations";
let admin: SupabaseClient | null = null;
function database() {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new Error("Missing Supabase admin environment variables");
    admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
export async function POST(req: NextRequest) {
  try {
    const db = database();
    const token = req.headers
      .get("Authorization")
      ?.replace(/^Bearer /, "")
      .trim();
    if (!token)
      return NextResponse.json(
        { error: "Missing staff session" },
        { status: 401 },
      );
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user)
      return NextResponse.json(
        { error: "Invalid staff session" },
        { status: 401 },
      );
    const { data: staff, error: roleError } = await db
      .from("profiles")
      .select("role,is_approved")
      .eq("id", data.user.id)
      .maybeSingle();
    if (roleError)
      return NextResponse.json(
        { error: "Failed to verify staff session" },
        { status: 500 },
      );
    if (
      !staff ||
      !["staff", "admin"].includes(staff.role) ||
      staff.is_approved !== true
    )
      return NextResponse.json(
        { error: "Approved staff access required" },
        { status: 403 },
      );
    const body = (await req.json()) as {
      items?: SubmittedItem[];
      customer_id?: string;
      parked?: boolean;
      parked_order_id?: string;
      points_redeemed?: number;
      notes?: string;
      payment_method?: string;
    };
    if (!Array.isArray(body.items) || !body.items.length)
      return NextResponse.json({ error: "No items in order" }, { status: 400 });
    const identity = submissionIdentity(req, "pos", data.user.id, body);
    const previous = await findSubmission(db, identity);
    if (previous) return NextResponse.json(previous);
    const items = await priceCatalogItems(db, body.items, "base");
    const subtotal =
      Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) /
      100;
    const parked = body.parked === true;
    const customerId = body.customer_id || null;
    const points = parked ? 0 : Number(body.points_redeemed ?? 0);
    if (
      !Number.isSafeInteger(points) ||
      points < 0 ||
      points > Math.floor(subtotal * 10) ||
      (points > 0 && !customerId)
    )
      throw new CatalogValidationError("Invalid points amount", 400);
    if (customerId) {
      const { data: customer, error: customerError } = await db
        .from("profiles")
        .select("id,points")
        .eq("id", customerId)
        .maybeSingle();
      if (customerError || !customer)
        throw new CatalogValidationError("Customer account not found", 400);
      if (points > customer.points)
        throw new CatalogValidationError("Insufficient points");
    }
    const discount = points / 10;
    const order = {
      customer_id: customerId,
      order_type: "pickup",
      order_source: "pos",
      payment_method: body.payment_method === "maya" ? "maya" : "cash",
      subtotal,
      total: Math.round((subtotal - discount) * 100) / 100,
      discount,
      financial_breakdown: calculateFinancials({ items, points }),
      points_redeemed: points,
      notes: parked ? "[PARKED] " + (body.notes ?? "") : body.notes || null,
      is_parked: parked,
    };
    const result = parked
      ? await cashierRpc(db, "pos_save_parked", {
          p_actor: data.user.id,
          p_order: order,
          p_items: items,
          p_key: identity.key,
          p_fingerprint: identity.fingerprint,
          p_existing: body.parked_order_id ?? null,
        })
      : await submitAtomicOrder(db, order, items, identity, data.user.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CatalogValidationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("POS order creation failed:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 },
    );
  }
}
