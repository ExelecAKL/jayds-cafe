import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { HistoryInput, Row } from "./model.ts";
export interface Backup {
  data: Record<string, Row[]>;
  columns: { table: string; name: string; generated: string; type: string }[];
  captured_at: string;
}
export function identifier(value: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(value))
    throw Error("Invalid local restore identifier");
  return '"' + value + '"';
}
export function stable(value: unknown): string {
  return Array.isArray(value)
    ? "[" + value.map(stable).join(",") + "]"
    : value && typeof value === "object"
      ? "{" +
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => JSON.stringify(k) + ":" + stable(v))
          .join(",") +
        "}"
      : (JSON.stringify(value) ?? "null");
}
export const hash = (value: unknown) =>
  createHash("sha256").update(stable(value)).digest("hex");
export async function restoreLocalHistoryDatabase(backup: Backup) {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE supabase_auth_admin;
   CREATE SCHEMA auth; CREATE SCHEMA cron; CREATE SCHEMA extensions; CREATE SCHEMA storage;
   CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
   CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $$ SELECT substring(decode(repeat(md5(gen_random_uuid()::text),ceil($1/16.0)::integer),'hex') FROM 1 FOR $1) $$;
   SET search_path=public,extensions;
   CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
   CREATE PUBLICATION supabase_realtime; SELECT set_config('request.jwt.claim.role','service_role',false);`);
    const files = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const apply = async (file: string) =>
      db.exec(
        readFileSync("supabase/migrations/" + file, "utf8").replace(
          "CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;",
          "",
        ),
      );
    for (const file of files.filter((f) => f < "20261013000300"))
      await apply(file);
    // This is an in-memory local restore only. Production apply never disables triggers.
    await db.exec(
      "SET session_replication_role=replica; TRUNCATE " +
        Object.keys(backup.data)
          .map((t) => "public." + identifier(t))
          .join(",") +
        " RESTART IDENTITY CASCADE",
    );
    for (const profile of backup.data.profiles)
      await db.query("INSERT INTO auth.users(id) VALUES($1)", [profile.id]);
    const preservation: { table: string; rows: number; unchanged: boolean }[] =
      [];
    for (const [table, rows] of Object.entries(backup.data)) {
      const columns = backup.columns
        .filter((c) => c.table === table && !c.generated)
        .map((c) => c.name);
      const actual = (
        await db.query<{ name: string }>(
          "SELECT attname name FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped",
          ["public." + table],
        )
      ).rows.map((r) => r.name);
      if (columns.some((c) => !actual.includes(c)))
        throw Error(
          "The private backup includes schema changes missing from local migrations: " +
            table,
        );
      if (rows.length)
        await db.query(
          "INSERT INTO public." +
            identifier(table) +
            "(" +
            columns.map(identifier).join(",") +
            ") SELECT " +
            columns.map(identifier).join(",") +
            " FROM jsonb_populate_recordset(NULL::public." +
            identifier(table) +
            ",$1)",
          [JSON.stringify(rows)],
        );
      const timestamps = new Set(
        backup.columns
          .filter((c) => c.table === table && c.type.includes("timestamp"))
          .map((c) => c.name),
      );
      const normalize = (r: Row) =>
        Object.fromEntries(
          columns.map((c) => {
            const value = r[c];
            if (!timestamps.has(c) || typeof value !== "string")
              return [c, value];
            const fraction = (value.match(/\.(\d+)/)?.[1] ?? "")
              .padEnd(6, "0")
              .slice(0, 6);
            return [
              c,
              new Date(value).toISOString().slice(0, 19) + "." + fraction + "Z",
            ];
          }),
        );
      const restored = (
        await db.query<{ row: Row }>(
          "SELECT to_jsonb(t) row FROM public." + identifier(table) + " t",
        )
      ).rows.map((r) => normalize(r.row));
      const expected = rows.map(normalize);
      const unchanged =
        hash(restored.map(stable).sort()) === hash(expected.map(stable).sort());
      if (!unchanged) {
        const key = (r: Row) =>
          stable(r.id ?? r.order_id ?? r.ingredient_id ?? r);
        const lookup = new Map(restored.map((r) => [key(r), r]));
        const differences = columns
          .map((column) => ({
            column,
            count: expected.filter(
              (r) => stable(r[column]) !== stable(lookup.get(key(r))?.[column]),
            ).length,
          }))
          .filter((c) => c.count);
        writeFileSync(
          ".codex-logs/history-restore-differences.json",
          JSON.stringify(
            {
              table,
              differences,
              rowsBefore: expected.length,
              rowsAfter: restored.length,
            },
            null,
            2,
          ),
        );
        throw Error("Local backup preservation failed for " + table);
      }
      preservation.push({ table, rows: rows.length, unchanged });
    }
    await db.exec("SET session_replication_role=origin");
    for (const file of files.filter((f) => f >= "20261013000300"))
      await apply(file);
    const admin = backup.data.profiles.find((p) => p.role === "admin");
    if (!admin) throw Error("No designated Admin account in backup");
    await db.query(
      "SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','service_role',false)",
      [admin.id],
    );
    return { db, preservation };
  } catch (error) {
    await db.close();
    throw error;
  }
}
export async function readHistoryInput(db: PGlite): Promise<HistoryInput> {
  const all = async <T>(table: string, columns = "*") =>
    (
      await db.query<{ data: T[] }>(
        "SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') data FROM (SELECT " +
          columns +
          " FROM " +
          identifier(table) +
          " ORDER BY 1) t",
      )
    ).rows[0].data;
  return {
    menu: await all("menu_items", "id,name,price,category_id,status"),
    categories: await all("categories", "id,name,is_active,status"),
    variants: await all("item_variants"),
    recipes: await all("menu_item_ingredients"),
    variantRecipes: await all("variant_ingredients"),
    ingredients: await all("ingredients"),
    profiles: await all(
      "profiles",
      "id,role,points,total_spent,total_orders,loyalty_tier,last_order_at,updated_at",
    ),
    batches: await all("stock_batches"),
    movements: await all(
      "stock_movements",
      "ingredient_id,created_at,balance_after",
    ),
  };
}
