import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

// Read-only deployment verification. No reset, seed, migration, or activation runs here.
const projectRef = "segzigvrcgxdjskfltju";
const baselinePath = path.resolve(".codex-logs/cafe-database-baseline.json");
const reportPath = path.resolve(".codex-logs/cafe-database-verification.json");
const mode = process.argv[2];
const expectedEnforcement = process.argv.includes("--enforcement-enabled");
type Row = Record<string, unknown> & { id: string };
type TableSnapshot = {
  columns: string[];
  rows: { id: string; digest: string }[];
};
type Snapshot = {
  projectRef: string;
  capturedAt: string;
  tables: Record<string, TableSnapshot>;
};
const tables = [
  "categories",
  "menu_items",
  "item_variants",
  "ingredients",
  "menu_item_ingredients",
  "variant_ingredients",
  "orders",
  "order_items",
  "inventory_logs",
];

function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => JSON.stringify(key) + ":" + stable(entry))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value) ?? "null";
}
function digest(row: Row, columns: string[]) {
  const values = Object.fromEntries(
    columns.map((column) => [column, row[column]]),
  );
  return createHash("sha256").update(stable(values)).digest("hex");
}

async function main() {
  if (mode !== "--snapshot" && mode !== "--verify") {
    throw new Error(
      "Usage: npx tsx scripts/check-cafe-database.ts --snapshot | --verify [--enforcement-enabled]",
    );
  }
  nextEnv.loadEnvConfig(path.resolve("apps/admin"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (
    !url ||
    !serviceKey ||
    !anonKey ||
    new URL(url).hostname !== projectRef + ".supabase.co"
  ) {
    throw new Error(
      "The local Admin configuration must reference the exact café project.",
    );
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function readRows(table: string) {
    const rows: Row[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await admin
        .from(table)
        .select("*")
        .order("id")
        .range(offset, offset + 499);
      if (result.error)
        throw new Error(
          `Read-only table check failed for ${table} (${result.error.code}).`,
        );
      const page = result.data as Row[];
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }
  const current: Record<string, Row[]> = Object.fromEntries(
    await Promise.all(
      tables.map(async (table): Promise<[string, Row[]]> => [
        table,
        await readRows(table),
      ]),
    ),
  );
  mkdirSync(path.dirname(baselinePath), { recursive: true });
  if (mode === "--snapshot") {
    if (existsSync(baselinePath))
      throw new Error(
        "A preservation baseline already exists; keep it for verification.",
      );
    const snapshot: Snapshot = {
      projectRef,
      capturedAt: new Date().toISOString(),
      tables: {},
    };
    for (const table of tables) {
      // These fields legitimately change during migration or normal order progression.
      const excluded =
        table === "orders"
          ? ["updated_at", "status", "payment_status"]
          : ["updated_at"];
      const columns = Object.keys(current[table][0] ?? {})
        .filter((column) => !excluded.includes(column))
        .sort();
      snapshot.tables[table] = {
        columns,
        rows: current[table].map((row) => ({
          id: row.id,
          digest: digest(row, columns),
        })),
      };
    }
    writeFileSync(baselinePath, JSON.stringify(snapshot, null, 2), {
      flag: "wx",
    });
    console.log(
      JSON.stringify(
        {
          projectRef,
          writesToDatabase: false,
          baselinePath,
          counts: Object.fromEntries(
            tables.map((table) => [table, current[table].length]),
          ),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!existsSync(baselinePath))
    throw new Error(
      "Capture --snapshot before migration; no preservation baseline exists.",
    );
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Snapshot;
  if (baseline.projectRef !== projectRef)
    throw new Error(
      "The preservation baseline references a different project.",
    );
  const preservation = tables.map((table) => {
    const previous = baseline.tables[table];
    const byId = new Map(current[table].map((row) => [row.id, row]));
    return {
      table,
      before: previous.rows.length,
      after: current[table].length,
      missing: previous.rows
        .filter((row) => !byId.has(row.id))
        .map((row) => row.id),
      changed: previous.rows
        .filter(
          (row) =>
            byId.has(row.id) &&
            digest(byId.get(row.id)!, previous.columns) !== row.digest,
        )
        .map((row) => row.id),
    };
  });
  const { data: settings, error: settingsError } = await admin
    .from("inventory_settings")
    .select("enforcement_enabled,branch_name")
    .single();
  const { data: catalog, error: catalogError } = await anon.rpc(
    "get_published_catalog",
  );
  const { data: board, error: boardError } = await anon.rpc(
    "get_pos_status_board",
  );
  const privateAccess = await Promise.all(
    [
      "stock_batches",
      "stock_movements",
      "pos_cash_payments",
      "pos_checkout_attempts",
    ].map(async (table) => {
      const accessible = await admin.from(table).select("*").limit(1);
      const result = await anon.from(table).select("*").limit(1);
      return {
        table,
        available: !accessible.error,
        blocked: !!result.error || result.data?.length === 0,
        errorCode: result.error?.code ?? null,
      };
    }),
  );
  const report: Record<string, unknown> = {
    projectRef,
    checkedAt: new Date().toISOString(),
    writesToDatabase: false,
    preservation,
    enforcementDisabled:
      !settingsError && settings?.enforcement_enabled === false,
    enforcementMatchesExpected:
      !settingsError && settings?.enforcement_enabled === expectedEnforcement,
    publicCatalogAvailable: !catalogError && !!catalog,
    tvProjectionAvailable:
      !boardError &&
      Array.isArray(board?.orders) &&
      board.orders.every(
        (row: Record<string, unknown>) =>
          Object.keys(row).sort().join(",") === "order_number,status",
      ),
    privateAccess,
  };
  if (process.env.JAYDS_DATABASE_URL) {
    const connectionUrl = new URL(process.env.JAYDS_DATABASE_URL);
    if (
      connectionUrl.hostname !== `db.${projectRef}.supabase.co` &&
      !(
        connectionUrl.hostname.endsWith(".pooler.supabase.com") &&
        decodeURIComponent(connectionUrl.username) === `postgres.${projectRef}`
      )
    ) {
      throw new Error(
        "JAYDS_DATABASE_URL must identify the exact café database.",
      );
    }
    for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
      connectionUrl.searchParams.delete(parameter);
    const client = new pg.Client({
      connectionString: connectionUrl.toString(),
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 10000,
    });
    try {
      await client.connect();
      await client.query("BEGIN READ ONLY");
      report.migrationHistory = (
        await client.query(
          "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version",
        )
      ).rows;
      const cronPresent = (
        await client.query("SELECT to_regclass('cron.job') IS NOT NULL present")
      ).rows[0].present;
      report.scheduler = cronPresent
        ? (
            await client.query(
              "SELECT jobname,schedule,active FROM cron.job WHERE jobname LIKE 'jayds-%' ORDER BY jobname",
            )
          ).rows
        : { available: false };
      report.balanceMismatches = Number(
        (
          await client.query(
            "SELECT count(*) count FROM ingredients i WHERE i.current_stock<>(SELECT coalesce(sum(b.quantity),0) FROM stock_batches b WHERE b.ingredient_id=i.id)",
          )
        ).rows[0].count,
      );
      await client.query("ROLLBACK");
    } catch (error) {
      report.databaseConnectionCheck = {
        passed: false,
        code:
          typeof error === "object" && error && "code" in error
            ? String(error.code)
            : "CONNECTION_CHECK_FAILED",
      };
    } finally {
      await client.end();
    }
  }
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (
    preservation.some(
      (table) => table.missing.length || table.changed.length,
    ) ||
    !report.enforcementMatchesExpected ||
    !report.publicCatalogAvailable ||
    !report.tvProjectionAvailable ||
    privateAccess.some((table) => !table.available || !table.blocked) ||
    report.databaseConnectionCheck
  ) {
    process.exitCode = 1;
  }
}
main().catch((error) => {
  // Supabase/connection errors are summarized above; never print a connection URL or key.
  console.error(
    error instanceof Error
      ? error.message
      : "Read-only deployment check failed.",
  );
  process.exitCode = 1;
});
