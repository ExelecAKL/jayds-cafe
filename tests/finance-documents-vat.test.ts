import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const actor = "10000000-0000-4000-8000-000000000001",
  stock = "30000000-0000-4000-8000-000000000001";
async function database() {
  const db = new PGlite();
  await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
  await db.exec(
    "ALTER TABLE profiles ADD COLUMN is_approved boolean DEFAULT true,ADD COLUMN full_name text; ALTER TABLE orders ADD COLUMN payment_review_required boolean DEFAULT false; CREATE TABLE pickup_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),token_hash text UNIQUE,is_used boolean DEFAULT false); CREATE TABLE guest_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),receipt_token text UNIQUE,receipt_data jsonb,created_at timestamptz DEFAULT now(),expires_at timestamptz); CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  await db.query("INSERT INTO profiles(id,role) VALUES($1,'admin')", [actor]);
  await db.query(
    "INSERT INTO ingredients(id,name,current_stock,cost_per_unit) VALUES($1,'Beans',0,1.12)",
    [stock],
  );
  for (const file of [
    "20261002000100_inventory_operations.sql",
    "20261002000200_atomic_orders_forecasts.sql",
    "20261002000300_operations_overview.sql",
    "20261002000400_pos_cashier.sql",
    "20261013000400_finance_invoices.sql",
    "20261016000600_finance_documents.sql",
    "20261016000700_purchase_vat.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.query(
    "SELECT set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claim.sub',$1,false)",
    [actor],
  );
  return db;
}
async function document(db: PGlite, expired = false) {
  return (
    await db.query<{ id: string }>(
      "INSERT INTO finance_documents(actor_id,storage_path,byte_size,expires_at) VALUES($1,gen_random_uuid()::text||'.webp',500,now()+($2::integer||' hours')::interval) RETURNING id",
      [actor, expired ? -1 : 24],
    )
  ).rows[0].id;
}
const today = "(now() AT TIME ZONE 'Asia/Manila')::date";
async function report(db: PGlite) {
  return (
    await db.query<{ value: Record<string, number> }>(
      `SELECT finance_report(${today},${today}) value`,
    )
  ).rows[0].value;
}

test("invoice documents link atomically to immutable expenses and input VAT requires current evidence", async () => {
  const db = await database();
  try {
    const photo = await document(db),
      request = {
        request_key: crypto.randomUUID(),
        business_date: new Date().toLocaleDateString("en-CA", {
          timeZone: "Asia/Manila",
        }),
        category: "utilities",
        description: "Electricity bill",
        amount: 112,
        input_vat: 12,
        input_vat_reviewed: true,
        document_reference: "POWER-100",
        document_id: photo,
      };
    const post = (body: unknown) =>
      db.query<{ id: string }>("SELECT finance_post_expense($1) id", [
        JSON.stringify(body),
      ]);
    await assert.rejects(
      post({ ...request, document_id: null }),
      /Upload.*invoice/,
    );
    await assert.rejects(
      post({ ...request, document_id: await document(db, true) }),
      /unavailable/,
    );
    const id = (await post(request)).rows[0].id;
    assert.equal((await post(request)).rows[0].id, id);
    assert.equal(
      (
        await db.query<{ document_id: string }>(
          "SELECT document_id FROM finance_expenses WHERE id=$1",
          [id],
        )
      ).rows[0].document_id,
      photo,
    );
    assert.equal(
      (
        await db.query<{ linked_id: string }>(
          "SELECT linked_id FROM finance_documents WHERE id=$1",
          [photo],
        )
      ).rows[0].linked_id,
      id,
    );
    await assert.rejects(
      post({ ...request, request_key: crypto.randomUUID() }),
      /another entry/,
    );
    assert.equal((await report(db)).operating_expenses, 10000);
    assert.equal((await report(db)).input_vat, 1200);
    await db.query(
      "SELECT finance_reverse_expense($1,'Correcting duplicate utility bill')",
      [id],
    );
    assert.equal((await report(db)).operating_expenses, 0);
    assert.equal((await report(db)).input_vat, 0);
    await assert.rejects(
      db.query("UPDATE finance_expenses SET document_id=NULL WHERE id=$1", [
        id,
      ]),
      /immutable/,
    );
    await db.exec(
      "SELECT set_config('request.jwt.claim.role','authenticated',false); SELECT set_config('request.jwt.claim.sub','',false)",
    );
    await assert.rejects(
      post({ ...request, request_key: crypto.randomUUID() }),
      /Admin access/,
    );
  } finally {
    await db.close();
  }
});

test("purchase VAT reconciles past/future consumption, write-offs and inventory without duplicate expenses or stock mutations", async () => {
  const db = await database();
  try {
    const supplier = (
      await db.query<{ id: string }>(
        "INSERT INTO suppliers(name) VALUES('Fixture Dairy Supply') RETURNING id",
      )
    ).rows[0].id;
    const po = (
      await db.query<{ id: string }>(
        "INSERT INTO purchase_orders(supplier_id,status) VALUES($1,'received') RETURNING id",
        [supplier],
      )
    ).rows[0].id;
    const receipt = (
      await db.query<{ id: string }>(
        "INSERT INTO goods_receipts(purchase_order_id,reference,idempotency_key,fingerprint,actor_id) VALUES($1,'INV-100',gen_random_uuid(),'fixture',$2) RETURNING id",
        [po, actor],
      )
    ).rows[0].id;
    const batch = (
      await db.query<{ id: string }>(
        "INSERT INTO stock_batches(ingredient_id,batch_code,quantity,unit_cost,receipt_id) VALUES($1,'LOT-100',100,1.12,$2) RETURNING id",
        [stock, receipt],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO stock_movements(ingredient_id,batch_id,quantity,movement_type,balance_after,reason,source_id) VALUES($1,$2,100,'receipt',100,'INV-100',$3)",
      [stock, batch, receipt],
    );
    const consumeStock = async (qty: number, kind: string) => {
      await db.query(
        "UPDATE stock_batches SET quantity=quantity-$1 WHERE id=$2",
        [qty, batch],
      );
      await db.query(
        "INSERT INTO stock_movements(ingredient_id,batch_id,quantity,movement_type,balance_after,reason) SELECT $1,$2,-($3::numeric),$4,current_stock,'Recorded stock use' FROM ingredients WHERE id=$1",
        [stock, batch, qty, kind],
      );
    };
    await consumeStock(20, "consumption");
    const entry = {
      request_key: crypto.randomUUID(),
      receipt_id: receipt,
      input_vat: 12,
      reviewed: true,
      document_reference: "SUPPLIER-100",
      document_id: await document(db),
    };
    const post = (value: unknown) =>
      db.query<{ id: string }>("SELECT finance_review_purchase_vat($1) id", [
        JSON.stringify(value),
      ]);
    const before = (
      await db.query(
        "SELECT quantity,reserved,unit_cost FROM stock_batches WHERE id=$1",
        [batch],
      )
    ).rows;
    const id = (await post(entry)).rows[0].id;
    assert.equal((await post(entry)).rows[0].id, id);
    await assert.rejects(post({ ...entry, input_vat: 13 }), /changed data/);
    let r = await report(db);
    assert.equal(r.input_vat, 1200);
    assert.equal(r.cogs, 2000);
    assert.equal(r.inventory_value, 8000);
    assert.equal(r.operating_expenses, 0);
    assert.deepEqual(
      (
        await db.query(
          "SELECT quantity,reserved,unit_cost FROM stock_batches WHERE id=$1",
          [batch],
        )
      ).rows,
      before,
    );
    await consumeStock(30, "consumption");
    await consumeStock(10, "waste");
    r = await report(db);
    assert.equal(r.cogs, 5000);
    assert.equal(r.stock_writeoffs, 1000);
    assert.equal(r.inventory_value, 4000);
    assert.equal(r.operating_profit, -6000);
    await db.query(
      "SELECT finance_reverse_purchase_vat($1,'Supplier VAT invoice was not eligible')",
      [id],
    );
    r = await report(db);
    assert.equal(r.input_vat, 0);
    assert.equal(r.cogs, 5600);
    assert.equal(r.stock_writeoffs, 1120);
    assert.equal(r.inventory_value, 4480);
    assert.equal(r.operating_expenses, 0);
    await assert.rejects(
      db.query("SELECT finance_reverse_purchase_vat($1,'Another reversal')", [
        id,
      ]),
      /already reversed/,
    );
    await post({
      ...entry,
      request_key: crypto.randomUUID(),
      document_id: await document(db),
    });
    r = await report(db);
    assert.equal(r.input_vat, 1200);
    assert.equal(r.cogs, 5000);
    assert.equal(r.stock_writeoffs, 1000);
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*) FROM finance_expenses",
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*) FROM finance_invoices",
        )
      ).rows[0].count,
      0,
    );
  } finally {
    await db.close();
  }
});
