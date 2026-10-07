import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerBranch } from "@cafeos/shared/customer/types";

export async function readCustomerBranch(
  db: SupabaseClient,
): Promise<CustomerBranch> {
  const { data, error } = await db.rpc("get_customer_branch");
  if (error || !data) throw new Error("Branch settings are unavailable.");
  return data as CustomerBranch;
}
