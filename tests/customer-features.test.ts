import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { safeMayaCheckoutUrl } from "../packages/shared/src/maya-urls.ts";
import {
  validPushEndpoint,
  validPushKeys,
  endpointHash,
} from "../apps/customer/lib/push.ts";

// No .env file is loaded, no real database is used, and no notification is sent.
const nodeRequire = createRequire(import.meta.url);
const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const staff = "10000000-0000-4000-8000-000000000003";
const admin = "10000000-0000-4000-8000-000000000004";
const orderId = "20000000-0000-4000-8000-000000000001";
const guestOrder = "20000000-0000-4000-8000-000000000002";
const guestHash = "a".repeat(64);
const endpoint = "https://fcm.googleapis.com/fcm/send/isolated-test";
const keys = {
  p256dh: Buffer.alloc(65, 4).toString("base64url"),
  auth: Buffer.alloc(16, 1).toString("base64url"),
};
class AccessError extends Error {
  constructor(
    message: string,
    readonly status = 403,
  ) {
    super(message);
  }
}
const responseMock = {
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
  },
};
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
      require: (name: string) => mocks[name] ?? nodeRequire(name),
      process: { env },
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
test("provider checkout/tracking URLs allow only known HTTPS hosts, without credential or hostname tricks", () => {
  const helpers = load<
    typeof import("../apps/customer/lib/provider-attempts.ts")
  >("apps/customer/lib/provider-attempts.ts", {
    "./server-access": { ApiAccessError: AccessError },
    "@cafeos/shared/maya-urls": { safeMayaCheckoutUrl },
  });
  for (const url of [
    "https://payments.maya.ph/v2/checkout?id=test",
    "https://payments.paymaya.com/checkout",
    "https://payments-web-sandbox.maya.ph/checkout",
    "https://payments-web-sandbox.paymaya.com/checkout",
    "https://sandbox-checkout-web.paymaya.com/checkout",
    "https://share.lalamove.com/?test",
    "https://share.sandbox.lalamove.com/?test",
  ])
    assert.equal(helpers.safeProviderUrl(url), url);
  for (const url of [
    "http://payments.maya.ph/checkout",
    "javascript:alert(1)",
    "https://payments-web-sandbox.maya.ph.evil.test/checkout",
    "https://payments.maya.ph.evil.test/checkout",
    "https://evil.test/payments.maya.ph",
    "https://user:password@payments.maya.ph/checkout",
    "https://payments.maya.ph:444/checkout",
    "https://127.0.0.1/checkout",
    "https://share.lalamove.com.evil.test",
    "https://share.sandbox.lalamove.com.evil.test",
  ])
    assert.equal(helpers.safeProviderUrl(url), null);
});
test("push endpoints and key lengths reject arbitrary/private destinations and malformed subscriptions", () => {
  assert.equal(validPushEndpoint(endpoint), true);
  assert.equal(validPushKeys(keys), true);
  for (const value of [
    "https://fcm.googleapis.com.evil.test/push",
    "https://localhost/push",
    "https://127.0.0.1/push",
    "http://fcm.googleapis.com/push",
    "https://x:y@fcm.googleapis.com/push",
    "https://fcm.googleapis.com:8443/push",
  ])
    assert.equal(validPushEndpoint(value), false);
  assert.equal(
    validPushKeys({ ...keys, auth: Buffer.alloc(15).toString("base64url") }),
    false,
  );
  assert.equal(validPushKeys({ ...keys, p256dh: "invalid" }), false);
});
test("push registration derives account/guest ownership from verified access and logout revocation remains owner scoped", async () => {
  const writes: {
    table: string;
    payload: Record<string, unknown>;
    filters: Record<string, unknown>;
  }[] = [];
  const db = {
    from(table: string) {
      let payload: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      const query = {
        upsert(value: Record<string, unknown>) {
          payload = value;
          return query;
        },
        update(value: Record<string, unknown>) {
          payload = value;
          return query;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          writes.push({ table, payload, filters });
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  let guestAllowed = false;
  const scopes: string[] = [];
  const route = load<{
    POST: (req: Request) => Promise<Response>;
    DELETE: (req: Request) => Promise<Response>;
  }>(
    "apps/customer/app/api/customer/push/route.ts",
    {
      "next/server": responseMock,
      "../../../../lib/push": {
        validPushEndpoint,
        validPushKeys,
        endpointHash,
      },
      "../../../../lib/server-access": {
        ApiAccessError: AccessError,
        getServerDb: () => db,
        assertSameOrigin() {},
        guestDeviceHash: () => guestHash,
        requireCustomer: async () => ({ db, userId: owner }),
        requireOrderAccess: async (
          _req: Request,
          _id: unknown,
          options: { scope: string },
        ) => {
          scopes.push(options.scope);
          if (!guestAllowed) throw new AccessError("Order access denied.");
          return { guestHash, order: { id: guestOrder } };
        },
        apiAccessErrorResponse: (error: AccessError) =>
          Response.json({ error: error.message }, { status: error.status }),
      },
    },
    { VAPID_PRIVATE_KEY: "isolated-key" },
  );
  const request = (method: string, authenticated = false) =>
    new Request("https://cafe.test/api/customer/push", {
      method,
      headers: authenticated ? { authorization: "Bearer isolated-owner" } : {},
      body: JSON.stringify({
        subscription: { endpoint, keys },
        endpoint,
        user_id: other,
        orderId: "forged-order",
      }),
    });
  assert.equal((await route.POST(request("POST", true))).status, 200);
  assert.equal(writes[0].payload.user_id, owner);
  assert.equal(writes[0].payload.guest_hash, null);
  assert.equal(writes[0].payload.order_id, null);
  assert.equal((await route.POST(request("POST"))).status, 403);
  assert.equal(writes.length, 1);
  guestAllowed = true;
  assert.equal((await route.POST(request("POST"))).status, 200);
  assert.equal(writes[1].payload.order_id, guestOrder);
  assert.equal(writes[1].payload.guest_hash, guestHash);
  assert.deepEqual(scopes, ["manage", "manage"]);
  assert.equal((await route.DELETE(request("DELETE", true))).status, 200);
  assert.equal(writes[2].filters.user_id, owner);
  assert.equal(writes[2].filters.endpoint_hash, endpointHash(endpoint));
  assert.equal((await route.DELETE(request("DELETE"))).status, 200);
  assert.equal(writes[3].filters.guest_hash, guestHash);
});
test("push worker revalidates the claimed authorization and terminal provider failure disables the subscription", async () => {
  for (const contextAllowed of [false, true]) {
    const writes: {
      table: string;
      payload: Record<string, unknown>;
      filters: Record<string, unknown>;
    }[] = [];
    let sent = 0;
    const db = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "customer_claim_push")
          return {
            data: [
              {
                id: "job",
                subscription_id: "sub",
                order_id: orderId,
                attempts: 2,
                event_key: `${orderId}:ready`,
                title: "Ready",
                body: "Open the order.",
              },
            ],
            error: null,
          };
        assert.equal(name, "customer_push_delivery_context");
        assert.equal(args.p_outbox, "job");
        assert.equal(args.p_expected_attempt, 2);
        return {
          data: contextAllowed
            ? {
                subscription: {
                  id: "sub",
                  endpoint,
                  p256dh: keys.p256dh,
                  auth_key: keys.auth,
                },
              }
            : null,
          error: null,
        };
      },
      from(table: string) {
        const filters: Record<string, unknown> = {};
        let payload: Record<string, unknown> = {};
        const query = {
          update(value: Record<string, unknown>) {
            payload = value;
            return query;
          },
          eq(key: string, value: unknown) {
            filters[key] = value;
            return query;
          },
          then(resolve: (value: unknown) => unknown) {
            writes.push({ table, payload, filters });
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return query;
      },
    };
    const route = load<{ POST: (req: Request) => Promise<Response> }>(
      "apps/customer/app/api/jobs/customer-notifications/route.ts",
      {
        "next/server": responseMock,
        "../../../../lib/server-access": { getServerDb: () => db },
        "../../../../lib/push": { validPushEndpoint },
        "web-push": {
          setVapidDetails() {},
          async sendNotification() {
            sent++;
            throw { statusCode: 410 };
          },
        },
      },
      {
        CUSTOMER_JOB_SECRET: "test-worker",
        VAPID_PRIVATE_KEY: "isolated-key",
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: "isolated-public",
      },
    );
    assert.equal(
      (
        await route.POST(
          new Request("https://cafe.test/api/jobs/customer-notifications", {
            method: "POST",
          }),
        )
      ).status,
      401,
    );
    const result = await route.POST(
      new Request("https://cafe.test/api/jobs/customer-notifications", {
        method: "POST",
        headers: { authorization: "Bearer test-worker" },
      }),
    );
    assert.equal(result.status, 200);
    assert.equal(sent, contextAllowed ? 1 : 0);
    if (contextAllowed) {
      assert.equal(
        writes.find((write) => write.table === "customer_push_subscriptions")
          ?.payload.active,
        false,
      );
      assert.equal(
        writes.find((write) => write.table === "customer_push_outbox")?.payload
          .status,
        "failed",
      );
    }
    for (const write of writes.filter(
      (write) => write.table === "customer_push_outbox",
    )) {
      assert.equal(write.filters.attempts, 2);
      assert.equal(write.filters.status, "sending");
    }
  }
});

async function database(beforeLegalRevision = false) {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA cron; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE FUNCTION gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $$ SELECT substring(decode(repeat(md5(gen_random_uuid()::text),ceil($1/16.0)::integer),'hex') FROM 1 FOR $1) $$;
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
    CREATE PUBLICATION supabase_realtime; GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    -- Supabase grants API roles table access by default; migrations then narrow access with RLS and explicit revocations.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO anon,authenticated,service_role;
    SELECT set_config('request.jwt.claim.role','service_role',false);`);
  for (const file of readdirSync("supabase/migrations")
    .filter(
      (file) =>
        file.endsWith(".sql") && file < "20261003000300_customer_features.sql",
    )
    .sort())
    await db.exec(
      readFileSync("supabase/migrations/" + file, "utf8").replace(
        "CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;",
        "",
      ),
    );
  await db.query(
    "INSERT INTO auth.users(id,email) VALUES($1,$2),($3,$4),($5,$6),($7,$8)",
    [
      owner,
      "owner@example.test",
      other,
      "other@example.test",
      staff,
      "staff@example.test",
      admin,
      "admin@example.test",
    ],
  );
  await db.query(
    "UPDATE profiles SET role='staff',is_approved=true WHERE id=$1",
    [staff],
  );
  await db.query(
    "UPDATE profiles SET role='admin',is_approved=true WHERE id=$1",
    [admin],
  );
  await db.query(
    "INSERT INTO orders(id,customer_id,order_type,payment_method,subtotal,total) VALUES($1,$2,'pickup','maya',100,100),($3,NULL,'pickup','maya',100,100)",
    [orderId, owner, guestOrder],
  );
  await db.query(
    "INSERT INTO orders(id,customer_id,order_type,payment_method,payment_status,status,subtotal,total) VALUES('20000000-0000-4000-8000-000000000009',$1,'pickup','maya','paid','ready',100,100)",
    [owner],
  );
  // A custom deployment's broad defaults must not make new subscription secrets public.
  await db.exec(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter(
      (file) =>
        file.endsWith(".sql") &&
        file >= "20261003000300_customer_features.sql" &&
        (!beforeLegalRevision ||
          file < "20261007000100_customer_legal_revision.sql"),
    )
    .sort())
    await db.exec(
      readFileSync("supabase/migrations/" + file, "utf8").replace(
        "CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;",
        "",
      ),
    );
  return db;
}
test("legal revision preserves old acknowledgements and requires distinct acceptance of the current version", async () => {
  const db = await database(true);
  try {
    await db.query(
      "INSERT INTO legal_acknowledgements(user_id,version,source) VALUES($1,'2026-10-03','customer_review')",
      [owner],
    );
    await db.query(
      "INSERT INTO orders(customer_id,order_type,payment_method,subtotal,total,legal_version) VALUES($1,'pickup','cash',100,100,'2026-10-03')",
      [owner],
    );
    const before = (await db.query("SELECT * FROM legal_acknowledgements"))
      .rows;
    const ordersBefore = (await db.query("SELECT * FROM orders ORDER BY id"))
      .rows;
    await db.exec(
      readFileSync(
        "supabase/migrations/20261007000100_customer_legal_revision.sql",
        "utf8",
      ),
    );
    assert.deepEqual(
      (await db.query("SELECT * FROM legal_acknowledgements")).rows,
      before,
    );
    assert.deepEqual(
      (await db.query("SELECT * FROM orders ORDER BY id")).rows,
      ordersBefore,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM legal_acknowledgements WHERE user_id=$1 AND version='2026-10-07'",
          [owner],
        )
      ).rows.length,
      0,
    );
    await db.query(
      "INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('10000000-0000-4000-8000-000000000007','current@example.test','{\"jayds_legal_version\":\"2026-10-07\"}'),('10000000-0000-4000-8000-000000000008','unknown@example.test','{\"jayds_legal_version\":\"2030-01-01\"}')",
    );
    const signup = (
      await db.query<{ version: string; source: string }>(
        "SELECT version,source FROM legal_acknowledgements WHERE user_id='10000000-0000-4000-8000-000000000007'",
      )
    ).rows;
    assert.deepEqual(signup, [{ version: "2026-10-07", source: "signup" }]);
    assert.equal(
      (
        await db.query(
          "SELECT * FROM legal_acknowledgements WHERE user_id='10000000-0000-4000-8000-000000000008'",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "INSERT INTO legal_acknowledgements(user_id,version,source) VALUES($1,'2030-01-01','test')",
        [owner],
      ),
      /check constraint/,
    );
    await db.query(
      "INSERT INTO legal_acknowledgements(user_id,version,source) VALUES($1,'2026-10-07','customer_review') ON CONFLICT DO NOTHING",
      [owner],
    );
    await db.query(
      "INSERT INTO legal_acknowledgements(user_id,version,source) VALUES($1,'2026-10-07','retry') ON CONFLICT DO NOTHING",
      [owner],
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM legal_acknowledgements WHERE user_id=$1",
          [owner],
        )
      ).rows.length,
      2,
    );
    await assert.rejects(
      db.query(
        "UPDATE legal_acknowledgements SET version='2026-10-07' WHERE version='2026-10-03'",
      ),
      /append-only/,
    );
    await assert.rejects(
      db.query("DELETE FROM legal_acknowledgements"),
      /append-only/,
    );
    await db.exec("SET ROLE authenticated");
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    assert.equal(
      (await db.query("SELECT * FROM legal_acknowledgements")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "INSERT INTO legal_acknowledgements(user_id,version,source) VALUES($1,'2026-10-07','forged')",
        [other],
      ),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
async function subscription(
  db: PGlite,
  user: string | null,
  order: string | null,
  hash: string | null,
  suffix: string,
) {
  return (
    await db.query<{ id: string }>(
      "INSERT INTO customer_push_subscriptions(user_id,order_id,guest_hash,endpoint_hash,endpoint,p256dh,auth_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [user, order, hash, suffix, endpoint + suffix, keys.p256dh, keys.auth],
    )
  ).rows[0].id;
}
test("customer feature SQL protects legal/support records and guest notification grants across lease recovery", async () => {
  const db = await database();
  try {
    assert.equal(
      (await db.query("SELECT * FROM legal_acknowledgements")).rows.length,
      0,
    ); // No synthetic acceptance for historical accounts.
    assert.equal(
      (await db.query("SELECT * FROM customer_push_outbox")).rows.length,
      0,
    ); // Historical ready orders do not emit alerts during migration.
    await db.query(
      "INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('10000000-0000-4000-8000-000000000005','accepted@example.test','{\"jayds_legal_version\":\"2026-10-03\"}'),('10000000-0000-4000-8000-000000000006','unaccepted@example.test','{}')",
    );
    const signupAcks = (
      await db.query<{ user_id: string; source: string }>(
        "SELECT user_id,source FROM legal_acknowledgements",
      )
    ).rows;
    assert.equal(signupAcks.length, 1);
    assert.equal(signupAcks[0].user_id, "10000000-0000-4000-8000-000000000005");
    assert.equal(signupAcks[0].source, "signup");
    await db.query(
      "INSERT INTO legal_acknowledgements(user_id,version,source) VALUES($1,'2026-10-03','test')",
      [owner],
    );
    await assert.rejects(
      db.query(
        "UPDATE legal_acknowledgements SET source='forged' WHERE user_id=$1",
        [owner],
      ),
      /append-only/,
    );
    await assert.rejects(
      db.query("DELETE FROM legal_acknowledgements WHERE user_id=$1", [owner]),
      /append-only/,
    );
    const caseId = (
      await db.query<{ id: string }>(
        "INSERT INTO customer_support_cases(user_id,kind,subject,message) VALUES($1,'privacy','Private case','Test request') RETURNING id",
        [owner],
      )
    ).rows[0].id;
    await db.query(
      "SELECT set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",
      [staff],
    );
    await assert.rejects(
      db.query(
        "SELECT customer_support_update($1,'resolved','Staff response')",
        [caseId],
      ),
      /Admin review/,
    );
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    await db.query(
      "SELECT customer_support_update($1,'in_review','Admin response')",
      [caseId],
    );
    await db.query(
      "SELECT set_config('request.jwt.claim.role','service_role',false)",
    );
    const accountSub = await subscription(db, owner, null, null, "account");
    await assert.rejects(
      subscription(db, null, guestOrder, null, "missing-owner"),
      /check constraint|scoped order grant/,
    );
    await assert.rejects(
      subscription(db, null, guestOrder, guestHash, "missing-grant"),
      /scoped order grant/,
    );
    await db.query(
      "INSERT INTO customer_guest_order_grants(order_id,device_hash,scopes,expires_at) VALUES($1,$2,ARRAY['read'],now()+interval '1 day')",
      [guestOrder, guestHash],
    );
    await assert.rejects(
      subscription(db, null, guestOrder, guestHash, "read-only"),
      /scoped order grant/,
    );
    await db.query(
      "UPDATE customer_guest_order_grants SET scopes=ARRAY['read','manage'] WHERE order_id=$1",
      [guestOrder],
    );
    const guestSub = await subscription(
      db,
      null,
      guestOrder,
      guestHash,
      "guest",
    );
    await db.query(
      "UPDATE orders SET payment_status='paid',status='ready' WHERE id IN($1,$2)",
      [orderId, guestOrder],
    );
    const queued = (
      await db.query<{
        id: string;
        order_id: string;
        subscription_id: string;
        title: string;
        body: string;
      }>(
        "SELECT id,order_id,subscription_id,title,body FROM customer_push_outbox ORDER BY order_id",
      )
    ).rows;
    assert.equal(queued.length, 2);
    assert.equal(queued[0].title.includes("Coffee"), false);
    assert.equal(queued[0].body.includes("100"), false);
    const claimed = (
      await db.query<{ id: string; attempts: number }>(
        "SELECT * FROM customer_claim_push(25)",
      )
    ).rows;
    assert.equal(claimed.length, 2);
    assert.equal(
      (await db.query("SELECT * FROM customer_claim_push(25)")).rows.length,
      0,
    );
    const accountJob = queued.find(
      (row) => row.subscription_id === accountSub,
    )!.id;
    const guestJob = queued.find((row) => row.subscription_id === guestSub)!.id;
    assert.ok(
      (
        await db.query<{ result: unknown }>(
          "SELECT customer_push_delivery_context($1,1) result",
          [guestJob],
        )
      ).rows[0].result,
    );
    await db.query(
      "UPDATE customer_push_subscriptions SET user_id=$2 WHERE id=$1",
      [accountSub, other],
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM customer_push_outbox WHERE id=$1",
          [accountJob],
        )
      ).rows[0].status,
      "suppressed",
    );
    assert.equal(
      (
        await db.query<{ result: unknown }>(
          "SELECT customer_push_delivery_context($1,1) result",
          [accountJob],
        )
      ).rows[0].result,
      null,
    );
    await db.query(
      "UPDATE customer_guest_order_grants SET expires_at=now()-interval '1 second' WHERE order_id=$1",
      [guestOrder],
    );
    assert.equal(
      (
        await db.query<{ result: unknown }>(
          "SELECT customer_push_delivery_context($1,1) result",
          [guestJob],
        )
      ).rows[0].result,
      null,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM customer_push_outbox WHERE id=$1",
          [guestJob],
        )
      ).rows[0].status,
      "suppressed",
    );
    // A dead lease at the retry limit terminates, and an older lease generation cannot send.
    await db.query(
      "UPDATE customer_push_subscriptions SET user_id=$2 WHERE id=$1",
      [accountSub, owner],
    );
    const dead = (
      await db.query<{ id: string }>(
        "INSERT INTO customer_push_outbox(subscription_id,order_id,event_key,title,body,status,attempts,lease_until) VALUES($1,$2,'dead','Ready','Open order','sending',8,now()-interval '1 minute') RETURNING id",
        [accountSub, orderId],
      )
    ).rows[0].id;
    const recovered = (
      await db.query<{ id: string }>(
        "INSERT INTO customer_push_outbox(subscription_id,order_id,event_key,title,body,status,attempts,lease_until) VALUES($1,$2,$3,'Ready','Open order','sending',1,NULL) RETURNING id",
        [accountSub, orderId, `${orderId}:ready-recovered`],
      )
    ).rows[0].id;
    const recovery = (
      await db.query<{ id: string; attempts: number }>(
        "SELECT * FROM customer_claim_push(25)",
      )
    ).rows;
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM customer_push_outbox WHERE id=$1",
          [dead],
        )
      ).rows[0].status,
      "failed",
    );
    assert.equal(recovery.find((row) => row.id === recovered)?.attempts, 2);
    assert.equal(
      (
        await db.query<{ result: unknown }>(
          "SELECT customer_push_delivery_context($1,1) result",
          [recovered],
        )
      ).rows[0].result,
      null,
    );
    assert.ok(
      (
        await db.query<{ result: unknown }>(
          "SELECT customer_push_delivery_context($1,2) result",
          [recovered],
        )
      ).rows[0].result,
    );
    await db.exec("SET ROLE authenticated");
    await db.query(
      "SELECT set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",
      [other],
    );
    await assert.rejects(
      db.query(
        "UPDATE profiles SET role='admin',is_approved=true WHERE id=$1",
        [other],
      ),
      /Approved administrator/,
    );
    await assert.rejects(
      db.query("UPDATE profiles SET points=999999 WHERE id=$1", [other]),
      /Trusted loyalty/,
    );
    assert.equal(
      (await db.query("SELECT * FROM customer_support_cases")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("SELECT endpoint,auth_key FROM customer_push_subscriptions"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("SELECT * FROM customer_claim_push(1)"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("SELECT customer_push_delivery_context($1,2)", [recovered]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
