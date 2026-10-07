import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const posMigrationFiles = [
  "20261002000100_inventory_operations.sql",
  "20261002000200_atomic_orders_forecasts.sql",
  "20261002000300_operations_overview.sql",
  "20261002000400_pos_cashier.sql",
];

export function posUpgradeSql() {
  return (
    "-- Apply ONCE after the existing Jayds schema. Stock enforcement starts disabled.\n" +
    "-- Generated from additive migrations 001–004; see docs/pos-database-rollout.md.\n" +
    "BEGIN;\n\n" +
    posMigrationFiles
      .map(
        (file) =>
          "-- " +
          file +
          "\n" +
          readFileSync(path.join("supabase/migrations", file), "utf8")
            .replace(/\r\n/g, "\n")
            .trim(),
      )
      .join("\n\n") +
    "\n\nNOTIFY pgrst, 'reload schema';\nCOMMIT;\n"
  );
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  writeFileSync("supabase/jayds_pos_upgrade.sql", posUpgradeSql());
  console.log(
    "Generated transactional Jayds POS upgrade from " +
      posMigrationFiles.join(", ") +
      ".",
  );
}
