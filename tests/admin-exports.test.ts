import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { dataZip, recordsCsv } from "../apps/admin/utils/exportData.ts";
const admin = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002",
  staff = "10000000-0000-4000-8000-000000000003";
async function call<T>(db: PGlite, sql: string, args: unknown[] = []) {
  return (await db.query<{ result: T }>(`SELECT ${sql} result`, args)).rows[0]
    .result;
}
test("export freezes all rows beyond API limits, redacts nested credentials and enforces current approved owner access", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
    await db.exec(
      "ALTER TABLE profiles ADD COLUMN is_approved boolean DEFAULT true,ADD COLUMN full_name text; ALTER TABLE orders ADD COLUMN payment_review_required boolean DEFAULT false; CREATE TABLE pickup_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid,token_hash text,is_used boolean);CREATE TABLE guest_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid,receipt_token text,receipt_data jsonb,created_at timestamptz,expires_at timestamptz);",
    );
    await db.query(
      "INSERT INTO profiles(id,role) VALUES($1,'admin'),($2,'admin'),($3,'staff')",
      [admin, other, staff],
    );
    await db.query(
      "SELECT set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claim.sub',$1,false)",
      [admin],
    );
    for (const name of [
      "20261002000100_inventory_operations.sql",
      "20261002000200_atomic_orders_forecasts.sql",
      "20261002000300_operations_overview.sql",
      "20261002000400_pos_cashier.sql",
      "20261013000400_finance_invoices.sql",
      "20261016000300_admin_exports.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
    await db.exec(
      'INSERT INTO categories(name) SELECT \'Category \'||n FROM generate_series(1,1205)n;CREATE TABLE export_fixture_business(id integer,api_key text,payload jsonb);INSERT INTO export_fixture_business VALUES(1,\'private credential\',\'{"phone":"fixture contact","before":{"accessToken":"secret","name":"Keep me"},"items":[{"pin_hash":"secret","quantity":2}],"url":"https://fixture.test?token=secret"}\');',
    );
    const catalog = await call<{ tables: { table_name: string }[] }>(
      db,
      "admin_export_catalog()",
    );
    assert.ok(catalog.tables.some((t) => t.table_name === "categories"));
    assert.ok(
      !catalog.tables.some(
        (t) =>
          t.table_name === "pickup_tokens" ||
          t.table_name.startsWith("admin_export_"),
      ),
    );
    const id = "60000000-0000-4000-8000-000000000001";
    const manifest = await call<{
      total_rows: number;
      tables: { table_name: string; count: number }[];
    }>(db, "admin_export_create($1,$2)", [
      id,
      ["categories", "export_fixture_business"],
    ]);
    assert.equal(Number(manifest.total_rows), 1206);
    await db.exec(
      "UPDATE categories SET name='Changed after snapshot';DELETE FROM categories WHERE name='Changed after snapshot';",
    );
    type Row = {
      position: number;
      data: {
        name: string;
        payload?: Record<string, unknown>;
        api_key?: string;
      };
    };
    const rows: Row[] = [];
    let after = 0;
    for (let page = 0; page < 3; page++) {
      const data = await call<Row[]>(
        db,
        "admin_export_page($1,'categories',$2)",
        [id, after],
      );
      rows.push(...data);
      after = Number(data.at(-1)!.position);
    }
    assert.equal(rows.length, 1205);
    assert.equal(new Set(rows.map((row) => row.data.name)).size, 1205);
    assert.ok(rows.every((row) => row.data.name.startsWith("Category ")));
    assert.equal(
      (
        await call<Row[]>(db, "admin_export_page($1,'categories',$2)", [
          id,
          after,
        ])
      ).length,
      0,
    );
    assert.deepEqual(
      await call(db, "admin_export_create($1,$2)", [
        id,
        ["categories", "export_fixture_business"],
      ]),
      manifest,
    );
    const redacted = (
      await call<Row[]>(
        db,
        "admin_export_page($1,'export_fixture_business',0)",
        [id],
      )
    )[0].data;
    assert.equal(redacted.api_key, undefined);
    assert.deepEqual(redacted.payload, {
      phone: "fixture contact",
      before: { name: "Keep me" },
      items: [{ quantity: 2 }],
      url: "[private link excluded]",
    });
    await assert.rejects(
      call(db, "admin_export_create($1,$2)", [
        crypto.randomUUID(),
        ["categories; DROP TABLE profiles"],
      ]),
      /unavailable/,
    );
    await db.query(
      "SELECT set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",
      [other],
    );
    await assert.rejects(
      call(db, "admin_export_page($1,'categories',0)", [id]),
      /unavailable/,
    );
    await call(db, "admin_export_close($1)", [id]);
    assert.equal(
      Number(
        (
          await db.query<{ n: number }>(
            "SELECT count(*) n FROM admin_export_jobs",
          )
        ).rows[0].n,
      ),
      1,
    );
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      staff,
    ]);
    await assert.rejects(call(db, "admin_export_catalog()"), /Approved Admin/);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    await db.query("UPDATE profiles SET is_approved=false WHERE id=$1", [
      admin,
    ]);
    await assert.rejects(
      call(db, "admin_export_page($1,'categories',0)", [id]),
      /Approved Admin/,
    );
    await db.query("UPDATE profiles SET is_approved=true WHERE id=$1", [admin]);
    await db.exec(
      "UPDATE admin_export_jobs SET expires_at=now()-interval '1 minute'",
    );
    await assert.rejects(
      call(db, "admin_export_page($1,'categories',0)", [id]),
      /expired/,
    );
    await call(db, "admin_export_create($1,$2)", [
      crypto.randomUUID(),
      ["categories"],
    ]);
    assert.equal(
      Number(
        (
          await db.query<{ n: number }>(
            "SELECT count(*) n FROM admin_export_rows WHERE job_id=$1",
            [id],
          )
        ).rows[0].n,
      ),
      0,
    );
  } finally {
    await db.close();
  }
});
test("CSV protects formulas and preserves Unicode, quotes and nested values; ZIP passes Python's independent CRC reader", () => {
  const csv = recordsCsv([
    {
      name: '  =HYPERLINK("bad")',
      note: 'Café, milk\n"cold"',
      qty: -2,
      nested: { x: 1 },
    },
  ]);
  assert.ok(csv.includes("\"'  =HYPERLINK"));
  assert.ok(csv.includes('"Café, milk\n""cold"""'));
  assert.ok(csv.includes('"-2"'));
  const zip = dataZip([
    { name: "orders.csv", text: csv },
    { name: "manifest.json", text: '{"rows":1}' },
  ]);
  const result = spawnSync(
    "python",
    [
      "-c",
      "import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({n:z.read(n).decode('utf-8') for n in z.namelist()}))",
    ],
    { input: zip, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    "orders.csv": csv,
    "manifest.json": '{"rows":1}',
  });
});
