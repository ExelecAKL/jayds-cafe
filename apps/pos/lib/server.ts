import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CatalogValidationError } from "@cafeos/shared/inventory/orders";
let client: SupabaseClient | null = null;
export function cashierDatabase() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new CatalogValidationError(
        "The cashier server is not configured",
        503,
      );
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
export async function requireCashier(req: Request) {
  const db = cashierDatabase();
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer "))
    throw new CatalogValidationError("Sign in to the POS to continue", 401);
  const { data, error } = await db.auth.getUser(header.slice(7));
  if (error || !data.user)
    throw new CatalogValidationError(
      "Your staff session expired. Sign in again.",
      401,
    );
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role,is_approved")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError)
    throw new CatalogValidationError("Staff access could not be verified", 503);
  if (
    !profile ||
    !["staff", "admin"].includes(profile.role) ||
    profile.is_approved !== true
  )
    throw new CatalogValidationError("Approved staff access is required", 403);
  return { db, actor: data.user.id };
}
export async function cashierRpc(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await db.rpc(name, args);
  if (error)
    throw new CatalogValidationError(
      error.code === "PGRST202"
        ? "Apply the inventory and POS database upgrades before accepting sales."
        : error.message,
      error.code === "PGRST202"
        ? 503
        : error.code === "42501"
          ? 403
          : error.code === "22P02"
            ? 400
            : 409,
    );
  return data;
}
export function cashierError(error: unknown) {
  if (error instanceof CatalogValidationError)
    return Response.json({ error: error.message }, { status: error.status });
  return Response.json(
    {
      error:
        "The operation could not be confirmed. Your ticket is retained; retry with the same submission.",
    },
    { status: 500 },
  );
}
