import { createClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@cafeos/shared/supabase/server";
export class AdminAccessError extends Error {
  constructor(
    message: string,
    readonly status = 403,
  ) {
    super(message);
  }
}
export async function requireAdminRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer \S+$/.test(authorization))
    throw new AdminAccessError("Sign in to Admin.", 401);
  const allowed = new Set([new URL(request.url).origin]);
  for (const value of [
    process.env.NEXT_PUBLIC_ADMIN_URL,
    process.env.NEXT_PUBLIC_CUSTOMER_URL,
  ]) {
    if (value) {
      try {
        allowed.add(new URL(value).origin);
      } catch {}
    }
  }
  const origin = request.headers.get("origin");
  if (origin && !allowed.has(origin))
    throw new AdminAccessError("Open this action from Admin.");
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: authorization },
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(12000) }),
      },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await db.auth.getUser(authorization.slice(7));
  if (error || !data.user)
    throw new AdminAccessError("Your session expired. Sign in again.", 401);
  const profile = await db
    .from("profiles")
    .select("role,is_approved")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile.error)
    throw new AdminAccessError(
      "Admin access could not be checked. Try again.",
      503,
    );
  if (profile.data?.role !== "admin" || profile.data?.is_approved !== true)
    throw new AdminAccessError("Approved Admin access is required.");
  return { db: createAdminSupabaseClient(), actor: data.user.id };
}
