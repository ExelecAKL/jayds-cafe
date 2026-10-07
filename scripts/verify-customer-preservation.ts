// Compare local backup content without printing customer, order, or credential data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
function read(name: string) {
  const outer = JSON.parse(readFileSync(name, "utf8").replace(/^\ufeff/, ""));
  const supplied = (outer.rows ?? outer.data ?? outer)[0].backup;
  return typeof supplied === "string" ? JSON.parse(supplied) : supplied;
}
function stable(value: unknown): string {
  return Array.isArray(value)
    ? "[" + value.map(stable).join(",") + "]"
    : value && typeof value === "object"
      ? "{" +
        Object.keys(value)
          .sort()
          .map(
            (key) =>
              JSON.stringify(key) +
              ":" +
              stable((value as Record<string, unknown>)[key]),
          )
          .join(",") +
        "}"
      : JSON.stringify(value);
}
const hash = (rows: unknown[]) =>
  createHash("sha256")
    .update(stable(rows.map(stable).sort()))
    .digest("hex");
const before = read(
  process.argv[2] ?? ".codex-logs/cafe-before-customer-upgrade-logical.json",
);
const after = read(
  process.argv[3] ?? ".codex-logs/cafe-after-customer-upgrade-logical.json",
);
// Forecasts are derived nightly. Preserve every historical snapshot and verify
// changed current projections against their immutable snapshots and the actual
// successful scheduled job, rather than ignoring a difference in business data.
const snapshotColumns = before.columns
  .filter((c: { table: string }) => c.table === "forecast_snapshots")
  .map((c: { name: string }) => c.name);
const snapshotRows = new Set<string>(
  after.data.forecast_snapshots.map((row: Record<string, unknown>) =>
    stable(Object.fromEntries(snapshotColumns.map((c: string) => [c, row[c]]))),
  ),
);
const historicalForecastSnapshotsPreserved =
  before.data.forecast_snapshots.every((row: Record<string, unknown>) =>
    snapshotRows.has(stable(row)),
  );
const forecastChanged =
  hash(before.data.inventory_forecasts) !==
  hash(after.data.inventory_forecasts);
let forecastRefreshVerified = !forecastChanged;
if (forecastChanged) {
  const metadata = JSON.parse(
    readFileSync(
      ".codex-logs/customer-live-forecast-maintenance.json",
      "utf8",
    ).replace(/^\ufeff/, ""),
  ).rows[0].checks;
  const keys = (rows: Record<string, unknown>[]) =>
    rows.map((r) => `${r.ingredient_id}:${r.horizon}`).sort();
  forecastRefreshVerified =
    stable(keys(before.data.inventory_forecasts)) ===
      stable(keys(after.data.inventory_forecasts)) &&
    metadata.forecast_job.some(
      (j: { active: boolean; schedule: string }) =>
        j.active && j.schedule === "0 18 * * *",
    ) &&
    after.data.inventory_forecasts.every(
      (row: Record<string, unknown>) =>
        after.data.forecast_snapshots.some(
          (snapshot: Record<string, unknown>) =>
            Object.entries(row).every(
              ([column, value]) => stable(value) === stable(snapshot[column]),
            ),
        ) &&
        metadata.recent_forecast_runs.some(
          (run: { status: string; start_time: string }) =>
            run.status === "succeeded" &&
            Math.abs(
              Date.parse(run.start_time) -
                Date.parse(String(row.calculated_at)),
            ) < 1000,
        ),
    );
}
const preservation = before.tables.map((table: { name: string }) => {
  const columns = before.columns
    .filter((c: { table: string }) => c.table === table.name)
    .map((c: { name: string }) => c.name);
  const original = before.data[table.name];
  const current = after.data[table.name];
  assert.ok(
    Array.isArray(current),
    "An original table is missing: " + table.name,
  );
  const projected = current.map((row: Record<string, unknown>) =>
    Object.fromEntries(columns.map((c: string) => [c, row[c]])),
  );
  const unchanged = hash(original) === hash(projected);
  return {
    table: table.name,
    before: original.length,
    after: current.length,
    unchanged,
    preserved:
      unchanged ||
      (table.name === "forecast_snapshots" &&
        historicalForecastSnapshotsPreserved) ||
      (table.name === "inventory_forecasts" && forecastRefreshVerified),
  };
});
const report = {
  verifiedAt: new Date().toISOString(),
  allExistingBusinessRecordsUnchanged: preservation
    .filter((p: { table: string }) => p.table !== "catalog_state")
    .every((p: { unchanged: boolean }) => p.unchanged),
  allExistingBusinessRecordsPreserved: preservation
    .filter((p: { table: string }) => p.table !== "catalog_state")
    .every((p: { preserved: boolean }) => p.preserved),
  historicalForecastSnapshotsPreserved,
  forecastRefreshVerified,
  catalogVersionAdvanced:
    Number(after.data.catalog_state[0].version) >=
    Number(before.data.catalog_state[0].version),
  catalogStateNote:
    "Inventory maintenance advances the public catalog cache version independently of business record changes.",
  preservation,
};
writeFileSync(
  process.argv[4] ?? ".codex-logs/customer-live-preservation.json",
  JSON.stringify(report, null, 2),
);
assert.ok(
  report.allExistingBusinessRecordsPreserved && report.catalogVersionAdvanced,
  "Existing records differ; inspect the local preservation report.",
);
console.log(
  JSON.stringify({
    tables: preservation.length,
    allExistingBusinessRecordsUnchanged:
      report.allExistingBusinessRecordsUnchanged,
    allExistingBusinessRecordsPreserved:
      report.allExistingBusinessRecordsPreserved,
    historicalForecastSnapshotsPreserved,
    forecastRefreshVerified,
    catalogVersionAdvanced: report.catalogVersionAdvanced,
    products: after.data.menu_items.length,
    orders: after.data.orders.length,
    stockItems: after.data.ingredients.length,
  }),
);
