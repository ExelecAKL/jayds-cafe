import type { HistoryModel, Row } from "./model.ts";
export function historyParts(model: HistoryModel) {
  const parts: { table: string; part: number; rows: Row[] }[] = [];
  for (const [table, rows] of Object.entries({
    ...model.tables,
    ...Object.fromEntries(
      Object.entries(model.updates).map(([name, rows]) => [
        "update_" + name,
        rows,
      ]),
    ),
  })) {
    for (let from = 0; from < rows.length; from += 1000)
      parts.push({
        table,
        part: from / 1000,
        rows: rows.slice(from, from + 1000),
      });
  }
  return parts;
}
