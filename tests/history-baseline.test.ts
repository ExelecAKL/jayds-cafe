import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("history baseline ignores transport-only numeric scale and still detects changed values", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'service_role'::text$$; CREATE TABLE profiles(id integer,amount numeric); INSERT INTO profiles VALUES(1,500.000000)",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261016001200_history_baseline_numbers.sql",
        "utf8",
      ),
    );
    const hash = async () =>
      (
        await db.query<{ value: string }>(
          "SELECT cafe_history_table_hash('profiles') value",
        )
      ).rows[0].value;
    const original = await hash();
    await db.exec("UPDATE profiles SET amount=500.0");
    assert.equal(await hash(), original);
    await db.exec("UPDATE profiles SET amount=500.01");
    assert.notEqual(await hash(), original);
    await assert.rejects(
      db.query("SELECT cafe_history_table_hash('auth.users')"),
      /Unsupported/,
    );
  } finally {
    await db.close();
  }
});
