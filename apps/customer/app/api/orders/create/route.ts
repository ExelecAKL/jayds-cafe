import {
  CatalogValidationError,
  findSubmission,
  submissionIdentity,
  submitAtomicOrder,
} from "@cafeos/shared/inventory/orders";
// apps/customer/app/api/orders/create/route.ts
// Server-side order creation — supports both authenticated and guest users.
// Uses service role to bypass RLS so guests can place orders.
// Also handles: point deduction (debit-first), voucher consumption.

import { NextResponse } from "next/server";
import {
  JsonBodyError,
  ORDER_BODY_LIMIT,
  readJsonBody,
} from "@cafeos/shared/server/request-body";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { OrderValidationError, priceOrder } from "./pricing";
import {
  assertSameOrigin,
  issueGuestOrderGrant,
  ApiAccessError,
  apiAccessErrorResponse,
} from "../../../../lib/server-access";
import { LEGAL_VERSION } from "../../../../lib/legal";

let supabaseAdminClient: SupabaseClient | null = null;

function getSupabaseAdmin() {
  if (!supabaseAdminClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase admin environment variables");
    }

    supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey);
  }

  return supabaseAdminClient;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function finiteNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

interface OrderItemPayload {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  variants: unknown[];
  subtotal: number;
  notes?: string;
}

interface CreateOrderPayload {
  pickup_slot_start?: string | null;
  legal_version?: string;
  legal_acknowledged?: boolean;
  // Order fields
  order_type: string;
  payment_method: string;
  subtotal: number;
  total: number;
  discount: number;
  points_earned: number;
  points_redeemed: number;
  notes: string | null;
  pickup_confirmation_hash?: string | null;
  advance_order_key?: string | null;
  expires_at?: string | null;
  // Voucher
  voucher_code?: string | null;
  // Delivery fields (optional)
  delivery_name?: string;
  delivery_phone?: string;
  delivery_address?: string;
  delivery_fee?: number;
  delivery_quote_token?: string;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  // Items
  items: OrderItemPayload[];
}

function validateOrderItems(items: OrderItemPayload[]): string | null {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];

    if (!item.menu_item_id || !UUID_PATTERN.test(item.menu_item_id)) {
      return `Invalid item in cart at position ${index + 1}. Please remove it and add it again.`;
    }

    const price = finiteNumber(item.price);
    const quantity = finiteNumber(item.quantity);
    const subtotal = finiteNumber(item.subtotal);

    if (
      price === null ||
      price < 0 ||
      quantity === null ||
      quantity <= 0 ||
      subtotal === null ||
      subtotal < 0
    ) {
      return `Invalid quantity or price for ${item.name || `item ${index + 1}`}.`;
    }

    if (!Array.isArray(item.variants)) {
      return `Invalid variants for ${item.name || `item ${index + 1}`}.`;
    }
  }

  return null;
}

