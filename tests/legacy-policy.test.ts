import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const unapprovedAdmin = "10000000-0000-4000-8000-000000000001";
const unapprovedStaff = "10000000-0000-4000-8000-000000000002";
const approvedAdmin = "10000000-0000-4000-8000-000000000003";
const approvedStaff = "10000000-0000-4000-8000-000000000004";
const customer = "10000000-0000-4000-8000-000000000005";
const category = "20000000-0000-4000-8000-000000000001";
const item = "20000000-0000-4000-8000-000000000002";
const variant = "20000000-0000-4000-8000-000000000003";
const inactiveVoucher = "20000000-0000-4000-8000-000000000004";
const activeVoucher = "20000000-0000-4000-8000-000000000005";
const voidOrder = "20000000-0000-4000-8000-000000000006";
const staffOwnedOrder = "20000000-0000-4000-8000-000000000007";
const migration = "20261003000500_legacy_admin_approval.sql";

async function fullDatabase() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA cron;
    CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE FUNCTION gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $$ SELECT substring(decode(repeat(md5(gen_random_uuid()::text),ceil($1/16.0)::integer),'hex') FROM 1 FOR $1) $$;
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
    CREATE PUBLICATION supabase_realtime;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO anon,authenticated,service_role;
    SELECT set_config('request.jwt.claim.role','service_role',false);`);
  for (const file of readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql") && file < migration)
    .sort())
    await db.exec(
      readFileSync("supabase/migrations/" + file, "utf8").replace(
        "CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;",
        "",
      ),
    );
  for (const [id, role, approved] of [
    [unapprovedAdmin, "admin", false],
    [unapprovedStaff, "staff", false],
    [approvedAdmin, "admin", true],
    [approvedStaff, "staff", true],
    [customer, "customer", true],
  ] as const) {
    await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [
      id,
      `${id}@example.test`,
    ]);
    await db.query("UPDATE profiles SET role=$2,is_approved=$3 WHERE id=$1", [
      id,
      role,
      approved,
    ]);
  }
  await db.query(
    "INSERT INTO categories(id,name) VALUES($1,'Policy audit category')",
    [category],
  );
  await db.query(
    "INSERT INTO menu_items(id,category_id,name,price) VALUES($1,$2,'Policy audit item',100)",
    [item, category],
  );
  await db.query(
    "INSERT INTO item_variants(id,menu_item_id,variant_group,label) VALUES($1,$2,'size','Policy audit variant')",
    [variant, item],
  );
  await db.query(
    "INSERT INTO vouchers(id,code,discount_type,discount_value,is_active) VALUES($1,'POLICY-INACTIVE','fixed',1,false),($2,'POLICY-ACTIVE','fixed',1,true)",
    [inactiveVoucher, activeVoucher],
  );
  await db.query("INSERT INTO void_logs(staff_id) VALUES($1)", [approvedStaff]);
  await db.query(
    "INSERT INTO orders(id,customer_id,order_type,payment_method,status,subtotal,total) VALUES($1,$2,'pickup','cash','confirmed',100,100),($3,$4,'pickup','cash','confirmed',100,100)",
    [voidOrder, customer, staffOwnedOrder, unapprovedStaff],
  );
  await db.query(
    "INSERT INTO order_items(order_id,menu_item_id,name,price,quantity,subtotal) VALUES($1,$2,'Policy audit item',100,1,100),($3,$2,'Policy audit item',100,1,100)",
    [voidOrder, item, staffOwnedOrder],
  );
  await db.query(
    "INSERT INTO order_status_history(order_id,new_status,notes) VALUES($1,'confirmed','Policy history'),($2,'confirmed','Policy history')",
    [voidOrder, staffOwnedOrder],
  );
  await db.query(
    "INSERT INTO guest_receipts(order_id,receipt_token,receipt_data) VALUES($1,'policy-receipt-test','{\"number\":\"isolated receipt\"}')",
    [voidOrder],
  );
  await db.query(
    "INSERT INTO pickup_tokens(order_id,token_hash) VALUES($1,'policy-pickup-customer'),($2,'policy-pickup-owner')",
    [voidOrder, staffOwnedOrder],
  );
  await db.query(
    "INSERT INTO void_tokens(token_hash,created_by,expires_at) VALUES('policy-void-token',$1,now()+interval '1 day')",
    [approvedAdmin],
  );
  await db.query(
    "INSERT INTO inventory_logs(ingredient_id,change_amount,change_type,staff_id,notes) SELECT id,0,'manual_adjustment',$1,'Policy inventory log' FROM ingredients LIMIT 1",
    [approvedStaff],
  );
  await db.query(
    "INSERT INTO clock_entries(staff_id,notes) VALUES($1,'Policy employee clock'),($2,'Policy owner clock')",
    [approvedStaff, unapprovedStaff],
  );
  await db.query(
    "INSERT INTO shifts(staff_id,notes) VALUES($1,'Policy employee shift'),($2,'Policy owner shift')",
    [approvedStaff, unapprovedStaff],
  );
  await db.query(
    "INSERT INTO voucher_claims(voucher_id,user_id) VALUES($1,$2)",
    [activeVoucher, customer],
  );
  return db;
}
async function asUser(db: PGlite, id: string) {
  await db.exec("SET ROLE authenticated");
  await db.query(
    "SELECT set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",
    [id],
  );
}
async function asServer(db: PGlite) {
  await db.exec("RESET ROLE");
  await db.query(
    "SELECT set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claim.sub','',false)",
  );
}

test("legacy approval migration closes direct role-only gaps while preserving owners, approved Admin and cashier flows", async () => {
  const db = await fullDatabase();
  try {
    const policies = (
      await db.query<{
        tablename: string;
        cmd: string;
        qual: string | null;
        with_check: string | null;
      }>(
        "SELECT tablename,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN('categories','menu_items','item_variants','vouchers','store_settings','void_logs')",
      )
    ).rows;
    assert.ok(
      policies.some(
        (policy) =>
          policy.tablename === "vouchers" &&
          policy.cmd === "ALL" &&
          policy.qual?.includes("is_true_admin"),
      ),
    );
    await asUser(db, unapprovedAdmin);
    await db.exec("BEGIN");
    for (const [table, id, field] of [
      ["categories", category, "name"],
      ["menu_items", item, "name"],
      ["item_variants", variant, "label"],
      ["vouchers", inactiveVoucher, "description"],
    ] as const) {
      assert.equal(
        (
          await db.query(
            `UPDATE ${table} SET ${field}='Unapproved change' WHERE id=$1 RETURNING id`,
            [id],
          )
        ).rows.length,
        1,
      );
    }
    assert.equal(
      (await db.query("SELECT id FROM vouchers WHERE id=$1", [inactiveVoucher]))
        .rows.length,
      1,
    );
    assert.equal(
      (await db.query("SELECT id FROM store_settings WHERE id='global'")).rows
        .length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "UPDATE store_settings SET updated_at=now() WHERE id='global' RETURNING id",
        )
      ).rows.length,
      1,
    );
    assert.equal((await db.query("SELECT id FROM void_logs")).rows.length, 1);
    await db.exec("ROLLBACK");
    await asUser(db, unapprovedStaff);
    await db.exec("BEGIN");
    await db.query("INSERT INTO void_logs(staff_id) VALUES($1)", [
      unapprovedStaff,
    ]);
    await asServer(db);
    assert.equal(
      (
        await db.query("SELECT id FROM void_logs WHERE staff_id=$1", [
          unapprovedStaff,
        ])
      ).rows.length,
      1,
    );
    await db.exec("ROLLBACK");
    await asServer(db);
    const snapshot = async () =>
      (
        await db.query<{ table_name: string; row_count: number }>(
          "SELECT table_name,(xpath('/row/c/text()',query_to_xml(format('SELECT count(*) c FROM public.%I',table_name),false,true,'')))[1]::text::integer row_count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
        )
      ).rows;
    const before = await snapshot();
    await db.exec(readFileSync("supabase/migrations/" + migration, "utf8"));
    assert.deepEqual(await snapshot(), before); // Policy-only rollout never rewrites existing business rows.

    for (const id of [unapprovedAdmin, unapprovedStaff]) {
      await asUser(db, id);
      assert.equal(
        (await db.query<{ allowed: boolean }>("SELECT is_true_admin() allowed"))
          .rows[0].allowed,
        false,
      );
      for (const [table, row, field] of [
        ["categories", category, "name"],
        ["menu_items", item, "name"],
        ["item_variants", variant, "label"],
        ["vouchers", inactiveVoucher, "description"],
      ] as const) {
        assert.equal(
          (
            await db.query(
              `UPDATE ${table} SET ${field}='Denied change' WHERE id=$1 RETURNING id`,
              [row],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(`DELETE FROM ${table} WHERE id=$1 RETURNING id`, [
              row,
            ])
          ).rows.length,
          0,
        );
      }
      await assert.rejects(
        db.query("INSERT INTO categories(name) VALUES('Denied category')"),
        /row-level security/,
      );
      await assert.rejects(
        db.query(
          "INSERT INTO menu_items(category_id,name,price) VALUES($1,'Denied menu',100)",
          [category],
        ),
        /row-level security/,
      );
      await assert.rejects(
        db.query(
          "INSERT INTO item_variants(menu_item_id,variant_group,label) VALUES($1,'size','Denied variant')",
          [item],
        ),
        /row-level security/,
      );
      await assert.rejects(
        db.query(
          "INSERT INTO vouchers(code,discount_type,discount_value) VALUES('DENIED','fixed',1)",
        ),
        /row-level security/,
      );
      assert.equal(
        (
          await db.query("SELECT id FROM vouchers WHERE id=$1", [
            inactiveVoucher,
          ])
        ).rows.length,
        0,
      );
      assert.equal(
        (await db.query("SELECT id FROM store_settings")).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "UPDATE store_settings SET updated_at=now() WHERE id='global' RETURNING id",
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        db.query(
          "INSERT INTO store_settings(id,void_pin) VALUES('denied','000000')",
        ),
        /row-level security/,
      );
      assert.equal((await db.query("SELECT id FROM void_logs")).rows.length, 0);
      await assert.rejects(
        db.query("INSERT INTO void_logs(staff_id) VALUES($1)", [id]),
        /row-level security/,
      );
      for (const table of [
        "orders",
        "order_items",
        "order_status_history",
        "pickup_tokens",
      ]) {
        const column = table === "orders" ? "id" : "order_id";
        assert.equal(
          (
            await db.query(`SELECT id FROM ${table} WHERE ${column}=$1`, [
              voidOrder,
            ])
          ).rows.length,
          0,
        );
      }
      for (const table of ["guest_receipts", "void_tokens", "inventory_logs"])
        assert.equal(
          (await db.query(`SELECT id FROM ${table}`)).rows.length,
          0,
        );
      assert.equal(
        (
          await db.query("SELECT id FROM clock_entries WHERE staff_id=$1", [
            approvedStaff,
          ])
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query("SELECT id FROM shifts WHERE staff_id=$1", [
            approvedStaff,
          ])
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query("SELECT id FROM voucher_claims WHERE user_id=$1", [
            customer,
          ])
        ).rows.length,
        0,
      );
      await assert.rejects(
        db.query(
          "INSERT INTO notifications(user_id,title,body) VALUES($1,'Denied target','Fixture')",
          [customer],
        ),
        /row-level security/,
      );
      await assert.rejects(
        db.query(
          "INSERT INTO notifications(user_id,title,body) VALUES(NULL,'Denied broadcast','Fixture')",
        ),
        /row-level security/,
      );
      await assert.rejects(
        db.query(
          "INSERT INTO voucher_claims(voucher_id,user_id) VALUES($1,$2)",
          [activeVoucher, customer],
        ),
        /row-level security/,
      );
      await assert.rejects(
        db.query("SELECT void_order_with_pin($1,'123456',$2)", [voidOrder, id]),
        /Approved cashier identity/,
      );
      for (const table of ["clock_entries", "shifts"]) {
        await assert.rejects(
          db.query(
            `INSERT INTO ${table}(staff_id,notes) VALUES($1,'Denied self clock')`,
            [id],
          ),
          /row-level security/,
        );
        assert.equal(
          (
            await db.query(
              `UPDATE ${table} SET notes='Denied self clock' WHERE staff_id=$1 RETURNING id`,
              [id],
            )
          ).rows.length,
          0,
        );
      }
    }
    // Revoking staff approval does not revoke that person's customer ownership.
    await asUser(db, unapprovedStaff);
    for (const table of [
      "orders",
      "order_items",
      "order_status_history",
      "pickup_tokens",
    ]) {
      const column = table === "orders" ? "id" : "order_id";
      assert.ok(
        (
          await db.query(`SELECT id FROM ${table} WHERE ${column}=$1`, [
            staffOwnedOrder,
          ])
        ).rows.length > 0,
      );
    }
    assert.equal(
      (
        await db.query("SELECT id FROM shifts WHERE staff_id=$1", [
          unapprovedStaff,
        ])
      ).rows.length,
      1,
    );
    await db.query(
      "INSERT INTO notifications(user_id,title,body) VALUES($1,'Owner notification','Fixture')",
      [unapprovedStaff],
    );
    await db.query(
      "INSERT INTO voucher_claims(voucher_id,user_id) VALUES($1,$2)",
      [activeVoucher, unapprovedStaff],
    );

    await asUser(db, approvedAdmin);
    assert.equal(
      (await db.query<{ allowed: boolean }>("SELECT is_true_admin() allowed"))
        .rows[0].allowed,
      true,
    );
    for (const [table, row, field] of [
      ["categories", category, "name"],
      ["menu_items", item, "name"],
      ["item_variants", variant, "label"],
      ["vouchers", inactiveVoucher, "description"],
    ] as const)
      assert.equal(
        (
          await db.query(
            `UPDATE ${table} SET ${field}='Approved change' WHERE id=$1 RETURNING id`,
            [row],
          )
        ).rows.length,
        1,
      );
    const newCategory = (
      await db.query<{ id: string }>(
        "INSERT INTO categories(name) VALUES('Approved insert') RETURNING id",
      )
    ).rows[0].id;
    const newItem = (
      await db.query<{ id: string }>(
        "INSERT INTO menu_items(category_id,name,price) VALUES($1,'Approved insert item',100) RETURNING id",
        [newCategory],
      )
    ).rows[0].id;
    const newVariant = (
      await db.query<{ id: string }>(
        "INSERT INTO item_variants(menu_item_id,variant_group,label) VALUES($1,'size','Approved insert variant') RETURNING id",
        [newItem],
      )
    ).rows[0].id;
    const newVoucher = (
      await db.query<{ id: string }>(
        "INSERT INTO vouchers(code,discount_type,discount_value,is_active) VALUES('APPROVED-INSERT','fixed',1,false) RETURNING id",
      )
    ).rows[0].id;
    for (const [table, row] of [
      ["item_variants", newVariant],
      ["menu_items", newItem],
      ["categories", newCategory],
      ["vouchers", newVoucher],
    ] as const)
      assert.equal(
        (await db.query(`DELETE FROM ${table} WHERE id=$1 RETURNING id`, [row]))
          .rows.length,
        1,
      );
    assert.equal(
      (await db.query("SELECT id FROM vouchers WHERE id=$1", [inactiveVoucher]))
        .rows.length,
      1,
    );
    assert.equal(
      (await db.query("SELECT id FROM store_settings WHERE id='global'")).rows
        .length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "UPDATE store_settings SET updated_at=now() WHERE id='global' RETURNING id",
        )
      ).rows.length,
      1,
    );
    await db.query(
      "INSERT INTO store_settings(id,void_pin) VALUES('approved-test','654321')",
    );
    assert.equal(
      (
        await db.query(
          "DELETE FROM store_settings WHERE id='approved-test' RETURNING id",
        )
      ).rows.length,
      1,
    );
    assert.ok((await db.query("SELECT id FROM void_logs")).rows.length > 0);
    assert.equal(
      (
        await db.query("SELECT id FROM clock_entries WHERE staff_id=$1", [
          approvedStaff,
        ])
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query("SELECT id FROM shifts WHERE staff_id=$1", [
          approvedStaff,
        ])
      ).rows.length,
      1,
    );
    await db.query(
      "INSERT INTO notifications(user_id,title,body) VALUES(NULL,'Approved broadcast','Fixture')",
    );
    await db.query(
      "INSERT INTO voucher_claims(voucher_id,user_id) VALUES($1,$2)",
      [activeVoucher, approvedStaff],
    );

    await asUser(db, approvedStaff);
    for (const table of ["clock_entries", "shifts"]) {
      assert.equal(
        (
          await db.query(
            `UPDATE ${table} SET notes='Approved self clock' WHERE staff_id=$1 RETURNING id`,
            [approvedStaff],
          )
        ).rows.length,
        1,
      );
      await db.query(
        `INSERT INTO ${table}(staff_id,notes) VALUES($1,'Approved self clock')`,
        [approvedStaff],
      );
    }
    for (const table of [
      "orders",
      "order_items",
      "order_status_history",
      "pickup_tokens",
    ]) {
      const column = table === "orders" ? "id" : "order_id";
      assert.ok(
        (
          await db.query(`SELECT id FROM ${table} WHERE ${column}=$1`, [
            voidOrder,
          ])
        ).rows.length > 0,
      );
    }
    for (const table of ["guest_receipts", "void_tokens", "inventory_logs"])
      assert.ok((await db.query(`SELECT id FROM ${table}`)).rows.length > 0);
    assert.equal(
      (await db.query("SELECT id FROM store_settings")).rows.length,
      0,
    ); // Cashiers use the checked PIN operation, not direct PIN access.
    await db.query("INSERT INTO void_logs(staff_id) VALUES($1)", [
      approvedStaff,
    ]);
    await db.query(
      "INSERT INTO notifications(user_id,title,body) VALUES($1,'Approved targeted notification','Fixture')",
      [customer],
    );
    const result = (
      await db.query<{ result: { success: boolean } }>(
        "SELECT void_order_with_pin($1,'123456',$2) result",
        [voidOrder, approvedStaff],
      )
    ).rows[0].result;
    assert.equal(result.success, true);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM orders WHERE id=$1",
          [voidOrder],
        )
      ).rows[0].status,
      "cancelled",
    );

    await asUser(db, customer);
    for (const table of [
      "orders",
      "order_items",
      "order_status_history",
      "pickup_tokens",
    ]) {
      const column = table === "orders" ? "id" : "order_id";
      assert.ok(
        (
          await db.query(`SELECT id FROM ${table} WHERE ${column}=$1`, [
            voidOrder,
          ])
        ).rows.length > 0,
      );
    }
    assert.ok(
      (
        await db.query("SELECT id FROM voucher_claims WHERE user_id=$1", [
          customer,
        ])
      ).rows.length > 0,
    );
    await db.query(
      "INSERT INTO notifications(user_id,title,body) VALUES($1,'Customer notification','Fixture')",
      [customer],
    );
    await db.exec("SET ROLE anon");
    await db.query(
      "SELECT set_config('request.jwt.claim.role','anon',false),set_config('request.jwt.claim.sub','',false)",
    );
    for (const [table, row] of [
      ["categories", category],
      ["menu_items", item],
      ["item_variants", variant],
      ["vouchers", activeVoucher],
    ] as const)
      assert.equal(
        (await db.query(`SELECT id FROM ${table} WHERE id=$1`, [row])).rows
          .length,
        1,
      );
    assert.equal(
      (await db.query("SELECT id FROM vouchers WHERE id=$1", [inactiveVoucher]))
        .rows.length,
      0,
    );
    assert.ok(
      (
        await db.query<{ receipt: unknown }>(
          "SELECT get_guest_receipt('policy-receipt-test') receipt",
        )
      ).rows[0].receipt,
    );
    assert.ok(
      (
        await db.query<{ catalog: { menuItems: unknown[] } }>(
          "SELECT get_published_catalog() catalog",
        )
      ).rows[0].catalog.menuItems.length > 0,
    );
    await assert.rejects(
      db.query(
        "INSERT INTO notifications(user_id,title,body) VALUES(NULL,'Anonymous broadcast','Fixture')",
      ),
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});
