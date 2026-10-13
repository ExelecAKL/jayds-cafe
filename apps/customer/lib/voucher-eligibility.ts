import type { SupabaseClient } from "@supabase/supabase-js";

export class VoucherEligibilityError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export async function assertVoucherTier(db: SupabaseClient, targetTier: string | null | undefined, userId: string | null) {
  const target = targetTier?.trim().toLowerCase();
  if (!target) return;
  if (!userId) throw new VoucherEligibilityError("Sign in with an eligible loyalty tier for this voucher.");
  const { data, error } = await db.from("profiles").select("loyalty_tier").eq("id", userId).maybeSingle();
  if (error) throw new VoucherEligibilityError("Loyalty eligibility could not be verified. Please retry.", 503);
  if (typeof data?.loyalty_tier !== "string" || data.loyalty_tier.trim().toLowerCase() !== target)
    throw new VoucherEligibilityError(`This voucher requires the ${targetTier?.trim()} loyalty tier.`);
}