function getAdvanceOrderKey(
  req: Request,
  userId: string | null,
  rawKey: unknown,
) {
  if (userId) return `user:${userId}`;

  if (typeof rawKey === "string") {
    const trimmed = rawKey.trim();
    if (trimmed.length >= 16 && trimmed.length <= 256) {
      return `guest:${createHash("sha256").update(trimmed).digest("hex")}`;
    }
  }

  const forwardedFor =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const userAgent = req.headers.get("user-agent") || "";
  return `guest:${createHash("sha256").update(`${forwardedFor}:${userAgent}`).digest("hex")}`;
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Authenticate user (optional — guests won't have a token)
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data, error: authError } =
        await supabaseAdmin.auth.getUser(token);
      if (authError || !data.user) {
        return NextResponse.json(
          { error: "Invalid session. Please sign in again." },
          { status: 401 },
        );
      }
      const authenticatedUserId = data?.user?.id ?? null;

      if (authenticatedUserId) {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", authenticatedUserId)
          .maybeSingle();

        if (profileError) {
          console.error("Profile lookup error:", profileError);
          return NextResponse.json(
            { error: "Failed to verify customer profile" },
            { status: 500 },
          );
        }

        if (!profile) {
          return NextResponse.json(
            {
              error:
                "Your customer profile is unavailable. Please sign in again.",
            },
            { status: 409 },
          );
        }
        userId = profile.id;
      }
    }

    const body = await readJsonBody<CreateOrderPayload>(req, {
      maxBytes: ORDER_BODY_LIMIT,
    });

    // 2. Basic validation
    if (
      !Array.isArray(body.items) ||
      body.items.length === 0 ||
      body.items.length > 200
    ) {
      return NextResponse.json({ error: "No items in order" }, { status: 400 });
    }

    if (!body.order_type || !body.payment_method) {
      return NextResponse.json(
        { error: "Missing order_type or payment_method" },
        { status: 400 },
      );
    }

    const itemValidationError = validateOrderItems(body.items);
    if (itemValidationError) {
      return NextResponse.json({ error: itemValidationError }, { status: 400 });
    }
    const identity = submissionIdentity(req, "app", userId, body);
    const previous = await findSubmission(supabaseAdmin, identity);
    if (previous) {
      const response = NextResponse.json(previous);
      if (!userId)
        await issueGuestOrderGrant(req, response, supabaseAdmin, previous.id);
      return response;
    }
    if (
      body.legal_version !== LEGAL_VERSION ||
      body.legal_acknowledged !== true
    )
      return NextResponse.json(
        {
          error:
            "Review the current Terms and Privacy Notice before placing a new order.",
        },
        { status: 409 },
      );
    if (userId) {
      const { data: ack, error: ackError } = await supabaseAdmin
        .from("legal_acknowledgements")
        .select("id")
        .eq("user_id", userId)
        .eq("version", LEGAL_VERSION)
        .maybeSingle();
      if (ackError)
        return NextResponse.json(
          { error: "Legal review is temporarily unavailable." },
          { status: 503 },
        );
      if (!ack)
        return NextResponse.json(
          {
            error:
              "Please confirm your review of the current Terms and Privacy Notice.",
          },
          { status: 409 },
        );
    }
    if (
      body.order_type === "delivery" &&
      (typeof body.delivery_name !== "string" ||
        !body.delivery_name.trim() ||
        body.delivery_name.length > 120 ||
        typeof body.delivery_phone !== "string" ||
        !/^\+?[0-9 ()-]{10,20}$/.test(body.delivery_phone))
    )
      return NextResponse.json(
        { error: "Enter a delivery recipient and valid phone number." },
        { status: 400 },
      );
    const priced = await priceOrder(supabaseAdmin, body, userId);
    const { subtotal, total, discount, pointsToRedeem } = priced;

    const isAdvancePickupOrder =
      body.order_type === "pickup" &&
      body.payment_method === "cash" &&
      !!body.pickup_confirmation_hash &&
      !!body.expires_at;
    const advanceOrderKey = isAdvancePickupOrder
      ? getAdvanceOrderKey(req, userId, body.advance_order_key)
      : null;

    if (isAdvancePickupOrder && advanceOrderKey) {
      const { count, error: limitError } = await supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("order_source", "app")
        .eq("order_type", "pickup")
        .eq("payment_method", "cash")
        .eq("payment_status", "pending")
        .eq("status", "pending")
        .eq("advance_order_key", advanceOrderKey)
        .not("pickup_confirmation_hash", "is", null)
        .gt("expires_at", new Date().toISOString());

      if (limitError) {
        console.error("Advance pickup limit check error:", limitError);
        return NextResponse.json(
          { error: "Failed to check advance pickup limit" },
          { status: 500 },
        );
      }

      if ((count ?? 0) >= 3) {
        return NextResponse.json(
          {
            error:
              "You already have 3 active advance pickup QR orders. Please scan or wait for one to expire.",
          },
          { status: 400 },
        );
      }
    }

    // 5. Build order row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderData: Record<string, any> = {
      customer_id: userId, // null for guests
      order_type: body.order_type,
      order_source: "app",
      payment_method: body.payment_method,
      payment_status: "pending",
      status: "pending",
      subtotal,
      total,
      discount,
      points_earned: priced.pointsEarned,
      points_redeemed: pointsToRedeem,
      notes: body.notes,
      pickup_slot_start: body.pickup_slot_start ?? null,
      legal_version: LEGAL_VERSION,
    };

    if (body.pickup_confirmation_hash) {
      orderData.pickup_confirmation_hash = body.pickup_confirmation_hash;
    }

    if (advanceOrderKey) {
      orderData.advance_order_key = advanceOrderKey;
    }

    if (body.expires_at) {
      orderData.expires_at = body.expires_at;
    }

    // Delivery fields
    if (body.order_type === "delivery") {
      orderData.delivery_name = body.delivery_name;
      orderData.delivery_phone = body.delivery_phone;
      orderData.delivery_address = body.delivery_address;
      orderData.delivery_fee = priced.deliveryFee;
      orderData.lalamove_quotation_id = priced.quotationId;
      orderData.delivery_lat = body.delivery_lat;
      orderData.delivery_lng = body.delivery_lng;
    }

    const order = await submitAtomicOrder(
      supabaseAdmin,
      orderData,
      priced.items,
      identity,
      userId,
      priced.voucher?.id ?? null,
    );
    const response = NextResponse.json({
      id: order.id,
      order_number: order.order_number,
    });
    if (!userId)
      await issueGuestOrderGrant(req, response, supabaseAdmin, order.id);
    return response;
  } catch (error) {
    if (error instanceof ApiAccessError || error instanceof JsonBodyError)
      return apiAccessErrorResponse(error);
    if (
      error instanceof OrderValidationError ||
      error instanceof CatalogValidationError
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Order creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
