import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const requireNode = createRequire(import.meta.url);
const customerId = "10000000-0000-4000-8000-000000000001";
const staffId = "10000000-0000-4000-8000-000000000002";
const orderId = "20000000-0000-4000-8000-000000000001";
const checkoutId = "30000000-0000-4000-8000-000000000001";
const privateFields = {
  pickup_confirmation_hash: "private-pickup",
  advance_order_key: "private-device",
  request_fingerprint: "private-fingerprint",
  maya_checkout_url: "https://private.example",
  staff_id: staffId,
};
class FakeResponse extends Response {
  cookies = {
    set: (name: string, value: string) =>
      this.headers.append(
        "set-cookie",
        `${name}=${value}; HttpOnly; SameSite=Lax; Path=/`,
      ),
  };
  static json(value: unknown, init?: ResponseInit) {
    return new FakeResponse(JSON.stringify(value), init);
  }
}
function load<T>(
  file: string,
  mocks: Record<string, unknown>,
  env: Record<string, string> = {},
): T {
  const loadedModule = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    source,
    {
      module: loadedModule,
      exports: loadedModule.exports,
      require: (name: string) => mocks[name] ?? requireNode(name),
      process: {
        env: { SUPABASE_SERVICE_ROLE_KEY: "isolated-test-secret", ...env },
      },
      Buffer,
      URL,
      Request,
      Response,
      Date,
      AbortController,
      setTimeout,
      clearTimeout,
      console: { error() {}, log() {}, warn() {} },
      fetch() {
        throw Error("External requests forbidden");
      },
    },
    { filename: file },
  );
  return loadedModule.exports as T;
}
function mockDb(owner: string | null = null, approved = false) {
  const grants: Record<string, unknown>[] = [];
  const database = {
    auth: {
      getUser: async (token: string) => ({
        data: {
          user:
            token === "owner-token"
              ? { id: customerId }
              : token === "staff-token"
                ? { id: staffId }
                : null,
        },
        error: null,
      }),
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return query;
        },
        limit: () => query,
        maybeSingle: async () => ({
          data:
            table === "orders"
              ? {
                  id: orderId,
                  customer_id: owner,
                  status: "pending",
                  payment_status: "pending",
                  ...privateFields,
                }
              : table === "profiles"
                ? { role: "staff", is_approved: approved }
                : (grants.find(
                    (row) =>
                      row.order_id === filters.order_id &&
                      row.device_hash === filters.device_hash,
                  ) ?? null),
          error: null,
        }),
        upsert: async (row: Record<string, unknown>) => {
          grants.push(row);
          return { error: null };
        },
      };
      return query;
    },
  };
  return { database, grants };
}
function accessFor(database: unknown) {
  return load<typeof import("../apps/customer/lib/server-access.ts")>(
    "apps/customer/lib/server-access.ts",
    {
      "next/server": { NextResponse: FakeResponse },
      "@cafeos/shared/supabase/server": {
        createAdminSupabaseClient: () => database,
      },
    },
  );
}

