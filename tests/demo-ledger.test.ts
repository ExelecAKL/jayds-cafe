// Full production migrations, isolated PostgreSQL. No hosted data or provider writes.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
const admin = "10000000-0000-4000-8000-000000000001";
const customer = "10000000-0000-4000-8000-000000000002";
const staff = "10000000-0000-4000-8000-000000000003";
const item = "20000000-0000-4000-8000-000000000001";
const stock = "30000000-0000-4000-8000-000000000001";
const voucher = "40000000-0000-4000-8000-000000000001";
const checkout = "50000000-0000-4000-8000-000000000001";

test("full-schema Maya/voucher pickup, Register cash and mobile cash handover credit loyalty and consume once", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth; CREATE SCHEMA cron; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE SCHEMA extensions;
   CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
   CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $$ SELECT substring(decode(repeat(md5(gen_random_uuid()::text),ceil($1/16.0)::integer),'hex') FROM 1 FOR $1) $$;
   SET search_path = public, extensions;
   CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
   CREATE PUBLICATION supabase_realtime;
   SELECT set_config('request.jwt.claim.role','service_role',false);`);
    const migrations = readdirSync("supabase/migrations")
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const apply = async (file: string) =>
      db.exec(
        readFileSync("supabase/migrations/" + file, "utf8").replace(
          "CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;",
          "",
        ),
      );
    for (const file of migrations.filter((file) => file < "20261002000100"))
      await apply(file);
    await db.query(
      "INSERT INTO auth.users(id,email) VALUES($1,'admin@demo.example.test'),($2,'customer@demo.example.test'),($3,'staff@demo.example.test')",
      [admin, customer, staff],
    );
    await db.query(
      "UPDATE profiles SET role=CASE WHEN id=$1 THEN 'admin'::user_role WHEN id=$2 THEN 'staff'::user_role ELSE 'customer'::user_role END,is_approved=true,points=100 WHERE id=ANY($3::uuid[])",
      [admin, staff, [admin, customer, staff]],
    );
    await db.query(
      "INSERT INTO ingredients(id,name,unit,current_stock,cost_per_unit) VALUES($1,'Demo beans','g',10,1)",
      [stock],
    );
    await db.query(
      "INSERT INTO menu_items(id,name,price) VALUES($1,'Demo coffee',100)",
      [item],
    );
    await db.query(
      "INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used) VALUES($1,$2,2)",
      [item, stock],
    );
    await db.query(
      "INSERT INTO vouchers(id,code,discount_type,discount_value,max_uses) VALUES($1,'DEMO10','fixed',10,10)",
      [voucher],
    );
    const cryptoFix = "20261007000300_pickup_token_crypto_schema.sql";
    for (const file of migrations.filter(
      (file) => file >= "20261002000100" && file !== cryptoFix,
    ))
      await apply(file);
    await db.exec("UPDATE inventory_settings SET enforcement_enabled=true");
    const state = async () =>
      (
        await db.query<{
          value: {
            points: number;
            spent: number;
            orders: number;
            stock: number;
            reserved: number;
            uses: number;
            consumptions: number;
          };
        }>(
          `SELECT jsonb_build_object('points',p.points,'spent',p.total_spent,'orders',p.total_orders,'stock',s.current_stock,'reserved',s.reserved_stock,'uses',v.uses_count,'consumptions',(SELECT count(*) FROM stock_movements WHERE ingredient_id=$2 AND movement_type='consumption')) value FROM profiles p CROSS JOIN stock_overview s CROSS JOIN vouchers v WHERE p.id=$1 AND s.id=$2 AND v.id=$3`,
          [customer, stock, voucher],
        )
      ).rows[0].value;
    const stages: {
      step: string;
      balances: Awaited<ReturnType<typeof state>>;
    }[] = [];
    const snapshot = async (step: string) => {
      const balances = await state();
      stages.push({ step, balances });
      return balances;
    };
    const lines = [
      {
        menu_item_id: item,
        name: "Demo coffee",
        price: 100,
        quantity: 1,
        subtotal: 100,
        variants: [],
      },
    ];
    const submit = async (key: string) =>
      (
        await db.query<{ value: { id: string; total: number } }>(
          "SELECT inv_create_order($1,$2,$3,$4,$5,$3) value",
          [
            JSON.stringify({
              order_source: "app",
              customer_id: customer,
              order_type: "pickup",
              payment_method: "maya",
              subtotal: 100,
              discount: 11,
              total: 89,
              points_redeemed: 10,
              legal_version: "2026-10-07",
            }),
            JSON.stringify(lines),
            key,
            customer,
            voucher,
          ],
        )
      ).rows[0].value;
    assert.deepEqual(await snapshot("Opening"), {
      points: 100,
      spent: 0,
      orders: 0,
      stock: 10,
      reserved: 0,
      uses: 0,
      consumptions: 0,
    });
    // Reproduce the actual hosted schema before the fix. The old public test
    // stub hid this failure even though real checkout had a public-only path.
    assert.equal(
      (
        await db.query<{ fn: string | null }>(
          "SELECT to_regprocedure('public.gen_random_bytes(integer)') fn",
        )
      ).rows[0].fn,
      null,
    );
    await assert.rejects(
      submit("demo-crypto-regression-00001"),
      /gen_random_bytes\(integer\).*does not exist/,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM orders",
        )
      ).rows[0].count,
      0,
    );
    assert.equal((await state()).points, 100);
    assert.equal((await state()).uses, 0);
    await apply(cryptoFix);
    const sale = await submit("demo-app-submit-00000001");
    assert.equal(sale.total, 89);
    assert.equal((await submit("demo-app-submit-00000001")).id, sale.id);
    assert.deepEqual(await snapshot("Customer submits voucher and points"), {
      points: 90,
      spent: 0,
      orders: 0,
      stock: 10,
      reserved: 2,
      uses: 1,
      consumptions: 0,
    });
    const attempt = (
      await db.query<{ value: { attempt: { id: string } } }>(
        "SELECT customer_claim_provider_attempt($1,'maya',$2) value",
        [sale.id, customer],
      )
    ).rows[0].value.attempt.id;
    await db.query(
      "SELECT customer_finish_provider_attempt($1,'ready',$2,'https://payments-web-sandbox.maya.ph/fixture')",
      [attempt, checkout],
    );
    await db.query(
      "SELECT customer_finalize_maya_payment($1,$2,89,'PHP','paid')",
      [checkout, checkout],
    );
    await db.query(
      "SELECT customer_finalize_maya_payment($1,$2,89,'PHP','paid')",
      [checkout, checkout],
    );
    assert.equal(
      (await snapshot("Verified payment; no early rewards")).points,
      90,
    );
    for (const action of ["prepare", "prepare", "ready"])
      await db.query("SELECT pos_order_action($1,$2,$3,NULL)", [
        staff,
        sale.id,
        action,
      ]);
    assert.deepEqual(await snapshot("Cashier prepares once"), {
      points: 90,
      spent: 0,
      orders: 0,
      stock: 8,
      reserved: 0,
      uses: 1,
      consumptions: 1,
    });
    const token = (
      await db.query<{ token_hash: string }>(
        "SELECT token_hash FROM pickup_tokens WHERE order_id=$1",
        [sale.id],
      )
    ).rows[0].token_hash;
    const qr = `pickup:${sale.id}:${token}`;
    await db.query("SELECT pos_pickup($1,$2)", [staff, qr]);
    await db.query("SELECT pos_pickup($1,$2)", [staff, qr]);
    assert.deepEqual(await snapshot("Pickup credits loyalty exactly once"), {
      points: 98,
      spent: 89,
      orders: 1,
      stock: 8,
      reserved: 0,
      uses: 1,
      consumptions: 1,
    });
    assert.equal(
      (
        await db.query<{ points_earned: number }>(
          "SELECT points_earned FROM orders WHERE id=$1",
          [sale.id],
        )
      ).rows[0].points_earned,
      8,
    );
    const cash = (
      await db.query<{ value: { id: string } }>(
        "SELECT pos_cash_checkout($1,$2,$2,120,100,$3,$4,NULL) value",
        [
          staff,
          "demo-pos-cash-000000001",
          JSON.stringify({
            order_source: "pos",
            customer_id: customer,
            order_type: "pickup",
            payment_method: "cash",
            subtotal: 100,
            total: 100,
            discount: 0,
            points_redeemed: 0,
          }),
          JSON.stringify(lines),
        ],
      )
    ).rows[0].value;
    for (const action of ["prepare", "ready", "collect"])
      await db.query("SELECT pos_order_action($1,$2,$3,NULL)", [
        staff,
        cash.id,
        action,
      ]);
    assert.deepEqual(await snapshot("Cash sale completes and earns points"), {
      points: 108,
      spent: 189,
      orders: 2,
      stock: 6,
      reserved: 0,
      uses: 1,
      consumptions: 2,
    });
    const cancelled = await submit("demo-app-cancel-00000001");
    assert.equal((await state()).points, 98);
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
      cancelled.id,
    ]);
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
      cancelled.id,
    ]);
    assert.deepEqual(
      await snapshot(
        "Cancellation returns rewards and releases reservations once",
      ),
      {
        points: 108,
        spent: 189,
        orders: 2,
        stock: 6,
        reserved: 0,
        uses: 1,
        consumptions: 2,
      },
    );
    const mobile = (
      await db.query<{ value: { id: string } }>(
        "SELECT inv_create_order($1,$2,$3,$4,$5,$3) value",
        [
          JSON.stringify({
            order_source: "app",
            customer_id: customer,
            order_type: "pickup",
            payment_method: "cash",
            subtotal: 100,
            discount: 11,
            total: 89,
            points_redeemed: 10,
          }),
          JSON.stringify(lines),
          "demo-mobile-cash-0000001",
          customer,
          voucher,
        ],
      )
    ).rows[0].value;
    for (const action of ["confirm", "prepare", "ready"])
      await db.query("SELECT pos_order_action($1,$2,$3,NULL)", [
        staff,
        mobile.id,
        action,
      ]);
    assert.deepEqual(
      await snapshot(
        "Mobile cash ready, still unpaid and no completion rewards",
      ),
      {
        points: 98,
        spent: 189,
        orders: 2,
        stock: 4,
        reserved: 0,
        uses: 2,
        consumptions: 3,
      },
    );
    assert.equal(
      (
        await db.query<{ payment_status: string }>(
          "SELECT payment_status FROM orders WHERE id=$1",
          [mobile.id],
        )
      ).rows[0].payment_status,
      "pending",
    );
    const mobileToken = (
      await db.query<{ token_hash: string }>(
        "SELECT token_hash FROM pickup_tokens WHERE order_id=$1",
        [mobile.id],
      )
    ).rows[0].token_hash;
    const handoverKey = "demo-cash-handover-000001",
      mobileQr = `pickup:${mobile.id}:${mobileToken}`;
    for (let retry = 0; retry < 2; retry++)
      await db.query("SELECT pos_cash_pickup($1,$2,$2,$3,100,89)", [
        staff,
        handoverKey,
        mobileQr,
      ]);
    assert.deepEqual(
      await snapshot("Mobile QR cash handover and retry credit once"),
      {
        points: 106,
        spent: 278,
        orders: 3,
        stock: 4,
        reserved: 0,
        uses: 2,
        consumptions: 3,
      },
    );
    assert.equal(
      (
        await db.query("SELECT * FROM pos_cash_payments WHERE order_id=$1", [
          mobile.id,
        ])
      ).rows.length,
      1,
    );
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    const dashboard = (
      await db.query<{
        value: { revenue: number; orders: number; active: number };
      }>("SELECT inv_dashboard(7) value")
    ).rows[0].value;
    assert.equal(dashboard.revenue, 278);
    assert.equal(dashboard.orders, 4);
    assert.equal(dashboard.active, 0);
    const report = {
      isolatedFullProductionSchema: true,
      providerSettlementFixture: true,
      liveDatabaseWrites: false,
      voucherAndPointsTotal: 89,
      duplicateSubmissionSafe: true,
      duplicatePaymentSafe: true,
      duplicatePickupSafe: true,
      stages,
      adminRevenue: dashboard.revenue,
    };
    writeFileSync(
      ".codex-logs/demo-ledger-verification.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await db.close();
  }
});
