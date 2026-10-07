import { createAdminSupabaseClient } from "@cafeos/shared/supabase/server";
import { readCustomerBranch } from "./lib";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(
      await readCustomerBranch(createAdminSupabaseClient()),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Branch settings are unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
