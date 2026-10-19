"use client";
import { AdminSelect } from "./AdminSelect";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@cafeos/shared/supabase/client";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import type {
  StockMovement,
  Stocktake,
  StockBatch,
  DemandForecast,
} from "@cafeos/shared/inventory/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Badge,
  businessDate,
  Drawer,
  Feedback,
  peso,
  quantity,
  useOperations,
  type OperationalStock,
} from "./Operations";
import { DetailSkeleton } from "./AdminSkeletons";
import { OrderDetailsModal } from "./OrderDetailsModal";
import { notifyAdmin } from "./AdminToasts";
import { stockReason } from "../lib/stock-copy";

async function read<T>(name: string, args: Record<string, unknown>) {
  const { data, error } = await withRequestDeadline((signal) =>
    supabase.rpc(name, args).abortSignal(signal),
  );
  if (error)
    throw new Error(
      error.code === "PGRST202"
        ? "The stock update needs to be installed before these details can open."
        : error.message,
    );
  return data as T;
}
function useStockRead<T>(name: string, args: Record<string, unknown>) {
  const key = JSON.stringify(args);
  const [result, setResult] = useState<{
    data: T | null;
    loading: boolean;
    error: string;
  }>({ data: null, loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setResult({ data: null, loading: true, error: "" });
      void read<T>(name, JSON.parse(key))
        .then((data) => {
          if (active) setResult({ data, loading: false, error: "" });
        })
        .catch((failure) => {
          if (active)
            setResult({
              data: null,
              loading: false,
              error:
                failure instanceof Error
                  ? failure.message
                  : "Could not load details. Try again.",
            });
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [name, key, attempt]);
  return { ...result, retry: () => setAttempt((value) => value + 1) };
}
function ReadFeedback({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return (
    <>
      {loading && <DetailSkeleton label="Opening details…" fields={4} lines={3} />}
      <Feedback error={error} />
      {error && (
        <button className="ops-button" onClick={retry}>
          Try again
        </button>
      )}
    </>
  );
}
type RecordDetail = {
  kind: string;
  record: StockMovement & Stocktake;
  stock: OperationalStock;
  actor: { name: string | null; role: string } | null;
  batch: StockBatch | null;
  count: Stocktake | null;
  receipt: {
    reference: string;
    supplier_name: string;
    purchase_order_id: string;
  } | null;
  order: {
    id: string;
    number: string;
    status: string;
    payment_status: string;
    total: number;
  } | null;
  related_movements: (StockMovement & { name: string; unit: string })[];
};
export function StockRecordDrawer({
  kind,
  id,
  onClose,
}: {
  kind: "movement" | "stocktake";
  id: string;
  onClose: () => void;
}) {
  const result = useStockRead<RecordDetail>("admin_stock_record", {
    p_kind: kind,
    p_id: id,
  });
  const [orderOpen, setOrderOpen] = useState(false);
  const d = result.data;
  if (orderOpen && d?.order)
    return (
      <OrderDetailsModal
        orderId={d.order.id}
        onClose={() => setOrderOpen(false)}
      />
    );
  return (
    <Drawer
      title={
        kind === "stocktake"
          ? "Physical count details"
          : "Stock movement details"
      }
      onClose={onClose}
      wide
    >
      <ReadFeedback {...result} />
      {d && (
        <>
          <div className="ops-record-heading">
            <div>
              <h2>{d.stock.name}</h2>
              <p>
                {businessDate(d.record.created_at)} ·{" "}
                {d.actor?.name || "Recorded actor unavailable"}
              </p>
            </div>
            <Badge tone="brand">
              {kind === "stocktake" ? d.record.state : d.record.movement_type}
            </Badge>
          </div>
          <div className="ops-detail-grid">
            {(kind === "stocktake"
              ? [
                  { label: "Expected", value: d.record.expected },
                  { label: "Counted", value: d.record.counted },
                  {
                    label: "Difference",
                    value: Number(d.record.counted) - Number(d.record.expected),
                  },
                ]
              : [
                  { label: "Change", value: d.record.quantity },
                  { label: "Balance after", value: d.record.balance_after },
                ]
            ).map((item) => (
              <div key={item.label}>
                <small>{item.label}</small>
                <strong>
                  {quantity(item.value)} <span>{d.stock.unit}</span>
                </strong>
              </div>
            ))}
          </div>
          <p className="ops-record-reason">{stockReason(d.record.reason)}</p>
          {d.order ? (
            <button
              className="ops-source-card"
              onClick={() => setOrderOpen(true)}
            >
              <span>
                <small>Connected order</small>
                <strong>{d.order.number}</strong>
                <span>
                  {d.order.status} · {d.order.payment_status}
                </span>
              </span>
              <b>{peso(d.order.total)} →</b>
            </button>
          ) : (
            <p className="ops-muted">No order is linked to this record.</p>
          )}
          <dl className="ops-record-list">
            {d.batch && (
              <>
                <dt>Batch</dt>
                <dd>{d.batch.batch_code}</dd>
                <dt>Expiry</dt>
                <dd>
                  {d.batch.expires_on
                    ? businessDate(d.batch.expires_on)
                    : "Not recorded"}
                </dd>
                <dt>Recorded unit cost</dt>
                <dd>
                  {peso(d.batch.unit_cost)} / {d.stock.unit}
                </dd>
              </>
            )}
            {d.receipt && (
              <>
                <dt>Delivery receipt</dt>
                <dd>{d.receipt.reference}</dd>
                <dt>Supplier</dt>
                <dd>{d.receipt.supplier_name || "Not recorded"}</dd>
                <dt>Purchase</dt>
                <dd>
                  <Link className="ops-text-link" href="/purchasing">
                    View purchasing →
                  </Link>
                </dd>
              </>
            )}
            {d.count && kind !== "stocktake" && (
              <>
                <dt>Physical count</dt>
                <dd>
                  {quantity(d.count.counted)} {d.stock.unit} · {d.count.state}
                </dd>
              </>
            )}
          </dl>
          {d.related_movements.length > 0 && (
            <>
              <h3 className="ops-section-title">
                From the same {d.order ? "order" : "record"}
              </h3>
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Stock item</th>
                      <th>Movement</th>
                      <th className="number">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.related_movements.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.movement_type}</td>
                        <td className="number">
                          {quantity(row.quantity)} {row.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
type Insight = {
  stock: OperationalStock;
  forecast: DemandForecast | null;
  business_date: string;
  stale: boolean;
  history: { date: string; quantity: number; estimated: boolean }[];
  projection: {
    date: string;
    demand: number;
    without_deliveries: number;
    with_scheduled_deliveries: number;
  }[];
};
const shortDate = (value: string) =>
  new Date(value + "T12:00:00+08:00").toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
  });
export function StockForecastDrawer({
  id,
  horizon,
  onClose,
}: {
  id: string;
  horizon: number;
  onClose: () => void;
}) {
  const [days, setDays] = useState(horizon);
  const [chart, setChart] = useState("outlook");
  const result = useStockRead<Insight>("admin_stock_insight", {
    p_id: id,
    p_horizon: days,
  });
  const d = result.data,
    f = d?.forecast;
  const history =
    d?.history.map((row) => ({ ...row, quantity: Number(row.quantity) })) ?? [];
  const projection =
    d?.projection.map((row) => ({
      ...row,
      without_deliveries: Number(row.without_deliveries),
      with_scheduled_deliveries: Number(row.with_scheduled_deliveries),
    })) ?? [];
  return (
    <Drawer
      title={d ? `${d.stock.name} · Stock outlook` : "Stock outlook"}
      onClose={onClose}
      wide
    >
      <div className="ops-toolbar">
        <div className="ops-segmented" aria-label="Forecast view">
          {[
            { key: "outlook", label: "Stock outlook" },
            { key: "usage", label: "Past usage" },
          ].map((item) => (
            <button
              key={item.key}
              aria-pressed={chart === item.key}
              onClick={() => setChart(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <AdminSelect
          aria-label="Detail forecast horizon"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          {[7, 14, 30].map((n) => (
            <option key={n} value={n}>
              {n} days
            </option>
          ))}
        </AdminSelect>
      </div>
      <ReadFeedback {...result} />
      {d && (
        <>
          <div className="ops-detail-grid">
            <div>
              <small>Available now</small>
              <strong>
                {quantity(d.stock.available_stock)} <span>{d.stock.unit}</span>
              </strong>
            </div>
            <div>
              <small>Projected coverage</small>
              <strong>
                {f?.coverage_days == null
                  ? " - "
                  : `${quantity(f.coverage_days)} days`}
              </strong>
            </div>
            <div>
              <small>Suggested purchase</small>
              <strong>
                {f ? quantity(f.reorder_quantity) : " - "}{" "}
                <span>{d.stock.unit}</span>
              </strong>
            </div>
          </div>
          {(!f || d.stale || f.history_days < 14 || f.historical_estimate) && (
            <div className="ops-notice">
              <p>
                {!f
                  ? "Refresh forecasts to see an outlook."
                  : d.stale
                    ? "This outlook is out of date. Refresh forecasts before purchasing."
                    : f.history_days < 14
                      ? `Only ${f.history_days} days of history. Review this early estimate.`
                      : "Some past usage is estimated from current recipes."}
              </p>
            </div>
          )}
          <section
            className="ops-stock-chart"
            aria-label={
              chart === "usage"
                ? "Historical daily usage chart"
                : "Projected stock balance chart"
            }
          >
            <h3>
              {chart === "usage"
                ? "Daily usage · past 8 weeks"
                : `Projected balance · next ${days} days`}
            </h3>
            <p className="ops-muted">{d.stock.unit}</p>
            <div style={{ height: 260, width: "100%", minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                {chart === "usage" ? (
                  <BarChart
                    data={history}
                    margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid vertical={false} stroke="#eee5dd" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      minTickGap={30}
                      fontSize={11}
                    />
                    <YAxis width={55} fontSize={11} />
                    <Tooltip
                      labelFormatter={(label) => shortDate(String(label))}
                    />
                    <Bar
                      name={`Used (${d.stock.unit})`}
                      dataKey="quantity"
                      fill="var(--ui-chart-line)"
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                ) : (
                  <LineChart
                    data={projection}
                    margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid vertical={false} stroke="#eee5dd" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      minTickGap={30}
                      fontSize={11}
                    />
                    <YAxis width={55} fontSize={11} />
                    <Tooltip
                      labelFormatter={(label) => shortDate(String(label))}
                    />
                    <ReferenceLine
                      y={0}
                      stroke="var(--ui-status-danger)"
                      strokeDasharray="4 4"
                    />
                    <Line
                      name={`Current stock (${d.stock.unit})`}
                      dataKey="without_deliveries"
                      stroke="var(--ui-text-link)"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      name={`With scheduled deliveries (${d.stock.unit})`}
                      dataKey="with_scheduled_deliveries"
                      stroke="var(--ui-status-success)"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="ops-chart-key">
              {chart === "outlook" && (
                <>
                  <span>
                    <i />
                    Current stock
                  </span>
                  <span>
                    <i className="incoming" />
                    With scheduled deliveries
                  </span>
                </>
              )}
            </div>
            <p className="ops-chart-caption">
              {chart === "usage"
                ? "Completed-order usage, in Philippine business dates."
                : "Estimated from average daily demand. Scheduled deliveries depend on their expected dates."}
            </p>
          </section>
          <details className="ops-disclosure">
            <summary>View numbers and forecast details</summary>
            <p className="ops-muted">
              {f
                ? `${f.method === "weekday_8_weeks" ? "Weekday pattern" : "Recent daily average"} · ${f.history_days} days of history · Updated ${businessDate(f.calculated_at)}`
                : "No forecast available"}
            </p>
            <div className="ops-table-wrap" style={{ maxHeight: 300 }}>
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    {chart === "usage" ? (
                      <>
                        <th className="number">Used ({d.stock.unit})</th>
                        <th>Basis</th>
                      </>
                    ) : (
                      <>
                        <th className="number">Current stock</th>
                        <th className="number">With deliveries</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {chart === "usage"
                    ? history.map((row) => (
                        <tr key={row.date}>
                          <td>{shortDate(row.date)}</td>
                          <td className="number">{quantity(row.quantity)}</td>
                          <td>{row.estimated ? "Estimated" : "Recorded"}</td>
                        </tr>
                      ))
                    : projection.map((row) => (
                        <tr key={row.date}>
                          <td>{shortDate(row.date)}</td>
                          <td className="number">
                            {quantity(row.without_deliveries)} {d.stock.unit}
                          </td>
                          <td className="number">
                            {quantity(row.with_scheduled_deliveries)}{" "}
                            {d.stock.unit}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </Drawer>
  );
}
type PurchasePreview = {
  review_hash: string;
  lines: {
    ingredient_id: string;
    name: string;
    unit: string;
    supplier_name: string;
    quantity: number;
    cost_per_unit: number;
  }[];
  removals: {
    line_id: string;
    name: string;
    unit: string;
    old_quantity: number;
  }[];
};
export function ReplenishmentReview({ onClose }: { onClose: () => void }) {
  const result = useStockRead<PurchasePreview>(
    "admin_replenishment_preview",
    {},
  );
  const ops = useOperations();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const create = useCallback(async () => {
    if (!result.data || busy) return;
    setBusy(true);
    setError("");
    try {
      await ops.run("admin_create_replenishment", {
        p_review_hash: result.data.review_hash,
      });
      notifyAdmin(
        "Purchase drafts are ready to review in Purchasing.",
        "success",
      );
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Drafts could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }, [result.data, busy, ops, onClose]);
  const d = result.data;
  return (
    <Drawer
      title="Review purchase suggestions"
      description="14-day outlook"
      onClose={onClose}
      busy={busy}
      wide
    >
      <ReadFeedback {...result} />
      <Feedback error={error} />
      {d && (
        <>
          {d.lines.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Stock item</th>
                    <th>Supplier</th>
                    <th className="number">Buy</th>
                    <th className="number">Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((row) => (
                    <tr key={row.ingredient_id}>
                      <td className="item-name">{row.name}</td>
                      <td>{row.supplier_name}</td>
                      <td className="number">
                        {quantity(row.quantity)} {row.unit}
                      </td>
                      <td className="number">
                        {peso(Number(row.quantity) * Number(row.cost_per_unit))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-empty">
              <h3>No purchase suggestions yet</h3>
              <p>
                Suggestions need fresh forecasts, at least 14 days of history
                and a preferred supplier.
              </p>
            </div>
          )}
          {d.removals.length > 0 && (
            <div className="ops-notice">
              <p>
                Remove from untouched purchase drafts:{" "}
                {d.removals.map((row) => row.name).join(", ")}.
              </p>
            </div>
          )}
          <p className="ops-muted">
            Creates drafts for review in Purchasing. Edited drafts are kept.
          </p>
          <div className="ops-form-actions">
            <button className="ops-button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            {error && (
              <button
                className="ops-button"
                disabled={busy}
                onClick={() => {
                  setError("");
                  result.retry();
                }}
              >
                Refresh suggestions
              </button>
            )}
            <button
              className="ops-button primary"
              disabled={
                busy ||
                result.loading ||
                (!d.lines.length && !d.removals.length)
              }
              onClick={() => void create()}
            >
              {busy ? "Creating…" : "Create purchase drafts"}
            </button>
          </div>
        </>
      )}
    </Drawer>
  );
}
