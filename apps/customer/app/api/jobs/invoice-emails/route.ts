import { timingSafeEqual } from "node:crypto";
import { getServerDb } from "../../../../lib/server-access";
import {
  invoiceMailConfig,
  deliverInvoiceEmail,
  InvoiceMailError,
} from "@cafeos/shared/email/delivery";
import { invoiceEmail } from "@cafeos/shared/email/templates";
import type { InvoiceRecord } from "@cafeos/shared/finance/types";
export const maxDuration = 60;
export const runtime = "nodejs";
function authorized(req: Request) {
  const secret = process.env.CUSTOMER_JOB_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer /, "");
  return !!(
    secret &&
    provided &&
    Buffer.byteLength(secret) === Buffer.byteLength(provided) &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
  );
}
export async function GET(req: Request) {
  if (!authorized(req))
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  const config = invoiceMailConfig(process.env);
  return Response.json(
    {
      configured: !!config,
      senderDomain: config?.from.match(/@([^<>]+)>$/)?.[1] ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!authorized(req))
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const config = invoiceMailConfig(process.env);
  if (!config)
    return Response.json({ configured: false, processed: 0 }, { headers });
  const db = getServerDb();
  const claimed = await db.rpc("invoice_email_claim", { p_limit: 5 });
  if (claimed.error)
    return Response.json(
      { error: "Invoice delivery unavailable" },
      { status: 503, headers },
    );
  let sent = 0,
    review = 0;
  for (const row of claimed.data ?? []) {
    const finish = (
      outcome: string,
      message: string | null = null,
      failure: string | null = null,
    ) =>
      db.rpc("invoice_email_finish", {
        p_id: row.id,
        p_lease: row.lease_token,
        p_outcome: outcome,
        p_message_id: message,
        p_error: failure,
      });
    const context = await db.rpc("invoice_email_context", {
      p_id: row.id,
      p_lease: row.lease_token,
    });
    if (context.error) continue; // Leave the lease for a bounded retry.
    if (!context.data) {
      await finish("suppressed");
      continue;
    }
    try {
      const draft = context.data.payload ?? {
        from: config.from,
        to: [context.data.recipient],
        ...invoiceEmail(context.data.invoice as InvoiceRecord),
      };
      const frozen = await db.rpc("invoice_email_prepare", {
        p_id: row.id,
        p_lease: row.lease_token,
        p_payload: draft,
      });
      if (frozen.error || !frozen.data) continue;
      const current = await db.rpc("invoice_email_context", {
        p_id: row.id,
        p_lease: row.lease_token,
      });
      if (current.error) continue;
      if (!current.data) {
        await finish("suppressed");
        continue;
      }
      const id = await deliverInvoiceEmail(
        config,
        `jayds-invoice/${row.invoice_id}/v1`,
        frozen.data,
      );
      const saved = await finish("sent", id);
      if (!saved.error && saved.data) sent++;
    } catch (error) {
      const retry = error instanceof InvoiceMailError && error.retryable;
      await finish(
        retry ? "pending" : "review",
        null,
        error instanceof InvoiceMailError
          ? error.message
          : "Invoice snapshot needs review",
      );
      if (!retry) review++;
    }
  }
  return Response.json(
    { processed: (claimed.data ?? []).length, sent, review },
    { headers },
  );
}
