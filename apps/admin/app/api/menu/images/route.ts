import { createClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@cafeos/shared/supabase/server";
import {
  MenuImageError,
  prepareMenuImage,
  readMenuImage,
} from "../../../../lib/menu-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return Response.json(
      { error: "Sign in to upload a photo." },
      { status: 401, headers },
    );
  const origin = request.headers.get("origin");
  const allowedOrigins = new Set([new URL(request.url).origin]);
  // Mounted /admin traffic can reach a different upstream host after a rewrite.
  // Only explicit application configuration extends the allowed origins.
  for (const configured of [
    process.env.NEXT_PUBLIC_ADMIN_URL,
    process.env.NEXT_PUBLIC_CUSTOMER_URL,
  ]) {
    if (!configured) continue;
    try {
      const url = new URL(configured);
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      )
        allowedOrigins.add(url.origin);
    } catch {
      /* Ignore invalid configuration. */
    }
  }
  if (origin && !allowedOrigins.has(origin))
    return Response.json(
      { error: "Upload the photo from Admin." },
      { status: 403, headers },
    );
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authorization },
          fetch: (input, init) =>
            fetch(input, { ...init, signal: AbortSignal.timeout(12_000) }),
        },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data: identity, error: identityError } = await db.auth.getUser(
      authorization.slice(7),
    );
    if (identityError || !identity.user)
      return Response.json(
        { error: "Your session expired. Sign in again." },
        { status: 401, headers },
      );
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("role,is_approved")
      .eq("id", identity.user.id)
      .maybeSingle();
    if (profileError)
      return Response.json(
        { error: "Admin access could not load. Try again." },
        { status: 503, headers },
      );
    if (profile?.role !== "admin" || profile.is_approved !== true)
      return Response.json(
        { error: "An approved Admin account is required." },
        { status: 403, headers },
      );
    const image = await prepareMenuImage(await readMenuImage(request));
    const storage =
      createAdminSupabaseClient().storage.from("jayds-menu-images");
    const path = `uploads/${crypto.randomUUID()}.webp`;
    const { error } = await storage.upload(path, image, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw new Error("Storage unavailable");
    return Response.json(
      { url: storage.getPublicUrl(path).data.publicUrl },
      { headers },
    );
  } catch (failure) {
    return Response.json(
      {
        error:
          failure instanceof MenuImageError
            ? failure.message
            : "Photo upload failed. Try again; your product changes are still here.",
      },
      {
        status: failure instanceof MenuImageError ? failure.status : 503,
        headers,
      },
    );
  }
}
