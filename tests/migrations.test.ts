import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("inventory migrations apply over the entire existing production schema and preserve opening balances", async () => {
  const db = new PGlite();
  try {
    // Supabase-provided schemas and scheduling API; no migration business logic is replaced.
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA cron; CREATE SCHEMA extensions;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
      CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $$ SELECT substring(decode(repeat(md5(gen_random_uuid()::text),ceil($1/16.0)::integer),'hex') FROM 1 FOR $1) $$;
      SET search_path = public, extensions;
      CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
      CREATE PUBLICATION supabase_realtime;
      SELECT set_config('request.jwt.claim.role','service_role',false);`);
    for (const file of readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const sql = readFileSync("supabase/migrations/" + file, "utf8").replace(
        "CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;",
        "",
      );
      try {
        await db.exec(sql);
      } catch (error) {
        throw new Error(
          `Migration ${file}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    const state = (
      await db.query<{ enforcement_enabled: boolean }>(
        "SELECT enforcement_enabled FROM inventory_settings",
      )
    ).rows[0];
    assert.equal(state.enforcement_enabled, false);
    assert.equal(
      (
        await db.query(
          "SELECT * FROM ingredients WHERE current_stock<>(SELECT COALESCE(sum(quantity),0) FROM stock_batches WHERE ingredient_id=ingredients.id)",
        )
      ).rows.length,
      0,
    );
    assert.ok(
      (
        await db.query<{ catalog: { menuItems: unknown[] } }>(
          "SELECT get_published_catalog() catalog",
        )
      ).rows[0].catalog.menuItems.length > 0,
    );
  } finally {
    await db.close();
  }
});
