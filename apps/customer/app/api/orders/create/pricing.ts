import {
  priceCatalogItems,
  CatalogValidationError,
} from "@cafeos/shared/inventory/orders";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateFinancials } from "@cafeos/shared/finance/calculations";
import { readQuoteToken } from "../../lalamove/quote-token";
import { readCustomerBranch } from "../../branch/lib";
import { withinCoverage } from "../../../../lib/location";
import {
  assertVoucherTier,
  VoucherEligibilityError,
} from "../../../../lib/voucher-eligibility";

export class OrderValidationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

interface Voucher {
  id: string;
  target_tier: string | null;
  uses_count: number;
  max_uses: number | null;
  valid_from: string | null;
  valid_until: string | null;
  min_order_amount: number;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  application_mode: "whole_order" | "selected_items";
  applicable_item_ids: string[] | null;
  max_discount_amount: number | null;
}

interface PricingInput {
  order_type: string;
  payment_method: string;
  subtotal: number;
  total: number;
  discount: number;
  points_redeemed: number;
  voucher_code?: string | null;
  delivery_fee?: number;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  delivery_address?: string;
  delivery_quote_token?: string;
  items: {
    menu_item_id: string;
    quantity: number;
    price: number;
    subtotal: number;
    variants: unknown[];
    notes?: string;
  }[];
}

