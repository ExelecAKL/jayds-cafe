import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { getServerDb } from "../../../../lib/server-access";
import { validPushEndpoint } from "../../../../lib/push";
export const maxDuration = 60;
export async function POST(req: Request) {
  const secret = process.env.CUSTOMER_JOB_SECRET,
    provided = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !secret ||
    !provided ||
    Buffer.byteLength(secret) !== Buffer.byteLength(provided) ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  )
    return NextResponse.json(
      { error: "Notifications are not configured" },
      { status: 503 },
    );
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "https://jaydscafe.vercel.app/privacy",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const db = getServerDb(),
    { data, error } = await db.rpc("customer_claim_push", { p_limit: 25 });
  if (error)
    return NextResponse.json({ error: "Worker unavailable" }, { status: 503 });
  let sent = 0,
    failed = 0;
  async function send(row: Record<string, unknown>) {
    const id = String(row.id);
    const { data: context, error: contextError } = await db.rpc(
      "customer_push_delivery_context",
      {
        p_outbox: id,
        p_expected_attempt: Number(row.attempts),
      },
    );
    // Recheck ownership, guest grants and the current lease immediately before delivery.
    // Database failures leave the lease for a bounded retry, never authorize a send.
    if (contextError) {
      failed++;
      return;
    }
    const sub = context?.subscription;
    if (!sub || !validPushEndpoint(sub.endpoint)) {
      await db
        .from("customer_push_outbox")
        .update({ status: "suppressed", lease_until: null })
        .eq("id", id)
        .eq("attempts", Number(row.attempts))
        .eq("status", "sending");
      return;
    }
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        },
        JSON.stringify({
          eventId: row.event_key,
          title: row.title,
          body: row.body,
          url: "/orders/" + row.order_id,
        }),
        { TTL: 900, timeout: 8000 },
      );
      const { error } = await db
        .from("customer_push_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          lease_until: null,
          last_error: null,
        })
        .eq("id", id)
        .eq("attempts", Number(row.attempts))
        .eq("status", "sending");
      if (!error) sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode,
        terminal =
          status === 404 || status === 410 || Number(row.attempts) >= 8;
      if (status === 404 || status === 410)
        await db
          .from("customer_push_subscriptions")
          .update({ active: false })
          .eq("id", sub.id)
          .eq("endpoint", sub.endpoint)
          .eq("p256dh", sub.p256dh)
          .eq("auth_key", sub.auth_key);
      await db
        .from("customer_push_outbox")
        .update({
          status: terminal ? "failed" : "pending",
          lease_until: null,
          last_error: status
            ? "Push delivery returned " + status
            : "Push response unavailable",
          next_attempt_at: new Date(
            Date.now() + Math.min(3600000, 30000 * 2 ** Number(row.attempts)),
          ).toISOString(),
        })
        .eq("id", id)
        .eq("attempts", Number(row.attempts))
        .eq("status", "sending");
      failed++;
    }
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  for (let i = 0; i < rows.length; i += 5)
    await Promise.all(rows.slice(i, i + 5).map(send));
  return NextResponse.json(
    { processed: rows.length, sent, failed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
