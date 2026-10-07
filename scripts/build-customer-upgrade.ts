// Prepare the reviewed additive upgrade; this script never contacts a database.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const project = "segzigvrcgxdjskfltju";
assert.equal(
  readFileSync("supabase/.temp/project-ref", "utf8").trim(),
  project,
);
const migrations = [
  "20261003000100_customer_security",
  "20261003000200_customer_scheduling",
  "20261003000300_customer_features",
  "20261003000400_customer_operations",
];
const pieces = [
  `BEGIN;\nSET LOCAL lock_timeout='15s';\nSET LOCAL statement_timeout='120s';\nLOCK TABLE public.orders IN SHARE MODE;\nDO $$ BEGIN\nIF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261002000600') THEN RAISE EXCEPTION 'Apply the prior inventory release first'; END IF;\nIF EXISTS(SELECT 1 FROM public.orders WHERE status IN('pending','confirmed','preparing','ready') AND NOT is_parked) THEN RAISE EXCEPTION 'Active orders must settle before this cutover'; END IF;\nIF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version LIKE '20261003%') THEN RAISE EXCEPTION 'Customer release history is already present; inspect before retrying'; END IF;\nEND $$;`,
];
const hashes: Record<string, string> = {};
for (const name of migrations) {
  const source = readFileSync("supabase/migrations/" + name + ".sql", "utf8")
    .replace(/\r\n/g, "\n")
    .trim();
  const tag = "$customer_" + name.slice(0, 14) + "$";
  assert.ok(!source.includes(tag));
  pieces.push(source);
  pieces.push(
    `INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${name.slice(0, 14)}','${name.slice(15)}',ARRAY[${tag}${source}${tag}]::text[]);`,
  );
  hashes[name] = createHash("sha256").update(source).digest("hex");
}
pieces.push(
  `NOTIFY pgrst,'reload schema';\nCOMMIT;\nSELECT version,name FROM supabase_migrations.schema_migrations WHERE version LIKE '20261003%' ORDER BY version;`,
);
writeFileSync(".codex-logs/cafe-customer-upgrade.sql", pieces.join("\n"));
writeFileSync(
  ".codex-logs/customer-upgrade-source-hashes.json",
  JSON.stringify(
    { project, preparedAt: new Date().toISOString(), hashes },
    null,
    2,
  ),
);
console.log(
  "Prepared four exact additive migrations in one checked transaction; no database changes executed.",
);
