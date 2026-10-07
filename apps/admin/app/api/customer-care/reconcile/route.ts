import { createClient } from "@supabase/supabase-js";
import {
  JsonBodyError,
  readJsonBody,
} from "@cafeos/shared/server/request-body";

export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "no-store" };

// This proxy forwards the approved Admin's own session to the existing checked
// customer endpoints. It never uses a service-role client or starts a provider attempt.
export async function POST(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer "))
    return Response.json(
      { error: "Sign in as an approved Admin to review provider references." },
      { status: 401, headers: responseHeaders },
    );
  try {
    const body = await readJsonBody<{
      orderId?: unknown;
      provider?: unknown;
      providerId?: unknown;
    }>(req);
    const { orderId, provider } = body;
    const providerId =
      typeof body.providerId === "string" ? body.providerId.trim() : "";
    if (
      typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        orderId,
      ) ||
      (provider !== "maya" && provider !== "lalamove") ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(providerId)
    ) {
      return Response.json(
        { error: "Enter the order and exact existing provider reference." },
        { status: 400, headers: responseHeaders },
      );
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey)
      return Response.json(
        { error: "Admin reference review is not configured." },
        { status: 503, headers: responseHeaders },
      );
    const db = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: identity, error: identityError } = await db.auth.getUser(
      authorization.slice(7),
    );
    if (identityError || !identity.user)
      return Response.json(
        { error: "Your Admin session expired. Sign in again." },
        { status: 401, headers: responseHeaders },
      );
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("role,is_approved")
      .eq("id", identity.user.id)
      .maybeSingle();
    if (profileError)
      return Response.json(
        { error: "Admin access could not be verified. Try again." },
        { status: 503, headers: responseHeaders },
      );
    if (profile?.role !== "admin" || profile.is_approved !== true)
      return Response.json(
        { error: "An approved Admin account is required." },
        { status: 403, headers: responseHeaders },
      );
    const base = new URL(
      process.env.NEXT_PUBLIC_CUSTOMER_URL?.trim() || "http://localhost:4000",
    );
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password
    )
      return Response.json(
        { error: "The customer application URL is not configured correctly." },
        { status: 503, headers: responseHeaders },
      );
    const endpoint =
      provider === "maya" ? "/api/maya/checkout" : "/api/lalamove/dispatch";
    // Both fields are explicit and nonempty. Their presence selects the existing
    // retrieve-and-associate branch, so no checkout/dispatch fallback is permitted.
    const payload =
      provider === "maya"
        ? { orderId, reconcileCheckoutId: providerId }
        : { orderId, reconcileOrderId: providerId };
    const result = await fetch(new URL(endpoint, base), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(40_000),
    });
    const data = (await result.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!result.ok)
      return Response.json(
        {
          error:
            typeof data?.error === "string"
              ? data.error
              : "Provider reference review was not completed. Check the merchant dashboard and retain the case.",
        },
        { status: result.status, headers: responseHeaders },
      );
    if (data?.reconciled !== true)
      return Response.json(
        {
          error:
            "The provider reference was not confirmed. Retain the case for review.",
        },
        { status: 409, headers: responseHeaders },
      );
    return Response.json(
      {
        reconciled: true,
        ...(provider === "maya"
          ? { paymentStatus: data.paymentStatus }
          : { lalamoveOrderId: data.lalamoveOrderId }),
      },
      { headers: responseHeaders },
    );
  } catch (failure) {
    if (failure instanceof JsonBodyError)
      return Response.json(
        {
          error:
            failure.status === 400
              ? "Enter a valid reference review request."
              : failure.message,
        },
        { status: failure.status, headers: responseHeaders },
      );
    const invalidBody = failure instanceof SyntaxError;
    return Response.json(
      {
        error: invalidBody
          ? "Enter a valid reference review request."
          : "Provider reference review could not be confirmed. Retain the reference and retry.",
      },
      { status: invalidBody ? 400 : 503, headers: responseHeaders },
    );
  }
}