function money(value: number) {
  if (!Number.isFinite(value)) throw new OrderValidationError("Invalid amount");
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function matchesAmount(submitted: unknown, expected: number) {
  return (
    (typeof submitted === "number" || typeof submitted === "string") &&
    Number.isFinite(Number(submitted)) &&
    money(Number(submitted)) === money(expected)
  );
}

export async function priceOrder(
  db: SupabaseClient,
  body: PricingInput,
  userId: string | null,
) {
  if (
    !["pickup", "delivery"].includes(body.order_type) ||
    !["cash", "maya"].includes(body.payment_method)
  ) {
    throw new OrderValidationError("Invalid order type or payment method");
  }
  let items;
  try {
    items = await priceCatalogItems(db, body.items);
  } catch (error) {
    if (error instanceof CatalogValidationError)
      throw new OrderValidationError(error.message, error.status);
    throw error;
  }
  const subtotal = money(items.reduce((sum, item) => sum + item.subtotal, 0));

  let voucher: Voucher | null = null;
  let voucherDiscount = 0;
  if (body.voucher_code) {
    if (typeof body.voucher_code !== "string")
      throw new OrderValidationError("Invalid voucher code");
    const { data: voucherData, error: voucherError } = await db
      .from("vouchers")
      .select(
        "id, target_tier, uses_count, max_uses, valid_from, valid_until, min_order_amount, discount_type, discount_value, application_mode, applicable_item_ids, max_discount_amount",
      )
      .eq("code", body.voucher_code.trim().toUpperCase())
      .eq("is_active", true)
      .maybeSingle();
    if (voucherError)
      throw new OrderValidationError("Failed to validate voucher", 500);
    if (!voucherData) throw new OrderValidationError("Invalid voucher code");
    voucher = voucherData as Voucher;
    try {
      await assertVoucherTier(db, voucher.target_tier, userId);
    } catch (error) {
      if (error instanceof VoucherEligibilityError)
        throw new OrderValidationError(error.message, error.status);
      throw error;
    }
    const now = Date.now();
    if (
      (voucher.valid_from && Date.parse(voucher.valid_from) > now) ||
      (voucher.valid_until && Date.parse(voucher.valid_until) < now)
    ) {
      throw new OrderValidationError("This voucher is not currently valid");
    }
    if (voucher.max_uses !== null && voucher.uses_count >= voucher.max_uses) {
      throw new OrderValidationError("Voucher has reached maximum uses");
    }
    if (subtotal < Number(voucher.min_order_amount ?? 0))
      throw new OrderValidationError(
        "The minimum order amount for this voucher has not been reached",
      );
    const requiredIds = voucher.applicable_item_ids ?? [];
    if (
      requiredIds.length &&
      !items.some((item) => requiredIds.includes(item.menu_item_id))
    ) {
      throw new OrderValidationError(
        "Your cart does not contain the items required for this voucher",
      );
    }
    const base =
      voucher.application_mode === "selected_items" && requiredIds.length
        ? items
            .filter((item) => requiredIds.includes(item.menu_item_id))
            .reduce((sum, item) => sum + item.subtotal, 0)
        : subtotal;
    voucherDiscount =
      voucher.discount_type === "percentage"
        ? (base * Number(voucher.discount_value)) / 100
        : Number(voucher.discount_value);
    if (
      voucher.discount_type === "percentage" &&
      Number(voucher.max_discount_amount) > 0
    ) {
      voucherDiscount = Math.min(
        voucherDiscount,
        Number(voucher.max_discount_amount),
      );
    }
    voucherDiscount = money(Math.max(0, Math.min(base, voucherDiscount)));
  }

  const pointsToRedeem = Number(body.points_redeemed ?? 0);
  if (
    !Number.isSafeInteger(pointsToRedeem) ||
    pointsToRedeem < 0 ||
    (pointsToRedeem > 0 && !userId)
  ) {
    throw new OrderValidationError("Invalid points amount");
  }
  if (pointsToRedeem > 0) {
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("points")
      .eq("id", userId!)
      .single();
    if (profileError)
      throw new OrderValidationError("Failed to verify points balance", 500);
    const maxPoints = Math.min(
      profile?.points ?? 0,
      Math.floor(money(subtotal - voucherDiscount) * 10),
    );
    if (pointsToRedeem > maxPoints)
      throw new OrderValidationError(
        `Only ${maxPoints} points can be redeemed for this order.`,
      );
  }

  let deliveryFee = 0;
  let quotationId: string | null = null;
  if (body.order_type === "delivery") {
    const branch = await readCustomerBranch(db);
    if (!withinCoverage(body.delivery_lat, body.delivery_lng, branch))
      throw new OrderValidationError(
        "Choose a destination within the café delivery area. Pickup is available from anywhere.",
        409,
      );
    const quote = readQuoteToken(body.delivery_quote_token);
    if (
      !quote ||
      quote.lat !== Number(body.delivery_lat) ||
      quote.lng !== Number(body.delivery_lng) ||
      quote.address !== body.delivery_address ||
      quote.branchVersion !== branch.version ||
      !matchesAmount(body.delivery_fee, quote.fee)
    ) {
      throw new OrderValidationError(
        "Your delivery quote is missing, expired, or changed. Please calculate it again.",
        409,
      );
    }
    if (body.payment_method !== "maya")
      throw new OrderValidationError("Delivery orders require Maya payment");
    deliveryFee = money(quote.fee);
    quotationId = quote.quotationId;
  }
  const discount = money(voucherDiscount + pointsToRedeem / 10);
  const total = money(Math.max(0, subtotal - discount) + deliveryFee);
  const financialBreakdown = calculateFinancials({
    items,
    points: pointsToRedeem,
    deliveryFee,
    promotion: voucher
      ? {
          kind: voucher.discount_type,
          value: Number(voucher.discount_value),
          cap:
            voucher.discount_type === "percentage"
              ? voucher.max_discount_amount
              : null,
          itemIds:
            voucher.application_mode === "selected_items"
              ? (voucher.applicable_item_ids ?? [])
              : [],
        }
      : undefined,
  });
  if (
    !matchesAmount(body.subtotal, subtotal) ||
    !matchesAmount(body.discount, discount) ||
    !matchesAmount(body.total, total)
  ) {
    throw new OrderValidationError(
      "Your order total has changed. Please refresh your cart and checkout again.",
      409,
    );
  }
  return {
    items,
    subtotal,
    discount,
    total,
    deliveryFee,
    quotationId,
    pointsToRedeem,
    pointsEarned: userId ? Math.floor(total / 10) : 0,
    voucher,
    financialBreakdown,
  };
}
