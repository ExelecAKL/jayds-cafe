"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@cafeos/shared/supabase/client";
import { useOrders } from "@cafeos/shared/hooks/useOrders";
import {
  Badge,
  Feedback,
  Icon,
  PageHeader,
  peso,
  quantity,
  useOperations,
  type IconName,
} from "./Operations";
import { OrderDetailsModal } from "./OrderDetailsModal";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import { PaginatedTable } from "./PaginatedTable";
interface Sales {
  revenue: number;
  orders: number;
  average: number;
  active: number;
  stock_conflicts: number;
  days: { date: string; revenue: number }[];
}
export default function Overview() {
  const ops = useOperations();
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const request = useRef(0);
  const [days, setDays] = useState(7);
  const [sales, setSales] = useState<Sales | null>(null);
  const [error, setError] = useState("");
  const { orders } = useOrders({
    limit: 6,
    includeCustomer: true,
    includeStatusHistory: false,
    itemMode: "none",
  });
  const fetchSales = useCallback(async () => {
    const version = ++request.current;
    try {
      const { data, error } = await withRequestDeadline((signal) =>
        supabase.rpc("inv_dashboard", { p_days: days }).abortSignal(signal),
      );
      if (version !== request.current) return;
      if (error) throw new Error("Sales could not load. Try Refresh.");
      setSales(data);
      setError("");
    } catch (failure) {
      if (version === request.current)
        setError(
          failure instanceof Error ? failure.message : "Sales could not load.",
        );
    }
  }, [days]);
  useEffect(() => {
    void Promise.resolve().then(fetchSales);
    const channel = supabase
      .channel("jayds-overview-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => void fetchSales(),
      )
      .subscribe();
    const timer = setInterval(() => void fetchSales(), 30_000);
    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [fetchSales]);
  const low = ops.stock.filter(
    (item) => Number(item.available_stock) <= Number(item.min_stock_alert),
  );
  const excess = ops.forecasts.filter(
    (f) =>
      f.horizon === 14 && Number(f.excess_quantity) > 0 && f.history_days >= 14,
  );
  const expiring = ops.stock.filter((item) => Number(item.expiring_stock) > 0);
  const incoming = ops.purchases.filter((po) =>
    ["approved", "ordered", "partial"].includes(po.status),
  );
  const drafts = ops.purchases.filter((po) => po.status === "draft");
  const forecastTimestamp = ops.forecasts[0]?.calculated_at;
  const forecastDate = forecastTimestamp ? new Date(forecastTimestamp) : null;
  const forecastUpdated =
    forecastDate && Number.isFinite(forecastDate.getTime())
      ? forecastDate.toLocaleString("en-PH", { timeZone: "Asia/Manila" })
      : null;
  const max = Math.max(
    ...(sales?.days.map((day) => Number(day.revenue)) ?? [0]),
    1,
  );
  const metrics: {
    label: string;
    value: string;
    note: string;
    icon: IconName;
    href: string;
  }[] = [
    {
      label: "Sales collected",
      value: sales ? peso(sales.revenue) : "—",
      note: `Last ${days} days · paid, active sales`,
      icon: "reports",
      href: "/analytics",
    },
    {
      label: "Orders received",
      value: sales ? quantity(sales.orders) : "—",
      note: `${sales ? peso(sales.average) : "—"} average paid order`,
      icon: "orders",
      href: "/orders",
    },
    {
      label: "Active orders",
      value: sales ? quantity(sales.active) : "—",
      note: "Across POS and mobile",
      icon: "coffee",
      href: "/orders",
    },
    {
      label: "Stock on hand value",
      value:
        ops.error || ops.loading
          ? "—"
          : peso(
              ops.stock.reduce(
                (sum, item) => sum + Number(item.stock_value),
                0,
              ),
            ),
      note: "Recorded receipt costs",
      icon: "stock",
      href: "/inventory",
    },
  ];
  return (
    <div>
      <PageHeader
        eyebrow="Your café, at a glance"
        title="Café overview"
        description="A clear view of today’s service, stock, and next steps."
      >
        <select
          className="ops-button"
          aria-label="Reporting period"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
        <button
          className="ops-button"
          onClick={() => {
            void fetchSales();
            void ops.refresh();
          }}
        >
          <Icon name="refresh" />
          Refresh
        </button>
      </PageHeader>
      <Feedback error={ops.error || error} />
      {ops.settings && !ops.settings.enforcement_enabled && (
        <div className="ops-notice">
          <Icon name="shield" />
          <p>
            <strong>Inventory setup needs attention.</strong>{" "}
            {ops.readiness
              ? ops.readiness.ready
                ? "Setup checks passed. Inventory can now be activated."
                : `${ops.readiness.missing_counts.length} stock items need posted counts; ${ops.readiness.missing_recipes.length} products need recipes.`
              : "Checking recipes and opening stock counts…"}
          </p>
          <Link href="/inventory?setup=1" className="ops-button small">
            Review setup
            <Icon name="arrow" size={14} />
          </Link>
        </div>
      )}
      <div className="ops-metrics">
        {metrics.map((metric) => (
          <Link className="ops-metric" href={metric.href} key={metric.label}>
            <div className="ops-metric-label">
              {metric.label}
              <Icon name={metric.icon} />
            </div>
            <div className="ops-metric-value">{metric.value}</div>
            <small>{metric.note}</small>
          </Link>
        ))}
      </div>
      <div className="ops-quick-actions">
        <span>Quick actions</span>
        <Link href="/orders">
          <Icon name="orders" />
          View orders
        </Link>
        <Link href="/menu">
          <Icon name="catalog" />
          Edit menu
        </Link>
        <Link href="/inventory?tab=stocktakes">
          <Icon name="stock" />
          Count stock
        </Link>
        <Link href="/purchasing">
          <Icon name="purchase" />
          Receive supplies
        </Link>
      </div>
      <div className="ops-overview-grid">
        <section className="ops-panel">
          <div className="ops-panel-header">
            <div>
              <h2>Sales performance</h2>
              <p>Paid sales by Philippine business date</p>
            </div>
            <Badge tone="brand">{days} days</Badge>
          </div>
          <div className="ops-bar-chart">
            {sales?.days.map((day, index) => (
              <div
                key={day.date}
                className="ops-bar-column"
                title={`${day.date}: ${peso(day.revenue)}`}
              >
                <div
                  style={{
                    height: `${Math.max(2, (Number(day.revenue) / max) * 100)}%`,
                  }}
                />
                <span>
                  {days === 7
                    ? new Date(day.date + "T12:00:00Z").toLocaleDateString(
                        "en-PH",
                        { weekday: "short" },
                      )
                    : index % 5 === 0
                      ? day.date.slice(-2)
                      : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="ops-chart-caption">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#a97b54",
              }}
            />
            {sales
              ? `${peso(sales.revenue)} collected during this period`
              : "Waiting for verified sales data"}
          </p>
        </section>
        <section className="ops-panel">
          <div className="ops-panel-header">
            <div>
              <h2>Needs your attention</h2>
              <p>Act before stock affects service</p>
            </div>
            <Icon name="bell" />
          </div>
          {[
            {
              title: "Orders blocked by stock",
              detail: "Resolve reservations before preparation",
              value: sales?.stock_conflicts ?? 0,
              href: "/orders?filter=stock_conflict",
              icon: "orders" as IconName,
            },
            {
              title: "Low and unavailable stock",
              detail: "Review quantities and affected products",
              value: low.length,
              href: "/inventory?filter=low",
              icon: "stock" as IconName,
            },
            {
              title: "Excess stock",
              detail: "Based on forecast coverage",
              value: excess.length,
              href: "/inventory?tab=forecasts&filter=overstock",
              icon: "reports" as IconName,
            },
            {
              title: "Expiry checks",
              detail: "Batches expiring within 14 days",
              value: expiring.length,
              href: "/inventory?filter=expiry",
              icon: "shield" as IconName,
            },
          ].map((action) => (
            <Link
              className="ops-action-row"
              href={action.href}
              key={action.title}
            >
              <span className="ops-action-icon">
                <Icon name={action.icon} />
              </span>
              <div>
                <strong>{action.title}</strong>
                <p>{action.detail}</p>
              </div>
              <b>{ops.error || ops.loading ? "—" : action.value}</b>
              <Icon name="arrow" size={15} />
            </Link>
          ))}
        </section>
      </div>
      <div className="ops-overview-grid">
        <section className="ops-panel">
          <div className="ops-panel-header">
            <div>
              <h2>Recent orders</h2>
              <p>One order stream for the counter and mobile app</p>
            </div>
            <Link href="/orders">
              All orders
              <Icon name="arrow" size={14} />
            </Link>
          </div>
          <div className="ops-table-wrap">
            <PaginatedTable aria-label="Recent orders" className="ops-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th className="number">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <button
                        className="item-name ops-text-button"
                        onClick={() => setSelectedOrder(order.id)}
                      >
                        {order.order_number}
                      </button>
                    </td>
                    <td>{order.customer?.full_name || "Walk-in / guest"}</td>
                    <td>
                      {order.order_source === "pos" ? "Counter" : "Mobile"}
                    </td>
                    <td>
                      <Badge
                        tone={
                          order.status === "cancelled"
                            ? "danger"
                            : order.status === "completed"
                              ? "success"
                              : "brand"
                        }
                      >
                        {order.status}
                      </Badge>
                    </td>
                    <td className="number">{peso(order.total)}</td>
                  </tr>
                ))}
                {!orders.length && (
                  <tr>
                    <td colSpan={5} className="ops-muted">
                      No orders to display yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </PaginatedTable>
          </div>
        </section>
        <section className="ops-panel">
          <div className="ops-panel-header">
            <div>
              <h2>Stock to reorder</h2>
              <p>Prepared suggestions, reviewed by you</p>
            </div>
            <Link href="/purchasing">
              Purchasing
              <Icon name="arrow" size={14} />
            </Link>
          </div>
          <Link className="ops-action-row" href="/purchasing?filter=draft">
            <span className="ops-action-icon">
              <Icon name="purchase" />
            </span>
            <div>
              <strong>Purchase drafts</strong>
              <p>Review before approving supplier orders</p>
            </div>
            <b>{ops.error ? "—" : drafts.length}</b>
          </Link>
          <Link className="ops-action-row" href="/purchasing?filter=incoming">
            <span className="ops-action-icon">
              <Icon name="stock" />
            </span>
            <div>
              <strong>Incoming deliveries</strong>
              <p>Receive actual quantities and batches</p>
            </div>
            <b>{ops.error ? "—" : incoming.length}</b>
          </Link>
          <div className="ops-action-row">
            <Icon name="refresh" size={15} />
            <p>
              {forecastUpdated
                ? `Forecast refreshed ${forecastUpdated}`
                : "Refresh forecasts after recording sales history."}
            </p>
          </div>
        </section>
      </div>
      {selectedOrder && (
        <OrderDetailsModal
          orderId={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
}
