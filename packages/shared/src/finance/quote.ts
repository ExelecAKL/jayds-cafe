import type { SupabaseClient } from "@supabase/supabase-js";
import { CatalogValidationError } from "../inventory/orders";
import { calculateFinancials, type FinancialBreakdown } from "./calculations";

export interface PaymentQuote {
  version: 1;
  currency: "PHP";
  total: number;
  breakdown: FinancialBreakdown | null;
  quotedAt: string;
}

/** Trusted canonical items only. Reads stock and tax configuration; reserves nothing. */
export async function quoteFinancials(
  db: SupabaseClient,
  input: Parameters<typeof calculateFinancials>[0],
  checkStock = true,
): Promise<FinancialBreakdown> {
  if (checkStock) {
    const { error } = await db.rpc("finance_check_quote", {
      p_items: input.items,
    });
    if (error)
      throw new CatalogValidationError(
        error.code === "PGRST202"
          ? "Checkout pricing is being updated. Please try again."
          : error.message,
        error.code === "PGRST202" ? 503 : 409,
      );
  }
  const { data, error } = await db
    .from("finance_settings")
    .select("delivery_tax_treatment")
    .eq("id", true)
    .maybeSingle();
  if (error)
    throw new CatalogValidationError(
      "Tax settings could not load. Please try again.",
      503,
    );
  const treatment = data?.delivery_tax_treatment ?? "pending";
  if (!["pending", "pass_through", "vat_inclusive"].includes(treatment))
    throw new CatalogValidationError("Tax settings need review.", 503);
  try {
    return calculateFinancials({ ...input, deliveryTaxTreatment: treatment });
  } catch (error) {
    throw new CatalogValidationError(
      error instanceof Error ? error.message : "Invalid order amounts.",
      400,
    );
  }
}

export function paymentQuote(
  breakdown: FinancialBreakdown | null,
  total?: number,
): PaymentQuote {
  return {
    version: 1,
    currency: "PHP",
    total: breakdown?.total ?? Math.round(Number(total) * 100),
    breakdown,
    quotedAt: new Date().toISOString(),
  };
}
