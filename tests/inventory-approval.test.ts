import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const approved = "10000000-0000-4000-8000-000000000001";
const unapproved = "10000000-0000-4000-8000-000000000002";
const staff = "10000000-0000-4000-8000-000000000003";
const stock = "30000000-0000-4000-8000-000000000001";
const migration =
  "supabase/migrations/20261002000500_inventory_admin_approval.sql";

async function identity(db: PGlite, actor: string, role = "authenticated") {
  await db.exec("RESET ROLE");
  await db.query(
    "SELECT set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false)",
    [role, actor],
  );
  if (role === "authenticated") await db.exec("SET ROLE authenticated");
}

test("inventory RPCs and RLS require approved Admin, retain trusted paths and helper privileges", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
    await db.exec(
      "ALTER TABLE profiles ADD COLUMN is_approved boolean DEFAULT true",
    );
    await db.query(
      "INSERT INTO profiles(id,role,is_approved) VALUES($1,'admin',true),($2,'admin',false),($3,'staff',true)",
      [approved, unapproved, staff],
    );
    await db.query(
      "INSERT INTO ingredients(id,name,current_stock,cost_per_unit) VALUES($1,'Approval regression stock',10,1)",
      [stock],
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261002000100_inventory_operations.sql",
        "utf8",
      ),
    );
    for (const file of [
      "20261002000200_atomic_orders_forecasts.sql",
      "20261002000300_operations_overview.sql",
    ]) {
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    }
    const helperMetadata = async () =>
      (
        await db.query(
          "SELECT oid,proowner,proacl,prosecdef,proconfig FROM pg_proc WHERE oid='public.inv_admin()'::regprocedure",
        )
      ).rows;
    const before = await helperMetadata();
    const source = readFileSync(migration, "utf8")
      .replace(/\r\n/g, "\n")
      .trim();
    const wrapper =
      "BEGIN;\n" + source + "\nNOTIFY pgrst, 'reload schema';\nCOMMIT;\n";
    assert.equal(
      readFileSync(
        "supabase/jayds_inventory_admin_approval_upgrade.sql",
        "utf8",
      ),
      wrapper,
    );
    await db.exec(wrapper);
    assert.deepEqual(await helperMetadata(), before);

    await identity(db, approved);
    assert.equal(
      (await db.query<{ allowed: boolean }>("SELECT inv_admin() allowed"))
        .rows[0].allowed,
      true,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM stock_batches",
        )
      ).rows[0].count,
      1,
    );
    await db.query(
      "SELECT inv_post_movement($1,1,'waste','Approval regression',1,NULL,NULL,gen_random_uuid())",
      [stock],
    );
    assert.equal(
      (
        await db.query<{ current_stock: number }>(
          "SELECT current_stock::integer current_stock FROM ingredients WHERE id=$1",
          [stock],
        )
      ).rows[0].current_stock,
      9,
    );
    await db.exec("INSERT INTO suppliers(name) VALUES('Approved supplier')");

    for (const actor of [unapproved, staff]) {
      await identity(db, actor);
      assert.equal(
        (await db.query<{ allowed: boolean }>("SELECT inv_admin() allowed"))
          .rows[0].allowed,
        false,
      );
      assert.equal(
        (
          await db.query<{ count: number }>(
            "SELECT count(*)::integer count FROM stock_batches",
          )
        ).rows[0].count,
        0,
      );
      assert.equal(
        (
          await db.query<{ count: number }>(
            "SELECT count(*)::integer count FROM ingredients",
          )
        ).rows[0].count,
        0,
      );
      await assert.rejects(
        db.query(
          "SELECT inv_post_movement($1,1,'waste','Denied regression',1,NULL,NULL,gen_random_uuid())",
          [stock],
        ),
        /Admin access required/,
      );
      await assert.rejects(
        db.query("SELECT inv_activate(false)"),
        /Admin access required/,
      );
      await assert.rejects(
        db.query("SELECT restock_ingredient($1,1,'Denied regression')", [
          stock,
        ]),
        /Admin access required/,
      );
      await assert.rejects(
        db.exec("INSERT INTO suppliers(name) VALUES('Denied supplier')"),
        /row-level security/,
      );
    }

    await identity(db, unapproved, "service_role");
    assert.equal(
      (await db.query<{ allowed: boolean }>("SELECT inv_admin() allowed"))
        .rows[0].allowed,
      true,
    );
    await identity(db, "", "");
    assert.equal(
      (await db.query<{ allowed: boolean }>("SELECT inv_admin() allowed"))
        .rows[0].allowed,
      true,
    );
    assert.equal(
      (
        await db.query<{ current_stock: number }>(
          "SELECT current_stock::integer current_stock FROM ingredients WHERE id=$1",
          [stock],
        )
      ).rows[0].current_stock,
      9,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM suppliers",
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer count FROM stock_movements",
        )
      ).rows[0].count,
      2,
    );
    assert.deepEqual(
      (await db.query("SELECT id,role,is_approved FROM profiles ORDER BY id"))
        .rows,
      [
        { id: approved, role: "admin", is_approved: true },
        { id: unapproved, role: "admin", is_approved: false },
        { id: staff, role: "staff", is_approved: true },
      ],
    );
  } finally {
    await db.close();
  }
});
