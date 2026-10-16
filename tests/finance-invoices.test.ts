import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  calculateFinancials,
  type FinancialBreakdown,
} from "../packages/shared/src/finance/calculations.ts";
const admin = "10000000-0000-4000-8000-000000000001",
  staff = "10000000-0000-4000-8000-000000000002",
  customer = "10000000-0000-4000-8000-000000000003";
const menu = "20000000-0000-4000-8000-000000000001",
  stock = "30000000-0000-4000-8000-000000000001";
const identity = {
  registered_name: "INVOICE FIXTURE OWNER",
  trade_name: "Fixture Café",
  tin: "000-000-000",
  branch_code: "00000",
  registered_address: "Test-only invoice address",
  invoice_prefix: "JD",
  invoices_enabled: true,
  compliance_verified: false,
  authority_basis: "Test-only owner statement",
  delivery_tax_treatment: "pending",
  tax_year: 2026,
};
async function database() {
  const db = new PGlite();
  await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
  await db.exec(`ALTER TABLE profiles ADD COLUMN is_approved boolean DEFAULT true,ADD COLUMN full_name text;
 ALTER TABLE orders ADD COLUMN payment_review_required boolean DEFAULT false;
 CREATE TABLE pickup_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),token_hash text UNIQUE,is_used boolean DEFAULT false);
 CREATE TABLE guest_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),receipt_token text UNIQUE,receipt_data jsonb,created_at timestamptz DEFAULT now(),expires_at timestamptz DEFAULT now()+interval '30 days');`);
  await db.query(
    "SELECT set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claim.sub',$1,false)",
    [admin],
  );
  await db.query(
    "INSERT INTO profiles(id,role,full_name) VALUES($1,'admin','Fixture Admin'),($2,'staff','Fixture Staff'),($3,'customer','Fixture Customer')",
    [admin, staff, customer],
  );
  await db.query(
    "INSERT INTO ingredients(id,name,current_stock,cost_per_unit) VALUES($1,'Fixture beans',10000,2)",
    [stock],
  );
  await db.query(
    "INSERT INTO menu_items(id,name,price) VALUES($1,'Fixture Coffee',112)",
    [menu],
  );
  await db.query(
    "INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used) VALUES($1,$2,2)",
    [menu, stock],
  );
  for (const file of [
    "20261002000100_inventory_operations.sql",
    "20261002000200_atomic_orders_forecasts.sql",
    "20261002000300_operations_overview.sql",
    "20261002000400_pos_cashier.sql",
    "20261013000400_finance_invoices.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.exec("UPDATE inventory_settings SET enforcement_enabled=true");
  await db.query("SELECT finance_save_settings($1)", [
    JSON.stringify(identity),
  ]);
  return db;
}
async function create(
  db: PGlite,
  key: string,
  extra: Record<string, unknown> = {},
) {
  const order = {
    order_source: "app",
    order_type: "pickup",
    payment_method: "maya",
    customer_id: customer,
    subtotal: 112,
    discount: 0,
    total: 112,
    points_redeemed: 0,
    ...extra,
  };
  const items = [
    {
      menu_item_id: menu,
      name: "Fixture Coffee",
      price: 112,
      quantity: 1,
      subtotal: 112,
      variants: [],
    },
  ];
  const { rows } = await db.query<{ result: { id: string } }>(
    "SELECT inv_create_order($1,$2,$3,$4,NULL,$3) result",
    [JSON.stringify(order), JSON.stringify(items), key, customer],
  );
  return rows[0].result.id;
}
test("invoices post exactly once after confirmed payment, keep immutable VAT-inclusive snapshots, and link refund credit notes", async () => {
  const db = await database();
  try {
    const id = await create(db, "finance-sale-retry-0001");
    assert.equal(
      (await db.query("SELECT * FROM finance_invoices")).rows.length,
      0,
    );
    await db.query(
      "UPDATE orders SET payment_status='paid',status='confirmed' WHERE id=$1",
      [id],
    );
    await db.query("UPDATE orders SET payment_status='paid' WHERE id=$1", [id]);
    assert.equal(await create(db, "finance-sale-retry-0001"), id);
    const invoices = await db.query<{
      id: string;
      number: string;
      breakdown: FinancialBreakdown;
      business: { numbering: string };
    }>("SELECT * FROM finance_invoices");
    assert.equal(invoices.rows.length, 1);
    assert.equal(invoices.rows[0].number, "JD-00000001");
    assert.equal(invoices.rows[0].business.numbering, "system_generated");
    assert.equal(invoices.rows[0].breakdown.total, 11200);
    assert.equal(invoices.rows[0].breakdown.net_sales, 10000);
    assert.equal(invoices.rows[0].breakdown.vat, 1200);
    for (const sql of [
      "UPDATE order_financials SET breakdown='{}'",
      "DELETE FROM finance_invoices",
      "UPDATE financial_events SET kind='refund'",
      "UPDATE orders SET total=1 WHERE id=$1",
    ])
      await assert.rejects(
        db.query(sql, sql.includes("$1") ? [id] : []),
        /immutable|reversal/,
      );
    await db.query("SELECT finance_save_settings($1)", [
      JSON.stringify({ ...identity, trade_name: "Updated fixture name" }),
    ]);
    assert.equal(
      (
        await db.query<{ business: { trade_name: string } }>(
          "SELECT business FROM finance_invoices",
        )
      ).rows[0].business.trade_name,
      "Fixture Café",
    );
    await db.query("UPDATE orders SET payment_status='refunded' WHERE id=$1", [
      id,
    ]);
    await db.query("UPDATE orders SET payment_status='refunded' WHERE id=$1", [
      id,
    ]);
    const notes = await db.query<{
      original_invoice: string;
      original_number: string;
      number: string;
    }>("SELECT * FROM finance_invoices WHERE kind='credit_note'");
    assert.equal(notes.rows.length, 1);
    assert.equal(notes.rows[0].original_invoice, invoices.rows[0].id);
    assert.equal(notes.rows[0].original_number, "JD-00000001");
    assert.equal(notes.rows[0].number, "JD-CN-00000001");
    const { rows } = await db.query<{
      r: { net_sales: number; output_vat: number };
    }>(
      "SELECT finance_report((now() AT TIME ZONE 'Asia/Manila')::date,(now() AT TIME ZONE 'Asia/Manila')::date) r",
    );
    assert.equal(rows[0].r.net_sales, 0);
    assert.equal(rows[0].r.output_vat, 0);
  } finally {
    await db.close();
  }
});
test("cancelled, disputed and historical payments cannot create invented sales or VAT invoices", async () => {
  const db = await database();
  try {
    const late = await create(db, "finance-late-payment-0001");
    await db.query(
      "UPDATE orders SET status='cancelled',payment_status='paid',payment_review_required=true WHERE id=$1",
      [late],
    );
    const review = await create(db, "finance-disputed-payment-0001");
    await db.query(
      "UPDATE orders SET status='confirmed',payment_status='paid',payment_review_required=true WHERE id=$1",
      [review],
    );
    await db.exec(
      "INSERT INTO orders(subtotal,total,payment_status,status) VALUES(112,112,'paid','completed')",
    );
    assert.equal(
      (await db.query("SELECT * FROM financial_events")).rows.length,
      0,
    );
    await db.query(
      "UPDATE orders SET payment_review_required=false WHERE id=$1",
      [review],
    );
    assert.equal(
      (await db.query("SELECT * FROM financial_events")).rows.length,
      1,
    );
    await db.query("SELECT finance_save_settings($1)", [
      JSON.stringify(identity),
    ]);
    assert.equal(
      (await db.query("SELECT * FROM finance_invoices")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
test("finance permissions require approved Admin and receipt tokens expose only their own issued invoice", async () => {
  const db = await database();
  try {
    const id = await create(db, "finance-private-invoice-0001");
    await db.query(
      "UPDATE orders SET status='confirmed',payment_status='paid' WHERE id=$1",
      [id],
    );
    await db.query("SELECT pos_ensure_receipt($1)", [id]);
    const { rows } = await db.query<{ receipt_token: string }>(
      "SELECT receipt_token FROM guest_receipts WHERE order_id=$1",
      [id],
    );
    await db.exec(
      "GRANT USAGE ON SCHEMA public,auth TO authenticated; SET ROLE authenticated",
    );
    await db.query(
      "SELECT set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",
      [customer],
    );
    assert.equal(
      (await db.query("SELECT * FROM finance_invoices")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("SELECT finance_report(current_date,current_date)"),
      /Approved Admin/,
    );
    await assert.rejects(
      db.query("SELECT finance_save_settings($1)", [JSON.stringify(identity)]),
      /Approved Admin/,
    );
    const receipt = await db.query<{
      r: { receipt_data: { invoice: { order_id: string } } };
    }>("SELECT get_guest_receipt($1) r", [rows[0].receipt_token]);
    assert.equal(receipt.rows[0].r.receipt_data.invoice.order_id, id);
    assert.equal(
      (await db.query<{ r: null }>("SELECT get_guest_receipt('wrong-token') r"))
        .rows[0].r,
      null,
    );
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    assert.equal(
      (await db.query("SELECT * FROM finance_invoices")).rows.length,
      1,
    );
    await db.exec(
      "RESET ROLE; UPDATE profiles SET is_approved=false WHERE role='admin'; SET ROLE authenticated",
    );
    await assert.rejects(
      db.query("SELECT finance_report(current_date,current_date)"),
      /Approved Admin/,
    );
  } finally {
    await db.close();
  }
});
test("expense retries, input VAT evidence, reversals and recorded consumption costs avoid double counting", async () => {
  const db = await database();
  try {
    const expense = {
      request_key: "50000000-0000-4000-8000-000000000001",
      business_date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      category: "utilities",
      description: "Fixture utility invoice",
      amount: 112,
      input_vat: 12,
      input_vat_reviewed: true,
      document_reference: "FIXTURE-001",
    };
    const save = async (value: Record<string, unknown>) =>
      (
        await db.query<{ id: string }>("SELECT finance_post_expense($1) id", [
          JSON.stringify(value),
        ])
      ).rows[0].id;
    const id = await save(expense);
    assert.equal(await save(expense), id);
    await assert.rejects(save({ ...expense, amount: 115 }), /different data/);
    await assert.rejects(
      save({
        ...expense,
        request_key: "50000000-0000-4000-8000-000000000002",
        document_reference: null,
      }),
      /check constraint/,
    );
    await assert.rejects(
      save({
        ...expense,
        request_key: "50000000-0000-4000-8000-000000000003",
        category: "inventory",
      }),
      /Purchasing/,
    );
    const order = await create(db, "finance-stock-cost-sale-0001");
    await db.query(
      "UPDATE orders SET status='confirmed',payment_status='paid' WHERE id=$1",
      [order],
    );
    await db.query("UPDATE orders SET status='preparing' WHERE id=$1", [order]);
    await db.exec("UPDATE stock_batches SET unit_cost=99");
    let report = (
      await db.query<{
        r: {
          cogs: number;
          operating_expenses: number;
          input_vat: number;
          operating_profit: number;
        };
      }>("SELECT finance_report(current_date,current_date) r")
    ).rows[0].r;
    assert.equal(report.cogs, 400);
    assert.equal(report.operating_expenses, 10000);
    assert.equal(report.input_vat, 1200);
    assert.equal(report.operating_profit, -400);
    await db.query(
      "SELECT finance_reverse_expense($1,'Duplicate utility posting')",
      [id],
    );
    report = (
      await db.query<{ r: typeof report }>(
        "SELECT finance_report(current_date,current_date) r",
      )
    ).rows[0].r;
    assert.equal(report.operating_expenses, 0);
    assert.equal(report.input_vat, 0);
    assert.equal(report.operating_profit, 9600);
  } finally {
    await db.close();
  }
});
test("server report includes more than 200 sales and Philippine dates regardless of session timezone", async () => {
  const db = await database();
  try {
    const snapshot = calculateFinancials({
      items: [
        { menu_item_id: menu, name: "Fixture Coffee", price: 112, quantity: 1 },
      ],
    });
    await db.query(
      `WITH ids AS (INSERT INTO orders(subtotal,total,status,payment_status,created_at) SELECT 112,112,'confirmed','paid','2026-10-12T16:01:00Z' FROM generate_series(1,205) RETURNING id)
   INSERT INTO order_financials(order_id,breakdown) SELECT id,$1 FROM ids`,
      [JSON.stringify(snapshot)],
    );
    await db.query(
      "INSERT INTO financial_events(order_id,kind,breakdown,business_date) SELECT order_id,'sale',breakdown,'2026-10-13' FROM order_financials",
    );
    await db.exec("SET TIME ZONE 'America/New_York'");
    const { rows } = await db.query<{
      r: {
        net_sales: number;
        output_vat: number;
        ytd_osd_gross_sales: number;
        daily: { business_date: string }[];
      };
    }>("SELECT finance_report('2026-10-13','2026-10-13') r");
    assert.equal(rows[0].r.net_sales, 2050000);
    assert.equal(rows[0].r.output_vat, 246000);
    assert.equal(rows[0].r.daily.length, 1);
    assert.equal(rows[0].r.daily[0].business_date, "2026-10-13");
    assert.equal(rows[0].r.ytd_osd_gross_sales, 2050000);
  } finally {
    await db.close();
  }
});
test("incomplete snapshots roll back checkout and exhausted configured numbering never rolls back a verified payment", async () => {
  const db = await database();
  try {
    const q = calculateFinancials({
      items: [
        { menu_item_id: menu, name: "Fixture Coffee", price: 112, quantity: 1 },
      ],
    });
    await assert.rejects(
      create(db, "finance-missing-field-001", {
        financial_breakdown: { ...q, total: null },
      }),
      /integer centavos/,
    );
    assert.equal((await db.query("SELECT * FROM orders")).rows.length, 0);
    for (const [index, removedBenefit] of [
      { ...q, mode: "statutory" },
      { ...q, vat_relief: 1200 },
      { ...q, exempt_sales: 10000 },
      { ...q, lines: [{ ...q.lines[0], eligible_quantity: 1 }] },
    ].entries()) {
      await assert.rejects(
        create(db, `finance-removed-benefit-${index}`, {
          financial_breakdown: removedBenefit,
        }),
        /Personal-benefit quotes are unavailable/,
      );
    }
    assert.equal((await db.query("SELECT * FROM orders")).rows.length, 0);
    const setup = {
      ...identity,
      compliance_verified: true,
      authorization_reference: "TEST-ONLY-NUMBERING-REFERENCE",
      authorization_date: "2026-10-16",
      registered_serial_start: 1,
      registered_serial_end: 1,
    };
    await db.query("SELECT finance_save_settings($1)", [JSON.stringify(setup)]);
    const first = await create(db, "finance-numbering-range-001"),
      second = await create(db, "finance-numbering-range-002");
    await db.query(
      "UPDATE orders SET status='confirmed',payment_status='paid' WHERE id=ANY($1::uuid[])",
      [[first, second]],
    );
    assert.equal(
      (await db.query("SELECT * FROM orders WHERE payment_status='paid'")).rows
        .length,
      2,
    );
    assert.equal(
      (await db.query("SELECT * FROM financial_events")).rows.length,
      2,
    );
    assert.equal(
      (await db.query("SELECT * FROM finance_invoices")).rows.length,
      1,
    );
    await db.query("SELECT finance_save_settings($1)", [
      JSON.stringify({ ...setup, registered_serial_end: 2 }),
    ]);
    assert.equal(
      (await db.query("SELECT * FROM finance_invoices")).rows.length,
      2,
    );
  } finally {
    await db.close();
  }
});
test("delivery tax configuration is snapshotted once and reconciles to VAT and income reports", async () => {
  const db = await database();
  try {
    await db.query("SELECT finance_save_settings($1)", [
      JSON.stringify({ ...identity, delivery_tax_treatment: "vat_inclusive" }),
    ]);
    const id = await create(db, "finance-delivery-vat-001", {
      order_type: "delivery",
      delivery_fee: 112,
      total: 224,
    });
    await db.query(
      "UPDATE orders SET status='confirmed',payment_status='paid' WHERE id=$1",
      [id],
    );
    const snapshot = (
      await db.query<{ breakdown: FinancialBreakdown }>(
        "SELECT breakdown FROM order_financials WHERE order_id=$1",
        [id],
      )
    ).rows[0].breakdown;
    assert.equal(snapshot.delivery_tax, 1200);
    assert.equal(snapshot.osd_gross_sales, 20000);
    assert.equal(snapshot.total, 22400);
    const report = (
      await db.query<{
        r: {
          output_vat: number;
          delivery_income: number;
          operating_profit: number;
        };
      }>(
        "SELECT finance_report((now() AT TIME ZONE 'Asia/Manila')::date,(now() AT TIME ZONE 'Asia/Manila')::date) r",
      )
    ).rows[0].r;
    assert.equal(report.output_vat, 2400);
    assert.equal(report.delivery_income, 10000);
    assert.equal(report.operating_profit, 20000);
    await db.query("SELECT finance_save_settings($1)", [
      JSON.stringify({ ...identity, delivery_tax_treatment: "pass_through" }),
    ]);
    assert.deepEqual(
      (
        await db.query<{ breakdown: FinancialBreakdown }>(
          "SELECT breakdown FROM order_financials WHERE order_id=$1",
          [id],
        )
      ).rows[0].breakdown,
      snapshot,
    );
  } finally {
    await db.close();
  }
});