test("order QR presentation is restricted to its authorized ready pickup, including cash at handover, and never delivery", async () => {
  const { database } = mockDb(customerId);
  const access = accessFor(database);
  const ready = {
    id: orderId,
    order_type: "pickup",
    status: "ready",
    payment_status: "paid",
  };
  for (const order of [
    { ...ready, order_type: "delivery" },
    { ...ready, status: "preparing" },
    { ...ready, payment_status: "pending" },
    { ...ready, status: "completed" },
    { ...ready, status: "cancelled" },
  ])
    assert.equal(
      Object.keys(
        await access.orderPickupCredentials(database as never, order, true),
      ).length,
      0,
    );
  assert.equal(
    Object.keys(
      await access.orderPickupCredentials(database as never, ready, false),
    ).length,
    0,
  );
  const result = await access.orderPickupCredentials(
    database as never,
    ready,
    true,
  );
  assert.match(result.pickup_qr!, /^pickup:[a-f0-9-]{36}:[a-f0-9]{64}$/);
  const cash = {
    ...ready,
    order_source: "app",
    payment_method: "cash",
    payment_status: "pending",
  };
  assert.match(
    (await access.orderPickupCredentials(database as never, cash, true))
      .pickup_qr!,
    /^pickup:/,
  );
  for (const order of [
    { ...cash, status: "pending" },
    { ...cash, status: "preparing" },
    { ...cash, payment_status: "failed" },
    { ...cash, pickup_window_start: "2026-10-08T00:00:00Z" },
    { ...cash, order_source: "pos" },
  ])
    assert.equal(
      Object.keys(
        await access.orderPickupCredentials(database as never, order, true),
      ).length,
      0,
    );
  assert.equal(
    Object.keys(
      await access.orderPickupCredentials(database as never, cash, false),
    ).length,
    0,
  );
});
test("guest access requires an untampered signed device cookie and matching scoped server grant", async () => {
  const { database, grants } = mockDb();
  const access = accessFor(database);
  await assert.rejects(
    access.requireOrderAccess(new Request("https://cafe.test"), orderId, {
      scope: "read",
    }),
    /original device/,
  );
  const response = new FakeResponse();
  // The isolated response implements the cookie API; NextResponse's private runtime symbol is intentionally absent from this fixture.
  await access.issueGuestOrderGrant(
    new Request("https://cafe.test"),
    response as unknown as Parameters<typeof access.issueGuestOrderGrant>[1],
    database as never,
    orderId,
  );
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const req = new Request("https://cafe.test", { headers: { cookie } });
  assert.equal(
    (await access.requireOrderAccess(req, orderId, { scope: "pay" })).order.id,
    orderId,
  );
  assert.equal(grants.length, 1);
  assert.match(String(grants[0].device_hash), /^[a-f0-9]{64}$/);
  const forged = cookie.slice(0, -1) + (cookie.endsWith("a") ? "b" : "a");
  await assert.rejects(
    access.requireOrderAccess(
      new Request("https://cafe.test", { headers: { cookie: forged } }),
      orderId,
      { scope: "read" },
    ),
  );
  grants[0].scopes = ["read"];
  await assert.rejects(
    access.requireOrderAccess(req, orderId, { scope: "manage" }),
    /access denied/,
  );
  grants[0].expires_at = "2000-01-01";
  await assert.rejects(
    access.requireOrderAccess(req, orderId, { scope: "read" }),
    /access denied/,
  );
});
test("explicit LAN preview origins pass without trusting forwarded Host headers or lookalike origins", () => {
  const access = load<typeof import("../apps/customer/lib/server-access.ts")>(
    "apps/customer/lib/server-access.ts",
    {
      "next/server": { NextResponse: FakeResponse },
      "@cafeos/shared/supabase/server": {
        createAdminSupabaseClient: () => mockDb().database,
      },
    },
    { CUSTOMER_ALLOWED_ORIGINS: "http://192.168.18.7:4000" },
  );
  assert.doesNotThrow(() =>
    access.assertSameOrigin(
      new Request("http://localhost:4000/api/customer/legal", {
        headers: { origin: "http://192.168.18.7:4000" },
      }),
    ),
  );
  for (const origin of [
    "http://192.168.18.7:4001",
    "https://evil.test",
    "http://192.168.18.7.evil.test:4000",
    "null",
  ]) {
    assert.throws(
      () =>
        access.assertSameOrigin(
          new Request("http://localhost:4000/api/customer/legal", {
            headers: {
              origin,
              "x-forwarded-host": new URL(
                origin === "null" ? "https://evil.test" : origin,
              ).host,
            },
          }),
        ),
      /origin/,
    );
  }
});
test("account ownership, approved staff, origin, and field projection are enforced", async () => {
  const { database } = mockDb(customerId);
  let access = accessFor(database);
  await assert.rejects(
    access.requireOrderAccess(new Request("https://cafe.test"), orderId, {
      scope: "pay",
    }),
    /access denied/,
  );
  const owner = new Request("https://cafe.test", {
    headers: { authorization: "Bearer owner-token" },
  });
  assert.equal(
    (await access.requireOrderAccess(owner, orderId, { scope: "pay" })).actorId,
    customerId,
  );
  const staff = new Request("https://cafe.test", {
    headers: { authorization: "Bearer staff-token" },
  });
  await assert.rejects(
    access.requireOrderAccess(staff, orderId, {
      scope: "manage",
      staffOnly: true,
    }),
    /Approved staff/,
  );
  access = accessFor(mockDb(customerId, true).database);
  assert.equal(
    (
      await access.requireOrderAccess(staff, orderId, {
        scope: "manage",
        staffOnly: true,
      })
    ).isStaff,
    true,
  );
  assert.throws(
    () =>
      access.assertSameOrigin(
        new Request("https://cafe.test/api", {
          headers: { origin: "https://evil.test" },
        }),
      ),
    /origin/,
  );
  const projected = access.publicOrder({
    id: orderId,
    total: 100,
    ...privateFields,
  });
  for (const key of Object.keys(privateFields))
    assert.equal(key in projected, false);
});

