import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("inventory backfills preserve original records and legacy UPDATE trigger states without replaying events", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
    await db.exec(`SELECT set_config('request.jwt.claim.role','service_role',false);
      INSERT INTO menu_items(id,name,price,is_available,updated_at) VALUES('20000000-0000-4000-8000-000000000001','Historical product',100,false,'2026-04-01T00:00:00Z');
      INSERT INTO orders(id,status,total,subtotal,notes,updated_at) VALUES('40000000-0000-4000-8000-000000000001','cancelled',100,100,'[PARKED] Original note','2026-04-02T00:00:00Z');
      CREATE TABLE legacy_events(kind text PRIMARY KEY,hits integer DEFAULT 0);
      INSERT INTO legacy_events(kind) VALUES('menu_items'),('orders');
      CREATE FUNCTION legacy_touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=now(); UPDATE legacy_events SET hits=hits+1 WHERE kind=TG_TABLE_NAME; RETURN NEW; END $$;
      CREATE FUNCTION legacy_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE legacy_events SET hits=hits+1 WHERE kind=TG_TABLE_NAME; RETURN NEW; END $$;
      CREATE TRIGGER legacy_menu_touch BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION legacy_touch();
      CREATE TRIGGER legacy_order_touch BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION legacy_touch();
      CREATE TRIGGER legacy_menu_always AFTER UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION legacy_event();
      ALTER TABLE menu_items ENABLE ALWAYS TRIGGER legacy_menu_always;
      CREATE TRIGGER legacy_order_replica AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION legacy_event();
      ALTER TABLE orders ENABLE REPLICA TRIGGER legacy_order_replica;
      CREATE TRIGGER legacy_menu_disabled AFTER UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION legacy_event();
      ALTER TABLE menu_items DISABLE TRIGGER legacy_menu_disabled;
      CREATE TRIGGER legacy_insert AFTER INSERT ON menu_items FOR EACH ROW EXECUTE FUNCTION legacy_event();`);
    const beforeMenu = (
      await db.query<{ row: Record<string, unknown> }>(
        "SELECT to_jsonb(m) row FROM menu_items m",
      )
    ).rows[0].row;
    const beforeOrder = (
      await db.query<{ row: Record<string, unknown> }>(
        "SELECT to_jsonb(o) row FROM orders o",
      )
    ).rows[0].row;
    const states = async () =>
      (
        await db.query(
          "SELECT tgname,tgenabled FROM pg_trigger WHERE tgname LIKE 'legacy_%' ORDER BY tgname",
        )
      ).rows;
    const beforeStates = await states();
    await db.exec(
      readFileSync(
        "supabase/migrations/20261002000100_inventory_operations.sql",
        "utf8",
      ),
    );
    const afterMenu = (
      await db.query<{ row: Record<string, unknown> }>(
        "SELECT to_jsonb(m) row FROM menu_items m",
      )
    ).rows[0].row;
    const afterOrder = (
      await db.query<{ row: Record<string, unknown> }>(
        "SELECT to_jsonb(o) row FROM orders o",
      )
    ).rows[0].row;
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(beforeMenu).map((key) => [key, afterMenu[key]]),
      ),
      beforeMenu,
    );
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(beforeOrder).map((key) => [key, afterOrder[key]]),
      ),
      beforeOrder,
    );
    assert.equal(afterMenu.manually_available, false);
    assert.equal(afterOrder.is_parked, true);
    assert.equal(afterOrder.rewards_returned, true);
    assert.deepEqual(await states(), beforeStates);
    assert.equal(
      (
        await db.query<{ hits: number }>(
          "SELECT sum(hits)::integer hits FROM legacy_events",
        )
      ).rows[0].hits,
      0,
    );
    // Existing triggers keep working for actual subsequent operations.
    await db.exec("UPDATE menu_items SET manually_available=true");
    assert.equal(
      (
        await db.query<{ hits: number }>(
          "SELECT hits FROM legacy_events WHERE kind='menu_items'",
        )
      ).rows[0].hits,
      2,
    );
    assert.deepEqual(await states(), beforeStates);
  } finally {
    await db.close();
  }
});
