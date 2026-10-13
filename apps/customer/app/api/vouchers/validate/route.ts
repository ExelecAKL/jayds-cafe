// apps/customer/app/api/vouchers/validate/route.ts
// Server-side voucher validation — never expose logic to client

import { NextRequest, NextResponse } from "next/server";
import {
  JsonBodyError,
  readJsonBody,
} from "@cafeos/shared/server/request-body";
import { createAdminSupabaseClient } from "@cafeos/shared/supabase/server";
import { requireCustomer, assertSameOrigin, ApiAccessError, apiAccessErrorResponse } from "../../../../lib/server-access";
import { assertVoucherTier, VoucherEligibilityError } from "../../../../lib/voucher-eligibility";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const { code, subtotal, itemIds = [] } = await readJsonBody(req);

    if (typeof code !== "string" || !code.trim() || code.length > 100 || typeof subtotal !== "number" || !Number.isFinite(subtotal) || subtotal < 0 || !Array.isArray(itemIds) || itemIds.length > 100 || itemIds.some(id => typeof id !== "string")) {
      return NextResponse.json(
        { error: "Enter a valid voucher code and cart." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createAdminSupabaseClient();

    // Find voucher by code
    const { data: voucher, error: findError } = await supabaseAdmin
      .from("vouchers")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .eq("is_active", true)
      .single();

    if (findError || !voucher) {
      return NextResponse.json(
        { error: "Invalid voucher code" },
        { status: 404 },
      );
    }
    if (voucher.target_tier?.trim()) {
      const { userId } = await requireCustomer(req);
      await assertVoucherTier(supabaseAdmin, voucher.target_tier, userId);
    }

    // Check validity period
    const now = new Date();
    if (voucher.valid_from && new Date(voucher.valid_from) > now) {
      return NextResponse.json(
        { error: "This voucher is not yet active" },
        { status: 400 },
      );
    }
    if (voucher.valid_until && new Date(voucher.valid_until) < now) {
      return NextResponse.json(
        { error: "This voucher has expired" },
        { status: 400 },
      );
    }

    // Check max uses
    if (voucher.max_uses !== null && voucher.uses_count >= voucher.max_uses) {
      return NextResponse.json(
        { error: "This voucher has reached its maximum uses" },
        { status: 400 },
      );
    }

    // Check minimum order amount
    if (voucher.min_order_amount && subtotal < voucher.min_order_amount) {
      return NextResponse.json(
        {
          error: `Minimum order of ₱${voucher.min_order_amount.toFixed(0)} required for this voucher`,
        },
        { status: 400 },
      );
    }

    // Advanced Check: Required Items
    if (voucher.applicable_item_ids && voucher.applicable_item_ids.length > 0) {
      const hasRequiredItem = (itemIds as string[]).some((id) =>
        voucher.applicable_item_ids.includes(id),
      );
      if (!hasRequiredItem) {
        return NextResponse.json(
          {
            error:
              "Your cart does not contain the specific items required for this voucher.",
          },
          { status: 400 },
        );
      }
    }

    return NextResponse.json({
      code: voucher.code,
      description: voucher.description,
      discount_type: voucher.discount_type,
      discount_value: Number(voucher.discount_value),
      applicable_item_ids: voucher.applicable_item_ids,
      application_mode: voucher.application_mode,
      max_discount_amount: voucher.max_discount_amount,
    });
  } catch (error) {
    if (error instanceof ApiAccessError) return apiAccessErrorResponse(error);
    if (error instanceof VoucherEligibilityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof JsonBodyError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    return NextResponse.json(
      { error: "Failed to validate voucher" },
      { status: 500 },
    );
  }
}
