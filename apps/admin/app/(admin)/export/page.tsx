"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import { createUuid } from "@cafeos/shared/utils/uuid";
import {
  PageHeader,
  Feedback,
  Icon,
  LoadingRows,
} from "../../../components/Operations";
import { notifyAdmin } from "../../../components/AdminToasts";
import { dataZip, recordsCsv } from "../../../utils/exportData";
type Table = {
  table_name: string;
  section: string;
  count: number;
  excluded_fields: string[];
  columns: string[];
};
type Manifest = {
  job_id: string;
  created_at: string;
  total_rows: number;
  tables: Table[];
  exclusions: string[];
};
async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
  timeout = 12_000,
) {
  const { data, error } = await withRequestDeadline(
    (signal) => supabase.rpc(name, args).abortSignal(signal),
    timeout,
  );
  if (error)
    throw new Error(
      error.code === "PGRST202"
        ? "The data export update needs to be installed first."
        : error.message,
    );
  return data as T;
}
const label = (name: string) =>
  name
    .replace(/^customer_/, "")
    .replaceAll("_", " ")
    .replace(/^./, (value) => value.toUpperCase());
export default function ExportPage() {
  const [catalog, setCatalog] = useState<Table[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [format, setFormat] = useState("csv"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [progress, setProgress] = useState<{
    label: string;
    done: number;
    total: number;
  } | null>(null);
  const cancelled = useRef(false),
    running = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await rpc<{ tables: Table[] }>("admin_export_catalog");
      setCatalog(result.tables);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Export options could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      cancelled.current = true;
    };
  }, [load]);
  const sections = [...new Set(catalog.map((table) => table.section))];
  const toggle = (names: string[], checked: boolean) =>
    setSelected((previous) =>
      checked
        ? [...new Set([...previous, ...names])]
        : previous.filter((name) => !names.includes(name)),
    );
  async function download() {
    if (running.current || !selected.length) return;
    running.current = true;
    cancelled.current = false;
    setBusy(true);
    setError("");
    setProgress({ label: "Preparing download…", done: 0, total: 0 });
    const id = createUuid();
    try {
      const manifest = await rpc<Manifest>(
        "admin_export_create",
        { p_id: id, p_tables: selected },
        60_000,
      );
      const tables: Record<string, Record<string, unknown>[]> = {};
      let completed = 0;
      for (const table of manifest.tables) {
        const rows: Record<string, unknown>[] = [];
        let after = 0;
        while (rows.length < Number(table.count)) {
          if (cancelled.current) throw new Error("Download cancelled.");
          setProgress({
            label: `Collecting ${label(table.table_name).toLowerCase()}…`,
            done: completed,
            total: Number(manifest.total_rows),
          });
          const page = await rpc<
            { position: number; data: Record<string, unknown> }[]
          >(
            "admin_export_page",
            { p_id: id, p_table: table.table_name, p_after: after },
            30_000,
          );
          if (!page.length)
            throw new Error("The download is incomplete. Please try again.");
          rows.push(...page.map((row) => row.data));
          after = Number(page[page.length - 1].position);
          completed += page.length;
        }
        if (rows.length !== Number(table.count))
          throw new Error(
            "The download totals did not match. Please try again.",
          );
        tables[table.table_name] = rows;
      }
      if (cancelled.current) throw new Error("Download cancelled.");
      setProgress({ label: "Saving file…", done: completed, total: completed });
      const manifestText = JSON.stringify(manifest, null, 2);
      const blob =
        format === "json"
          ? new Blob([JSON.stringify({ manifest, tables }, null, 2)], {
              type: "application/json",
            })
          : new Blob(
              [
                dataZip([
                  { name: "manifest.json", text: manifestText },
                  ...manifest.tables.map((table) => ({
                    name: table.table_name + ".csv",
                    text: recordsCsv(tables[table.table_name], table.columns),
                  })),
                ]).buffer as ArrayBuffer,
              ],
              { type: "application/zip" },
            );
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `jayds-data-${manifest.created_at.slice(0, 10)}.${format === "json" ? "json" : "zip"}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      notifyAdmin(
        `Downloaded ${completed.toLocaleString()} records.`,
        "success",
      );
    } catch (failure) {
      if (!cancelled.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Download failed. Try again.",
        );
    } finally {
      void rpc("admin_export_close", { p_id: id }).catch(() => {});
      running.current = false;
      setBusy(false);
      setProgress(null);
    }
  }
  return (
    <div>
      <PageHeader
        eyebrow="REPORTS"
        title="Export data"
        description="Choose the records you want to download."
      >
        <button
          className="ops-button"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          <Icon name="refresh" />
          Refresh
        </button>
      </PageHeader>
      <Feedback error={error} />
      <div className="ops-export-layout">
        <section className="ops-panel">
          <div className="ops-panel-header">
            <h2>What would you like to export?</h2>
            <label className="ops-check-label">
              <input
                type="checkbox"
                disabled={busy || !catalog.length}
                checked={!!catalog.length && selected.length === catalog.length}
                onChange={(event) =>
                  toggle(
                    catalog.map((table) => table.table_name),
                    event.target.checked,
                  )
                }
              />
              Select all
            </label>
          </div>
          {loading ? (
            <LoadingRows label="Loading export options…" />
          ) : (
            sections.map((section) => {
              const tables = catalog.filter(
                (table) => table.section === section,
              );
              return (
                <div className="ops-export-group" key={section}>
                  <div>
                    <label className="ops-check-label">
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={tables.every((table) =>
                          selected.includes(table.table_name),
                        )}
                        ref={(node) => {
                          if (node)
                            node.indeterminate =
                              tables.some((table) =>
                                selected.includes(table.table_name),
                              ) &&
                              !tables.every((table) =>
                                selected.includes(table.table_name),
                              );
                        }}
                        onChange={(event) =>
                          toggle(
                            tables.map((table) => table.table_name),
                            event.target.checked,
                          )
                        }
                      />
                      <strong>{section}</strong>
                    </label>
                    <span>
                      {tables
                        .reduce((sum, table) => sum + Number(table.count), 0)
                        .toLocaleString()}{" "}
                      records
                    </span>
                  </div>
                  <details>
                    <summary>Choose individual tables</summary>
                    <div className="ops-export-tables">
                      {tables.map((table) => (
                        <label key={table.table_name}>
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={selected.includes(table.table_name)}
                            onChange={(event) =>
                              toggle([table.table_name], event.target.checked)
                            }
                          />
                          <span>{label(table.table_name)}</span>
                          <small>{Number(table.count).toLocaleString()}</small>
                        </label>
                      ))}
                    </div>
                  </details>
                </div>
              );
            })
          )}
        </section>
        <aside className="ops-form-section ops-export-download">
          <h2>Your download</h2>
          <strong>{selected.length} tables selected</strong>
          <p className="ops-muted">
            {catalog
              .filter((table) => selected.includes(table.table_name))
              .reduce((sum, table) => sum + Number(table.count), 0)
              .toLocaleString()}{" "}
            records currently available
          </p>
          <label className="ops-form">
            File format
            <select
              aria-label="Export format"
              value={format}
              disabled={busy}
              onChange={(event) => setFormat(event.target.value)}
            >
              <option value="csv">CSV files in a ZIP</option>
              <option value="json">JSON</option>
            </select>
          </label>
          <button
            className="ops-button primary"
            disabled={busy || loading || !selected.length}
            onClick={() => void download()}
          >
            {busy ? "Preparing…" : "Download selected data"}
          </button>
          {busy && (
            <>
              <p role="status">{progress?.label}</p>
              {!!progress?.total && (
                <progress
                  aria-label="Export progress"
                  value={progress.done}
                  max={progress.total}
                />
              )}
              <button
                className="ops-button"
                onClick={() => {
                  cancelled.current = true;
                }}
              >
                Cancel download
              </button>
            </>
          )}
          <small>
            Business records only. Sign-in secrets and private files are
            excluded. The download includes a contents list.
          </small>
        </aside>
      </div>
    </div>
  );
}
