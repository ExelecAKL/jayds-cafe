import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiAccessError } from "./server-access";

export type MayaReturnOutcome = "success" | "failed" | "cancelled";
export function resolveMayaReturnOrigin(req: Request): string {
  const normalize = (value: string | undefined | null) => {
    if (!value?.trim()) return null;
    try {
      const url = new URL(value.trim());
      return ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
        ? url.origin
        : null;
    } catch {
      return null;
    }
  };
  const configured = normalize(process.env.NEXT_PUBLIC_CUSTOMER_URL);
  const direct = normalize(req.url);
  const customerOrigins = [
    configured,
    direct,
    ...(process.env.CUSTOMER_ALLOWED_ORIGINS?.split(",").map(normalize) ?? []),
  ];
  const supplied = req.headers.get("origin");
  const browser = normalize(supplied);
  // Preserve the customer's actual, trusted origin. A LAN phone must return to
  // the laptop's address, not to its own localhost. Cashier proxies still return
  // to the customer portal rather than an unsupported POS /orders/:id route.
  if (supplied) {
    if (browser && customerOrigins.includes(browser)) return browser;
    const staffOrigins = [
      process.env.NEXT_PUBLIC_POS_URL,
      process.env.POS_UPSTREAM_URL,
    ].map(normalize);
    if (!browser || !staffOrigins.includes(browser))
      throw new ApiAccessError("This request origin is not allowed.", 403);
  }
  const fallback = configured ?? direct;
  if (!fallback)
    throw new ApiAccessError(
      "Payment return setup is temporarily unavailable.",
      503,
    );
  return fallback;
}
export const MAYA_RETURN_AGE_SECONDS = 30 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface MayaReturnState {
  orderId: string;
  attemptId: string;
  outcome: MayaReturnOutcome;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}
function signature(payload: string) {
  const secret =
    process.env.CUSTOMER_GUEST_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret)
    throw new ApiAccessError(
      "Payment return verification is temporarily unavailable.",
      503,
    );
  return createHmac("sha256", secret)
    .update(`customer.maya-return.v1:${payload}`)
    .digest();
}
export function createMayaReturnState(
  orderId: string,
  attemptId: string,
  outcome: MayaReturnOutcome,
  now = Date.now(),
): string {
  if (
    !UUID.test(orderId) ||
    !UUID.test(attemptId) ||
    !["success", "failed", "cancelled"].includes(outcome)
  )
    throw new ApiAccessError(
      "Payment return setup is temporarily unavailable.",
      503,
    );
  const issuedAt = Math.floor(now / 1000);
  const state: MayaReturnState = {
    orderId,
    attemptId,
    outcome,
    issuedAt,
    expiresAt: issuedAt + MAYA_RETURN_AGE_SECONDS,
    nonce: randomBytes(16).toString("hex"),
  };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}
export function readMayaReturnState(
  token: unknown,
  now = Date.now(),
): MayaReturnState | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (
    parts.length !== 2 ||
    !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  )
    return null;
  const [payload, suppliedSignature] = parts;
  const supplied = Buffer.from(suppliedSignature, "base64url"),
    expected = signature(payload);
  if (
    supplied.toString("base64url") !== suppliedSignature ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return null;
  try {
    const state = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as MayaReturnState;
    const current = Math.floor(now / 1000);
    if (
      !state ||
      !UUID.test(state.orderId) ||
      !UUID.test(state.attemptId) ||
      !["success", "failed", "cancelled"].includes(state.outcome) ||
      !Number.isSafeInteger(state.issuedAt) ||
      !Number.isSafeInteger(state.expiresAt) ||
      state.issuedAt > current + 30 ||
      state.expiresAt - state.issuedAt !== MAYA_RETURN_AGE_SECONDS ||
      state.expiresAt <= current ||
      !/^[a-f0-9]{32}$/.test(state.nonce)
    )
      return null;
    return state;
  } catch {
    return null;
  }
}
export function createMayaReturnUrls(
  origin: string,
  orderId: string,
  attemptId: string,
) {
  const urls = Object.fromEntries(
    (["success", "failed", "cancelled"] as const).map((outcome) => {
      const url = new URL(`/orders/${orderId}`, origin);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new ApiAccessError(
          "Payment return setup is temporarily unavailable.",
          503,
        );
      url.searchParams.set("status", outcome);
      url.searchParams.set(
        "mayaReturnState",
        createMayaReturnState(orderId, attemptId, outcome),
      );
      return [outcome, url.toString()];
    }),
  ) as Record<MayaReturnOutcome, string>;
  return {
    success: urls.success,
    failure: urls.failed,
    cancel: urls.cancelled,
  };
}
