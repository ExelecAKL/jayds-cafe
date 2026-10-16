"use client";
import { useEffect, useRef, useState } from "react";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import { supabase } from "@cafeos/shared/supabase/client";
import {
  PageHeader,
  Badge,
  businessDate,
  Drawer,
  Feedback,
} from "../../../components/Operations";
import { PaginatedTable } from "../../../components/PaginatedTable";
type Entry = {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  reason: string | null;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
};
export default function AuditPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const load = async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const { data, error } = await withRequestDeadline((signal) =>
        supabase
          .from("admin_audit")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200)
          .abortSignal(signal),
      );
      if (requestVersion.current !== version) return;
      if (error)
        throw new Error("The audit trail could not load. Please try again.");
      setError("");
      setRows(data ?? []);
    } catch (failure) {
      if (requestVersion.current === version)
        setError(
          failure instanceof Error
            ? failure.message
            : "The audit trail could not load. Please try again.",
        );
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  };
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="Security & accountability"
        title="Audit trail"
        description="The latest 200 immutable changes to catalog, inventory, and purchasing."
      >
        <button
          className="ops-button"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : error ? "Try again" : "Refresh"}
        </button>
      </PageHeader>
      <Feedback error={error} />
      <section className="ops-panel">
        <div className="ops-toolbar">
          <input
            type="search"
            aria-label="Search audit trail"
            placeholder="Search action, entity, or actor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {loading ? (
          <p className="ops-loading" role="status">
            Loading audit trail…
          </p>
        ) : (
          <div className="ops-table-wrap">
            <PaginatedTable
              aria-label="Audit log"
              resetKey={search}
              className="ops-table"
            >
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) =>
                    (r.action + r.entity + r.actor_id + r.reason)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((r) => (
                    <tr key={r.id}>
                      <td>
                        {businessDate(r.created_at)}
                        <small>
                          {new Date(r.created_at).toLocaleTimeString("en-PH", {
                            timeZone: "Asia/Manila",
                          })}
                        </small>
                      </td>
                      <td>
                        <Badge>{r.action}</Badge>
                      </td>
                      <td>
                        {r.entity}
                        <small>{r.reason}</small>
                      </td>
                      <td>{r.actor_id?.slice(0, 8) ?? "System"}</td>
                      <td>
                        <button
                          className="ops-button small"
                          onClick={() => setSelected(r)}
                        >
                          View change
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </PaginatedTable>
          </div>
        )}
      </section>
      {selected && (
        <Drawer title="Recorded change" onClose={() => setSelected(null)} wide>
          <p>
            {selected.entity} · {selected.entity_id}
          </p>
          <p>Actor: {selected.actor_id ?? "System"}</p>
          <h3>Before</h3>
          <pre className="ops-json">
            {JSON.stringify(selected.before_data, null, 2)}
          </pre>
          <h3>After</h3>
          <pre className="ops-json">
            {JSON.stringify(selected.after_data, null, 2)}
          </pre>
        </Drawer>
      )}
    </>
  );
}
