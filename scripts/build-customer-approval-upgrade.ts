// Prepare the reviewed policy-only follow-up without contacting the database.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const project = "segzigvrcgxdjskfltju";
assert.equal(
  readFileSync("supabase/.temp/project-ref", "utf8").trim(),
  project,
);
const previous = JSON.parse(
  readFileSync(".codex-logs/customer-upgrade-source-hashes.json", "utf8"),
);
for (const [name, expected] of Object.entries(previous.hashes)) {
  const source = readFileSync(`supabase/migrations/${name}.sql`, "utf8")
    .replace(/\r\n/g, "\n")
    .trim();
  assert.equal(createHash("sha256").update(source).digest("hex"), expected);
}

const name = "20261003000500_legacy_admin_approval";
const source = readFileSync(`supabase/migrations/${name}.sql`, "utf8")
  .replace(/\r\n/g, "\n")
  .trim();
assert.equal((source.match(/^BEGIN;$/gm) ?? []).length, 1);
assert.equal((source.match(/^COMMIT;$/gm) ?? []).length, 1);
const body = source.replace(/^BEGIN;\n/m, "").replace(/\nCOMMIT;$/, "");
const tag = "$customer_20261003000500$";
assert.ok(!source.includes(tag));
const sql = `BEGIN;
SET LOCAL lock_timeout='15s';
SET LOCAL statement_timeout='120s';
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261003000400') THEN RAISE EXCEPTION 'Apply the preceding customer release first'; END IF;
IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261003000500') THEN RAISE EXCEPTION 'Approval follow-up is already recorded; inspect before retrying'; END IF;
END $$;
${body}
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES('20261003000500','legacy_admin_approval',ARRAY[${tag}${source}${tag}]::text[]);
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT version,name FROM supabase_migrations.schema_migrations WHERE version LIKE '20261003%' ORDER BY version;
`;
writeFileSync(".codex-logs/cafe-customer-approval-upgrade.sql", sql);
writeFileSync(
  ".codex-logs/customer-approval-source-hash.json",
  JSON.stringify(
    {
      project,
      preparedAt: new Date().toISOString(),
      name,
      hash: createHash("sha256").update(source).digest("hex"),
      precedingSourcesUnchanged: true,
    },
    null,
    2,
  ),
);
console.log(
  "Prepared the exact policy-only follow-up; preceding migrations are unchanged. No SQL executed.",
);