async function sqlDatabase() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA cron;
    CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE FUNCTION gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $$ SELECT substring(decode(repeat(md5(gen_random_uuid()::text),ceil($1/16.0)::integer),'hex') FROM 1 FOR $1) $$;
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
    CREATE PUBLICATION supabase_realtime; SELECT set_config('request.jwt.claim.role','service_role',false);`);
  // Scheduling/feature tests own their later migrations; this test exercises security on the real prior schema.
  for (const file of readdirSync("supabase/migrations")
    .filter(
      (file) =>
        file.endsWith(".sql") && file <= "20261003000100_customer_security.sql",
    )
    .sort())
    await db.exec(
      readFileSync("supabase/migrations/" + file, "utf8").replace(
        "CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;",
        "",
      ),
    );
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2),($3,$4)", [
    customerId,
    "customer@example.test",
    staffId,
    "staff@example.test",
  ]);
  await db.query(
    "UPDATE profiles SET role='staff',is_approved=true WHERE id=$1",
    [staffId],
  );
  await db.query(
    "INSERT INTO orders(id,customer_id,order_type,payment_method,subtotal,total) VALUES($1,$2,'pickup','maya',100,100)",
    [orderId, customerId],
  );
  return db;
}
test("security SQL blocks escalation, preserves growing numbering, deduplicates attempts and records late paid honestly", async () => {
  const db = await sqlDatabase();
  try {
    await db.query("SELECT setval('order_number_seq',9999,true)");
    assert.equal(
      (
        await db.query<{ number: string }>(
          "SELECT generate_order_number() number",
        )
      ).rows[0].number,
      "ORD-10000",
    );
    await db.query(
      "SELECT set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",
      [customerId],
    );
    await assert.rejects(
      db.query(
        "UPDATE profiles SET role='admin',is_approved=true WHERE id=$1",
        [customerId],
      ),
      /Approved administrator/,
    );
    await assert.rejects(
      db.query("UPDATE profiles SET points=999999 WHERE id=$1", [customerId]),
      /Trusted loyalty/,
    );
    await db.query(
      "SELECT set_config('request.jwt.claim.role','service_role',false)",
    );
    const claims = await Promise.all([
      db.query<{ result: { claimed: boolean; attempt: { id: string } } }>(
        "SELECT customer_claim_provider_attempt($1,'maya',$2) result",
        [orderId, customerId],
      ),
      db.query<{ result: { claimed: boolean; attempt: { id: string } } }>(
        "SELECT customer_claim_provider_attempt($1,'maya',$2) result",
        [orderId, customerId],
      ),
    ]);
    assert.equal(claims.filter((row) => row.rows[0].result.claimed).length, 1);
    const attempt = claims[0].rows[0].result.attempt.id;
    await db.query(
      "SELECT customer_finish_provider_attempt($1,'ready',$2,'https://pay.example.test')",
      [attempt, checkoutId],
    );
    await assert.rejects(
      db.query("SELECT customer_finalize_maya_payment($1,$2,1,'PHP','paid')", [
        checkoutId,
        "payment-1",
      ]),
      /does not match/,
    );
    await db.query(
      "UPDATE orders SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [orderId],
    );
    await db.query(
      "SELECT customer_finalize_maya_payment($1,$2,100,'PHP','paid')",
      [checkoutId, "payment-1"],
    );
    const order = (
      await db.query<{
        status: string;
        payment_status: string;
        payment_review_required: boolean;
      }>(
        "SELECT status,payment_status,payment_review_required FROM orders WHERE id=$1",
        [orderId],
      )
    ).rows[0];
    assert.deepEqual(order, {
      status: "cancelled",
      payment_status: "paid",
      payment_review_required: true,
    });
    await db.query(
      "SELECT customer_finalize_maya_payment($1,$2,100,'PHP','failed')",
      [checkoutId, "payment-1"],
    );
    assert.equal(
      (
        await db.query<{ payment_status: string }>(
          "SELECT payment_status FROM orders WHERE id=$1",
          [orderId],
        )
      ).rows[0].payment_status,
      "paid",
    );
    const deliveryId = "20000000-0000-4000-8000-000000000002";
    await db.query(
      "INSERT INTO orders(id,order_type,payment_method,payment_status,status,subtotal,total,delivery_fee) VALUES($1,'delivery','maya','paid','preparing',100,140,40)",
      [deliveryId],
    );
    const delivery = (
      await db.query<{ result: { claimed: boolean; attempt: { id: string } } }>(
        "SELECT customer_claim_provider_attempt($1,'lalamove',$2) result",
        [deliveryId, staffId],
      )
    ).rows[0].result;
    assert.equal(delivery.claimed, true);
    await db.query(
      "SELECT customer_finish_provider_attempt($1,'uncertain',NULL,NULL,'NETWORK_TIMEOUT')",
      [delivery.attempt.id],
    );
    assert.equal(
      (
        await db.query<{
          result: { claimed: boolean; attempt: { state: string } };
        }>("SELECT customer_claim_provider_attempt($1,'lalamove',$2) result", [
          deliveryId,
          staffId,
        ])
      ).rows[0].result.claimed,
      false,
    );
    await db.query(
      "SELECT customer_finish_provider_attempt($1,'ready','booking-1','https://share.example.test')",
      [delivery.attempt.id],
    );
    await assert.rejects(
      db.query(
        "SELECT customer_sync_delivery($1,'unrelated-booking','COMPLETED')",
        [deliveryId],
      ),
      /association/,
    );
    await db.query(
      "SELECT customer_sync_delivery($1,'booking-1','COMPLETED')",
      [deliveryId],
    );
    await db.query("SELECT customer_sync_delivery($1,'booking-1','ON_GOING')", [
      deliveryId,
    ]);
    assert.deepEqual(
      (
        await db.query<{ status: string; lalamove_status: string }>(
          "SELECT status,lalamove_status FROM orders WHERE id=$1",
          [deliveryId],
        )
      ).rows[0],
      { status: "completed", lalamove_status: "COMPLETED" },
    );
    // An authentic different provider payment cannot be applied to an arbitrary local order.
    await assert.rejects(
      db.query(
        "SELECT customer_sync_delivery($1,'another-booking','COMPLETED')",
        [orderId],
      ),
      /association/,
    );
    await db.query(
      "SELECT set_config('request.jwt.claim.role','authenticated',false)",
    );
    await assert.rejects(
      db.query(
        "SELECT customer_finalize_maya_payment($1,$2,100,'PHP','paid')",
        [checkoutId, "payment-1"],
      ),
      /Trusted server/,
    );
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT has_table_privilege('authenticated','customer_provider_attempts','SELECT') allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
