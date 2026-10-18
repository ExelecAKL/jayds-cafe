import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const customer = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz);
 CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id uuid,synthetic_dataset_id text);
 CREATE TABLE financial_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now()+interval '1 second');
 CREATE TABLE finance_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid REFERENCES financial_events(id),order_id uuid REFERENCES orders(id),issued_at timestamptz DEFAULT now()+interval '1 second',kind text DEFAULT 'invoice',number text DEFAULT 'JD-1',business jsonb DEFAULT '{}',buyer jsonb DEFAULT '{}',breakdown jsonb DEFAULT '{}');
 CREATE FUNCTION finance_require_admin() RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF auth.role() NOT IN('service_role','fixture_approved_admin') THEN RAISE EXCEPTION 'Approved Admin required' USING ERRCODE='42501'; END IF; END $$;
 SELECT set_config('request.jwt.claim.role','service_role',false);`);
  await db.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'customer@example.test',now()),($2,'other@example.test',now())",
    [customer, other],
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261018000200_invoice_email_delivery.sql",
      "utf8",
    ),
  );
  return db;
}
async function issue(
  db: PGlite,
  options: { old?: boolean; synthetic?: boolean; guest?: boolean } = {},
) {
  const order = (
    await db.query<{ id: string }>(
      "INSERT INTO orders(customer_id,synthetic_dataset_id) VALUES($1,$2) RETURNING id",
      [
        options.guest ? null : customer,
        options.synthetic ? "fixture-history" : null,
      ],
    )
  ).rows[0].id;
  const event = (
    await db.query<{ id: string }>(
      "INSERT INTO financial_events(created_at) VALUES(now()+$1::interval) RETURNING id",
      [options.old ? "-30 days" : "1 second"],
    )
  ).rows[0].id;
  return (
    await db.query<{ id: string }>(
      "INSERT INTO finance_invoices(order_id,event_id) VALUES($1,$2) RETURNING id",
      [order, event],
    )
  ).rows[0].id;
}
async function enable(db: PGlite) {
  await db.exec(
    "SELECT invoice_email_provider_ready(true);SELECT invoice_email_set_enabled(true)",
  );
}
test("invoice mail is opt-in and future-only; synthetic, guest, unverified and old sales are not queued", async () => {
  const db = await database();
  try {
    await issue(db);
    assert.equal(
      (await db.query("SELECT * FROM invoice_email_outbox")).rows.length,
      0,
    );
    await assert.rejects(
      () => db.exec("SELECT invoice_email_set_enabled(true)"),
      /sender/,
    );
    await enable(db);
    await issue(db, { old: true });
    await issue(db, { synthetic: true });
    await issue(db, { guest: true });
    await db.exec("UPDATE auth.users SET email_confirmed_at=NULL");
    await issue(db);
    await db.exec("UPDATE auth.users SET email_confirmed_at=now()");
    const id = await issue(db);
    const rows = (
      await db.query<{ invoice_id: string }>(
        "SELECT * FROM invoice_email_outbox",
      )
    ).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].invoice_id, id);
    await db.exec(
      "SELECT set_config('request.jwt.claim.role','authenticated',false)",
    );
    await assert.rejects(
      () => db.exec("SELECT invoice_email_status()"),
      /Admin/,
    );
    await assert.rejects(
      () => db.exec("SELECT invoice_email_claim(5)"),
      /worker/,
    );
    await assert.rejects(
      () => db.exec("SELECT invoice_email_provider_ready(true)"),
      /deployment/,
    );
    await db.exec("SET ROLE authenticated");
    await assert.rejects(
      () => db.exec("SELECT * FROM invoice_email_outbox"),
      /permission/,
    );
  } finally {
    await db.close();
  }
});
test("worker leases fence retries and freeze the original payload; sent messages and stale leases cannot be replayed", async () => {
  const db = await database();
  try {
    await enable(db);
    await issue(db);
    const first = (
      await db.query<{ id: string; lease_token: string }>(
        "SELECT * FROM invoice_email_claim(5)",
      )
    ).rows[0];
    assert.equal(
      (await db.query("SELECT * FROM invoice_email_claim(5)")).rows.length,
      0,
    );
    const payload = {
      from: "Jayds <receipts@example.test>",
      to: ["customer@example.test"],
      subject: "Invoice",
      html: "<p>Frozen</p>",
      text: "Frozen",
    };
    const save = async (token: string, value: unknown) =>
      (
        await db.query<{ payload: typeof payload }>(
          "SELECT invoice_email_prepare($1,$2,$3) payload",
          [first.id, token, JSON.stringify(value)],
        )
      ).rows[0].payload;
    assert.deepEqual(await save(first.lease_token, payload), payload);
    assert.deepEqual(
      await save(first.lease_token, { ...payload, html: "CHANGED" }),
      payload,
    );
    await db.exec(
      "UPDATE invoice_email_outbox SET lease_until=now()-interval '1 second'",
    );
    const retry = (
      await db.query<{ lease_token: string }>(
        "SELECT * FROM invoice_email_claim(5)",
      )
    ).rows[0];
    assert.notEqual(first.lease_token, retry.lease_token);
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "SELECT invoice_email_finish($1,$2,'sent','provider-id') ok",
          [first.id, first.lease_token],
        )
      ).rows[0].ok,
      false,
    );
    assert.deepEqual(
      await save(retry.lease_token, { ...payload, html: "CHANGED" }),
      payload,
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "SELECT invoice_email_finish($1,$2,'sent','provider-id') ok",
          [first.id, retry.lease_token],
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (await db.query("SELECT * FROM invoice_email_claim(5)")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("delivery context rechecks the email owner and pause; ambiguous sends beyond the provider's deduplication window need review", async () => {
  const db = await database();
  try {
    await enable(db);
    await issue(db);
    const row = (
      await db.query<{ id: string; lease_token: string }>(
        "SELECT * FROM invoice_email_claim(5)",
      )
    ).rows[0];
    const context = async () =>
      (
        await db.query<{ context: unknown }>(
          "SELECT invoice_email_context($1,$2) context",
          [row.id, row.lease_token],
        )
      ).rows[0].context;
    assert.ok(await context());
    await db.exec("UPDATE auth.users SET email='changed@example.test'");
    assert.equal(await context(), null);
    await db.query(
      "UPDATE auth.users SET email='customer@example.test' WHERE id=$1",
      [customer],
    );
    await db.exec("SELECT invoice_email_set_enabled(false)");
    assert.equal(await context(), null);
    assert.equal(
      (await db.query("SELECT * FROM invoice_email_claim(5)")).rows.length,
      0,
    );
    await db.exec(
      "SELECT invoice_email_set_enabled(true);UPDATE invoice_email_outbox SET lease_until=now()-interval '1 second',first_attempt_at=now()-interval '21 hours'",
    );
    assert.equal(
      (await db.query("SELECT * FROM invoice_email_claim(5)")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM invoice_email_outbox",
        )
      ).rows[0].status,
      "review",
    );
  } finally {
    await db.close();
  }
});
