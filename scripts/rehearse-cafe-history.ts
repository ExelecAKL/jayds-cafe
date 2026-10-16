import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildCafeHistory } from "./history/model.ts";
import {
  restoreLocalHistoryDatabase,
  readHistoryInput,
  hash,
  type Backup,
} from "./history/local-database.ts";
import { historyParts } from "./history/staging.ts";
mkdirSync(".codex-logs", { recursive: true });
let stage = "read approved private backup";
let local: Awaited<ReturnType<typeof restoreLocalHistoryDatabase>> | null =
  null;
try {
  const backup = JSON.parse(
    readFileSync(
      process.env.JAYDS_HISTORY_BACKUP ??
        ".codex-logs/before-synthetic-2026-10-16-clean.json",
      "utf8",
    ).replace(/^\ufeff/, ""),
  ) as Backup;
  stage = "local restore and forward migrations";
  local = await restoreLocalHistoryDatabase(backup);
  stage = "build connected history";
  const input = await readHistoryInput(local.db);
  const now = new Date(
    process.env.JAYDS_HISTORY_NOW ?? new Date().toISOString(),
  );
  const model = buildCafeHistory(input, { now });
  stage = "compare every configuration with canonical SQL recipes";
  for (const configuration of model.configurations) {
    const actual: { ingredient_id: string; quantity: string }[] = (
      await local.db.query<{ ingredient_id: string; quantity: string }>(
        "SELECT * FROM inv_requirements($1,$2,1) ORDER BY ingredient_id",
        [configuration.item, JSON.stringify(configuration.variants)],
      )
    ).rows;
    const expected = configuration.requirements;
    assert.deepEqual(
      Object.fromEntries(
        actual.map((r) => [
          r.ingredient_id,
          Math.round(Number(r.quantity) * 1e6) / 1e6,
        ]),
      ),
      expected,
    );
  }
  // Rehearsal artifacts contain no authentication credentials or storage bytes.
  writeFileSync(".codex-logs/history-input.json", JSON.stringify(input));
  writeFileSync(".codex-logs/history-model.json", JSON.stringify(model));
  // Validate columns now, before constructing a staging import.
  for (const [table, rows] of Object.entries(model.tables)) {
    const columns = (
      await local.db.query<{ name: string }>(
        "SELECT attname name FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped",
        ["public." + table],
      )
    ).rows.map((r) => r.name);
    assert.ok(
      rows.every((r) => Object.keys(r).every((k) => columns.includes(k))),
      "Unknown generated column in " + table,
    );
  }
  stage = "stage guarded local import";
  const baseline = (
    await local.db.query<{ value: unknown }>(
      "SELECT cafe_history_baseline() value",
    )
  ).rows[0].value;
  await local.db.query(
    "INSERT INTO cafe_history_runs(id,manifest,baseline) VALUES($1,$2,$3)",
    [model.id, JSON.stringify(model.manifest), JSON.stringify(baseline)],
  );
  const parts = historyParts(model);
  for (const part of parts)
    await local.db.query("SELECT cafe_history_stage($1,$2,$3,$4)", [
      model.id,
      part.table,
      part.part,
      JSON.stringify(part.rows),
    ]);
  console.log(JSON.stringify({ stage, parts: parts.length }));
  stage = "apply guarded local import";
  const started = performance.now();
  const applied = (
    await local.db.query<{ value: Record<string, unknown> }>(
      "SELECT cafe_history_apply($1) value",
      [model.id],
    )
  ).rows[0].value;
  assert.equal(applied.status, "PASS");
  const applyMs = Math.round(performance.now() - started);
  stage = "verify reports and import idempotency";
  const retried = (
    await local.db.query<{ value: unknown }>(
      "SELECT cafe_history_apply($1) value",
      [model.id],
    )
  ).rows[0].value;
  assert.deepEqual(retried, applied);
  assert.equal(
    (
      await local.db.query(
        "SELECT 1 FROM cafe_history_parts WHERE run_id=$1 AND payload IS NOT NULL",
        [model.id],
      )
    ).rows.length,
    0,
  );
  const finance = [];
  let included = 0;
  for (
    let year = Number(String(model.manifest.from).slice(0, 4));
    year <= Number(String(model.manifest.to).slice(0, 4));
    year++
  ) {
    const from =
        year === Number(String(model.manifest.from).slice(0, 4))
          ? model.manifest.from
          : year + "-01-01",
      to =
        year === Number(String(model.manifest.to).slice(0, 4))
          ? model.manifest.to
          : year + "-12-31";
    const result = (
      await local.db.query<{ value: Record<string, unknown> }>(
        "SELECT finance_report($1,$2) value",
        [from, to],
      )
    ).rows[0].value;
    included += Number(result.history_orders_included);
    finance.push({ from, to, ...result });
  }
  assert.ok(included > 10000);
  const forecasts = (
    await local.db.query<{ count: number }>(
      "SELECT count(*)::integer count FROM inventory_forecasts WHERE history_days=56",
    )
  ).rows[0].count;
  assert.ok(forecasts > 100);
  const availability = (
    await local.db.query(
      "SELECT id,get_item_availability(id) availability FROM menu_items WHERE status='active'",
    )
  ).rows;
  const evidence = {
    status: "PASS",
    localOnly: true,
    backupPreservation: local.preservation,
    manifest: model.manifest,
    configurationsChecked: model.configurations.length,
    modelSha256: hash(model),
    import: applied,
    applyMs,
    forecastRows: forecasts,
    availabilityRows: availability.length,
    finance,
  };
  writeFileSync(
    ".codex-logs/history-rehearsal.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    JSON.stringify({
      status: "PASS",
      localOnly: true,
      configurationsChecked: model.configurations.length,
      applyMs,
      manifest: model.manifest,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "FAIL",
      stage,
      code: (error as { code?: string }).code ?? "REHEARSAL_FAILED",
      message:
        error instanceof assert.AssertionError
          ? error.message
          : "Local rehearsal failed; private records and SQL parameters are not printed.",
    }),
  );
  writeFileSync(
    ".codex-logs/history-rehearsal-private-error.json",
    JSON.stringify(
      {
        stage,
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await local?.db.close();
}
