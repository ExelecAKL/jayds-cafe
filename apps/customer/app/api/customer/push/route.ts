import { NextResponse } from "next/server";
import { readJsonBody } from "@cafeos/shared/server/request-body";
import {
  requireCustomer,
  requireOrderAccess,
  getServerDb,
  guestDeviceHash,
  assertSameOrigin,
  ApiAccessError,
  apiAccessErrorResponse,
} from "../../../../lib/server-access";
import {
  endpointHash,
  validPushEndpoint,
  validPushKeys,
} from "../../../../lib/push";
export async function GET() {
  return NextResponse.json(
    {
      configured: !!(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY
      ),
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!process.env.VAPID_PRIVATE_KEY)
      throw new ApiAccessError(
        "Background alerts are not configured yet. In-app tracking remains available.",
        503,
      );
    const body = await readJsonBody(req),
      sub = body.subscription;
    if (!validPushEndpoint(sub?.endpoint) || !validPushKeys(sub?.keys))
      throw new ApiAccessError(
        "Invalid browser notification subscription.",
        400,
      );
    let userId: string | null = null,
      guestHash: string | null = null,
      orderId: string | null = null;
    const db = getServerDb();
    if (req.headers.has("authorization")) {
      userId = (await requireCustomer(req)).userId;
    } else {
      const access = await requireOrderAccess(req, body.orderId, {
        scope: "manage",
        db,
      });
      guestHash = access.guestHash;
      orderId = access.order.id;
      if (!guestHash)
        throw new ApiAccessError(
          "Sign in or use your original guest order device.",
          401,
        );
    }
    const { error } = await db.from("customer_push_subscriptions").upsert(
      {
        user_id: userId,
        guest_hash: guestHash,
        order_id: orderId,
        endpoint_hash: endpointHash(sub.endpoint),
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth_key: sub.keys.auth,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint_hash" },
    );
    if (error)
      throw new ApiAccessError("Notification preferences could not save.", 503);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiAccessErrorResponse(e);
  }
}
export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    const body = await readJsonBody(req);
    if (!validPushEndpoint(body.endpoint))
      throw new ApiAccessError("Invalid notification subscription.", 400);
    const db = getServerDb();
    let query = db
      .from("customer_push_subscriptions")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("endpoint_hash", endpointHash(body.endpoint));
    if (req.headers.has("authorization"))
      query = query.eq("user_id", (await requireCustomer(req)).userId);
    else {
      const hash = guestDeviceHash(req);
      if (!hash) throw new ApiAccessError("Original device required.", 403);
      query = query.eq("guest_hash", hash);
    }
    const { error } = await query;
    if (error)
      throw new ApiAccessError("Notification preference could not save.", 503);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiAccessErrorResponse(e);
  }
}
