import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@cafeos/shared/supabase/server";
import { JsonBodyError } from "@cafeos/shared/server/request-body";

export class ApiAccessError extends Error {
  constructor(
    message: string,
    readonly status = 403,
  ) {
    super(message);
  }
}
export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
};
export const GUEST_COOKIE = "jayds_guest_device";
const GUEST_AGE = 60 * 60 * 24 * 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Supabase returns heterogeneous stored snapshots; projections and mutation validators constrain this boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OrderRow = Record<string, any>;
export function getServerDb(): SupabaseClient {
  return createAdminSupabaseClient();
}
function secret() {
  const key =
    process.env.CUSTOMER_GUEST_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    throw new ApiAccessError("Guest access is temporarily unavailable.", 503);
  return key;
}
function digest(value: string) {
  return createHmac("sha256", secret()).update(value).digest();
}
function cookieValue(req: Request) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GUEST_COOKIE}=`))
    ?.slice(GUEST_COOKIE.length + 1);
}
function guestDevice(req: Request): string | null {
  const value = cookieValue(req);
  if (!value || value.length > 256) return null;
  const [device, expiry, signature, extra] = value.split(".");
  if (
    extra ||
    !/^[a-f0-9]{64}$/.test(device || "") ||
    !/^\d{10,13}$/.test(expiry || "") ||
    Number(expiry) <= Date.now()
  )
    return null;
  const expected = digest(`guest-cookie.v1:${device}.${expiry}`);
  const supplied = Buffer.from(signature || "", "base64url");
  return supplied.length === expected.length &&
    supplied.toString('base64url') === signature &&
    timingSafeEqual(supplied, expected)
    ? device
    : null;
}
export function guestDeviceHash(req: Request): string | null {
  const device = guestDevice(req);
  return device ? digest(`guest-device.v1:${device}`).toString("hex") : null;
}
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const allowed = [
    new URL(req.url).origin,
    process.env.NEXT_PUBLIC_CUSTOMER_URL,
    process.env.NEXT_PUBLIC_POS_URL,
    process.env.POS_UPSTREAM_URL,
    ...(process.env.CUSTOMER_ALLOWED_ORIGINS?.split(",").map((value) =>
      value.trim(),
    ) ?? []),
  ]
    .filter(Boolean)
    .map((url) => {
      try {
        return new URL(url!).origin;
      } catch {
        return "";
      }
    });
  if (!allowed.includes(origin))
    throw new ApiAccessError("This request origin is not allowed.", 403);
}
async function session(
  req: Request,
  db: SupabaseClient,
): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (!header) return null;
  if (!/^Bearer \S+$/i.test(header))
    throw new ApiAccessError("Please sign in again.", 401);
  const { data, error } = await db.auth.getUser(header.slice(7));
  if (error || !data.user)
    throw new ApiAccessError("Please sign in again.", 401);
  return data.user.id;
}
export async function requireCustomer(
  req: Request,
): Promise<{ db: SupabaseClient; userId: string }> {
  assertSameOrigin(req);
  const db = getServerDb();
  const userId = await session(req, db);
  if (!userId) throw new ApiAccessError("Please sign in to continue.", 401);
  const { data, error } = await db
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error)
    throw new ApiAccessError("Account access is temporarily unavailable.", 503);
  if (!data)
    throw new ApiAccessError("Your customer profile is unavailable.", 409);
  return { db, userId };
}
export async function requireOrderAccess(
  req: Request,
  orderId: unknown,
  options: {
    scope: "read" | "manage" | "pay";
    allowStaff?: boolean;
    staffOnly?: boolean;
    db?: SupabaseClient;
  },
) {
  if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
  if (typeof orderId !== "string" || !UUID.test(orderId))
    throw new ApiAccessError("Invalid order ID.", 400);
  const db = options.db ?? getServerDb();
  const userId = await session(req, db);
  let isStaff = false;
  if (userId && (options.allowStaff || options.staffOnly)) {
    const { data, error } = await db
      .from("profiles")
      .select("role,is_approved")
      .eq("id", userId)
      .maybeSingle();
    if (error)
      throw new ApiAccessError(
        "Account access is temporarily unavailable.",
        503,
      );
    isStaff = !!data?.is_approved && ["staff", "admin"].includes(data.role);
  }
  if (options.staffOnly && !isStaff)
    throw new ApiAccessError(
      "Approved staff access required.",
      userId ? 403 : 401,
    );
  const { data: order, error } = await db
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error)
    throw new ApiAccessError("Order access is temporarily unavailable.", 503);
  if (!order) throw new ApiAccessError("Order not found.", 404);
  if (isStaff || (userId && order.customer_id === userId))
    return {
      db,
      order: order as OrderRow,
      actorId: userId,
      userId,
      guestHash: null,
      isStaff,
      canManage: true,
    };
  if (order.customer_id)
    throw new ApiAccessError("Order access denied.", userId ? 403 : 401);
  const guestHash = guestDeviceHash(req);
  if (!guestHash)
    throw new ApiAccessError(
      "This guest order requires its original device. Please contact the cafe for recovery.",
      403,
    );
  const { data: grant, error: grantError } = await db
    .from("customer_guest_order_grants")
    .select("scopes,expires_at")
    .eq("order_id", orderId)
    .eq("device_hash", guestHash)
    .maybeSingle();
  if (grantError)
    throw new ApiAccessError("Guest access is temporarily unavailable.", 503);
  if (
    !grant ||
    !grant.scopes.includes(options.scope) ||
    Date.parse(grant.expires_at) <= Date.now()
  )
    throw new ApiAccessError("Order access denied.", 403);
  return {
    db,
    order: order as OrderRow,
    actorId: null,
    userId,
    guestHash,
    isStaff: false,
    canManage: grant.scopes.includes("manage"),
  };
}
/** Call only after a successful atomic creation or matching idempotency fingerprint; never from an order-ID-only endpoint. */
export async function issueGuestOrderGrant(
  req: Request,
  response: NextResponse,
  db: SupabaseClient,
  orderId: string,
): Promise<void> {
  assertSameOrigin(req);
  if (!UUID.test(orderId)) throw new ApiAccessError("Invalid order ID.", 400);
  const device = guestDevice(req) ?? randomBytes(32).toString("hex");
  const expiry = Date.now() + GUEST_AGE * 1000;
  const deviceHash = digest(`guest-device.v1:${device}`).toString("hex");
  const { error } = await db.from("customer_guest_order_grants").upsert(
    {
      order_id: orderId,
      device_hash: deviceHash,
      scopes: ["read", "manage", "pay"],
      expires_at: new Date(expiry).toISOString(),
    },
    { onConflict: "order_id,device_hash" },
  );
  if (error)
    throw new ApiAccessError(
      "Unable to secure this guest order. Retry this submission.",
      503,
    );
  const payload = `${device}.${expiry}`;
  response.cookies.set(
    GUEST_COOKIE,
    `${payload}.${digest(`guest-cookie.v1:${payload}`).toString("base64url")}`,
    {
      httpOnly: true,
      secure: new URL(req.url).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: GUEST_AGE,
    },
  );
}
export function publicOrder(order: OrderRow) {
  const fields = [
    "id",
    "order_number",
    "status",
    "order_type",
    "order_source",
    "payment_method",
    "payment_status",
    "subtotal",
    "total",
    "discount",
    "points_earned",
    "points_redeemed",
    "notes",
    "delivery_fee",
    "delivery_name",
    "delivery_phone",
    "delivery_address",
    "delivery_lat",
    "delivery_lng",
    "lalamove_order_id",
    "lalamove_status",
    "lalamove_share_link",
    "maya_checkout_id",
    "expires_at",
    "created_at",
    "updated_at",
    "scheduled_for",
    "pickup_at",
    "preparation_due_at",
    "scheduled_pickup_at",
    "schedule_status",
    "payment_review_required",
    "is_scheduled",
    "payment_deadline",
    "pickup_window_start",
    "pickup_window_end",
    "scheduled_item_units",
  ];
  return Object.fromEntries(
    fields
      .filter((field) => field in order)
      .map((field) => [field, order[field]]),
  );
}
export async function orderPickupCredentials(
  db: SupabaseClient,
  order: OrderRow,
  canManage: boolean,
) {
  if (
    !canManage ||
    order.order_type !== "pickup" ||
    order.status === "cancelled" ||
    order.status === "completed"
  )
    return {};
  const cashPickup =
    order.order_source === "app" &&
    order.payment_method === "cash" &&
    !order.pickup_window_start;
  if (
    order.status !== "ready" ||
    (order.payment_status !== "paid" &&
      !(cashPickup && order.payment_status === "pending"))
  )
    return {};
  const { data: existing, error } = await db
    .from("pickup_tokens")
    .select("token_hash,is_used")
    .eq("order_id", order.id)
    .limit(1)
    .maybeSingle();
  if (error)
    throw new ApiAccessError("Pickup QR is temporarily unavailable.", 503);
  if (existing?.is_used) return {};
  let tokenHash = existing?.token_hash;
  if (!tokenHash) {
    // Deterministic private capability makes concurrent authorized reads converge.
    tokenHash = digest(`pickup-capability.v1:${order.id}`).toString("hex");
    const { error: insertError } = await db
      .from("pickup_tokens")
      .upsert(
        { order_id: order.id, token_hash: tokenHash },
        { onConflict: "token_hash", ignoreDuplicates: true },
      );
    if (insertError)
      throw new ApiAccessError("Pickup QR is temporarily unavailable.", 503);
  }
  return { pickup_qr: `pickup:${order.id}:${tokenHash}` };
}
export function apiAccessErrorResponse(error: unknown) {
  if (error instanceof ApiAccessError || error instanceof JsonBodyError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: PRIVATE_HEADERS },
    );
  console.error("Customer request failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return NextResponse.json(
    { error: "The request could not be completed. Please try again." },
    { status: 500, headers: PRIVATE_HEADERS },
  );
}
