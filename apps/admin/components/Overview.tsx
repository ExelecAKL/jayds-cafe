"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@cafeos/shared/supabase/client";
import { useOrders } from "@cafeos/shared/hooks/useOrders";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import {
  Badge,
  Icon,
  LoadingRows,
  peso,
  quantity,
  useOperations,
  type IconName,
} from "./Operations";
import { OrderDetailsModal } from "./OrderDetailsModal";
import { PaginatedTable } from "./PaginatedTable";
import { SalesChart } from "./dashboard/SalesChart";

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
  const [days, setDays] = useState(7);
  const [sales, setSales] = useState<Sales | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const request = useRef(0);
  const mounted = useRef(false);
  const {
    orders,
    loading: ordersLoading,
    error: ordersError,
    refetch,
  } = useOrders({
    limit: 6,
    includeCustomer: true,
    includeStatusHistory: false,
    itemMode: "none",
  });
  const fetchSales = useCallback(async () => {
    const version = ++request.current;
    setBusy(true);
    try {
      const { data, error: failure } = await withRequestDeadline((signal) =>
        supabase.rpc("inv_dashboard", { p_days: days }).abortSignal(signal),
      );
      if (!mounted.current || version !== request.current) return;
      if (failure || !data)
        throw new Error("Sales could not load. Refresh to try again.");
      setSales(data);
      setError("");
      setUpdated(
        new Date().toLocaleTimeString("en-PH", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "Asia/Manila",
        }),
      );
    } catch (failure) {
      if (mounted.current && version === request.current)
        setError(
          failure instanceof Error ? failure.message : "Sales could not load.",
        );
    } finally {
      if (mounted.current && version === request.current) setBusy(false);
    }
  }, [days]);
  useEffect(() => {
    mounted.current = true;
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
      mounted.current = false;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [fetchSales]);

  const stockReady = !ops.loading && !ops.error;
  const low = ops.stock.filter(
    (item) => Number(item.available_stock) <= Number(item.min_stock_alert),
  );
  const excess = ops.forecasts.filter(
    (f) =>
      f.horizon === 14 && Number(f.excess_quantity) > 0 && f.history_days >= 14,
  );
  const expiring = ops.stock.filter((item) => Number(item.expiring_stock) > 0);
  const drafts = ops.purchases.filter((po) => po.status === "draft");
  const incoming = ops.purchases.filter((po) =>
    ["approved", "ordered", "partial"].includes(po.status),
  );
  const actions: {
    title: string;
    detail: string;
    value: number | null;
    href: string;
    icon: IconName;
  }[] = [
    {
      title: "Orders blocked by stock",
      detail: "Resolve before preparation",
      value: sales?.stock_conflicts ?? null,
      href: "/orders?filter=stock_conflict",
      icon: "orders",
    },
    {
      title: "Low and unavailable stock",
      detail: "Review items to replenish",
      value: stockReady ? low.length : null,
      href: "/inventory?filter=low",
      icon: "stock",
    },
    {
      title: "Excess stock",
      detail: "Check forecast coverage",
      value: stockReady ? excess.length : null,
      href: "/inventory?tab=forecasts&filter=overstock",
      icon: "reports",
    },
    {
      title: "Expiry checks",
      detail: "Batches expiring within 14 days",
      value: stockReady ? expiring.length : null,
      href: "/inventory?filter=expiry",
      icon: "shield",
    },
  ];
  const attention = actions.reduce(
    (sum, action) => sum + (action.value ?? 0),
    0,
  );
  const metrics: {
    label: string;
    value: string | null;
    note: string;
    icon: IconName;
    href: string;
  }[] = [
    {
      label: "Orders received",
      value: sales ? quantity(sales.orders) : null,
      note: sales
        ? `${peso(sales.average)} avg. paid order`
        : "All ordering channels",
      icon: "orders",
      href: "/orders",
    },
    {
      label: "Active orders",
      value: sales ? quantity(sales.active) : null,
      note: "Across counter and mobile",
      icon: "coffee",
      href: "/orders",
    },
    {
      label: "Stock on hand value",
      value: stockReady
        ? peso(
            ops.stock.reduce((sum, item) => sum + Number(item.stock_value), 0),
          )
        : null,
      note: "Recorded receipt costs",
      icon: "stock",
      href: "/inventory",
    },
  ];
  const refresh = () => {
    void fetchSales();
    void ops.refresh();
    void refetch();
  };
  const exportReport = () => {
    if (!sales || error) return;
    const csv =
      "\uFEFFDate,Collected sales (PHP)\r\n" +
      sales.days
        .map((day) => `${day.date},${Number(day.revenue).toFixed(2)}`)
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `jayds-sales-${days}-days.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
  };

  return (
    <div className="dashboard">
      <header className="dashboard-heading">
        <div>
          <p className="dashboard-eyebrow">
            <span className="dashboard-wordmark">JAYDS</span> YOUR DAILY
            PERSPECTIVE
          </p>
          <h1>Café overview</h1>
          <p className="dashboard-subtitle">
            A little clarity for everything you’re brewing.
          </p>
        </div>
        <button
          className="ui-button primary"
          onClick={exportReport}
          disabled={!sales || Boolean(error) || busy}
        >
          <Icon name="reports" />
          Export report
          <Icon name="arrow" />
        </button>
      </header>

      <div className="dashboard-toolbar">
        <div
          className="dashboard-period"
          role="group"
          aria-label="Reporting period"
        >
          {[7, 30].map((period) => (
            <button
              type="button"
              key={period}
              aria-pressed={days === period}
              onClick={() => {
                if (period !== days) {
                  setSales(null);
                  setError("");
                  setExported(false);
                  setBusy(true);
                  setDays(period);
                }
              }}
            >
              Last {period} days
            </button>
          ))}
        </div>
        <div className="dashboard-freshness">
          <span>
            <Icon name="clock" size={15} />
            {updated ? `Updated ${updated} PHT` : "Connecting to your café"}
          </span>
          <button
            className="ui-button"
            disabled={busy}
            aria-label="Refresh dashboard"
            onClick={refresh}
          >
            <span className={busy ? "ui-spin" : ""}>
              <Icon name="refresh" size={16} />
            </span>
            <span>Refresh</span>
          </button>
        </div>
      </div>
      <p className="sr-only" role="status">
        {busy
          ? "Updating dashboard"
          : exported
            ? "Sales report downloaded"
            : error
              ? "Sales unavailable"
              : `Dashboard updated. Last ${days} days.`}
      </p>
      {(ops.error || error) && (
        <div className="dashboard-feedback" role="alert">
          <Icon name="alert" />
          <div>
            <strong>Some data is unavailable</strong>
            <p>
              {error || ops.error}
              {sales ? " Previously loaded figures are still shown." : ""}
            </p>
          </div>
          <button className="ui-button" disabled={busy} onClick={refresh}>
            Try again
          </button>
        </div>
      )}
      {ops.settings && !ops.settings.enforcement_enabled && (
        <div className="dashboard-feedback">
          <Icon name="shield" />
          <div>
            <strong>Finish your inventory setup</strong>
            <p>
              {ops.readiness?.ready
                ? "Your setup checks passed. Inventory is ready to activate."
                : "Review opening counts and product recipes."}
            </p>
          </div>
          <Link className="ui-button" href="/inventory?setup=1">
            Review setup
            <Icon name="arrow" size={15} />
          </Link>
        </div>
      )}

      <section className="dashboard-summary" aria-label="Business summary">
        <Link className="revenue-card" href="/analytics">
          <div className="revenue-card-top">
            <span>
              <Icon name="reports" />
              Sales collected
            </span>
            <Icon name="arrow" />
          </div>
          <div className="revenue-value">
            {sales ? (
              peso(sales.revenue)
            ) : (
              <span className={busy ? "ui-skeleton" : ""}>
                {busy ? "Loading" : "Unavailable"}
              </span>
            )}
          </div>
          <div className="revenue-card-bottom">
            <span>
              Last {days} days<span className="revenue-separator">·</span>Paid,
              active sales
            </span>
            <span className="revenue-mini-chart" aria-hidden="true">
              {(sales?.days.slice(-12) ?? []).map((day) => (
                <i
                  key={day.date}
                  style={{
                    height: `${Math.max(4, (Number(day.revenue) / Math.max(...(sales?.days.map((d) => Number(d.revenue)) ?? [1]), 1)) * 100)}%`,
                  }}
                />
              ))}
            </span>
          </div>
        </Link>
        <div className="supporting-metrics">
          {metrics.map((metric) => (
            <Link
              className="summary-metric"
              href={metric.href}
              key={metric.label}
            >
              <span className="summary-metric-icon">
                <Icon name={metric.icon} />
              </span>
              <span className="summary-metric-label">{metric.label}</span>
              <strong className="summary-metric-value">
                {metric.value ?? (
                  <span className={busy || ops.loading ? "ui-skeleton" : ""}>
                    {busy || ops.loading ? "Loading" : "Unavailable"}
                  </span>
                )}
              </strong>
              <span className="summary-metric-note">{metric.note}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="dashboard-main-grid">
        <section
          className="dashboard-panel sales-panel"
          aria-labelledby="sales-heading"
        >
          <SalesChart
            sales={sales}
            days={days}
            loading={busy}
            error={error}
            onRetry={refresh}
          />
        </section>
        <section
          className="dashboard-panel attention-panel"
          aria-labelledby="attention-heading"
        >
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-kicker">KEEP SERVICE MOVING</p>
              <h2 id="attention-heading">Needs your attention</h2>
            </div>
            <span
              className="attention-count"
              aria-label={
                stockReady && sales
                  ? `${attention} items to review`
                  : "Attention data unavailable"
              }
            >
              {stockReady && sales ? attention : "?"}
            </span>
          </div>
          <div className="attention-list">
            {actions.map((action) => (
              <Link
                className="attention-row"
                key={action.title}
                href={action.href}
              >
                <span className="dashboard-icon-tile">
                  <Icon name={action.icon} />
                </span>
                <span className="attention-copy">
                  <strong>{action.title}</strong>
                  <small>{action.detail}</small>
                </span>
                <b>{action.value === null ? "?" : action.value}</b>
                <Icon name="arrow" size={15} />
              </Link>
            ))}
          </div>
          <Link className="attention-footer" href="/inventory">
            Open stock workspace
            <Icon name="arrow" size={15} />
          </Link>
        </section>
      </div>

      <section className="dashboard-shortcuts" aria-label="Quick actions">
        <span>Make your next move</span>
        {(
          [
            { href: "/orders", icon: "orders", label: "View orders" },
            { href: "/menu", icon: "catalog", label: "Edit menu" },
            {
              href: "/inventory?tab=stocktakes",
              icon: "stock",
              label: "Count stock",
            },
            {
              href: "/purchasing",
              icon: "purchase",
              label: "Receive supplies",
            },
          ] as const
        ).map((action) => (
          <Link href={action.href} key={action.href}>
            <Icon name={action.icon} size={17} />
            {action.label}
            <Icon name="arrow" size={14} />
          </Link>
        ))}
      </section>

      <div className="dashboard-main-grid">
        <section
          className="dashboard-panel orders-panel"
          aria-labelledby="recent-heading"
        >
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-kicker">FROM COUNTER TO MOBILE</p>
              <h2 id="recent-heading">Recent orders</h2>
            </div>
            <Link className="dashboard-text-link" href="/orders">
              All orders
              <Icon name="arrow" size={15} />
            </Link>
          </div>
          {ordersLoading ? (
            <LoadingRows label="Loading recent orders" rows={4} />
          ) : ordersError ? (
            <div className="dashboard-empty">
              <Icon name="alert" />
              <h3>Orders could not load</h3>
              <button className="ui-button" onClick={() => void refetch()}>
                Retry orders
              </button>
            </div>
          ) : !orders.length ? (
            <div className="dashboard-empty">
              <Icon name="coffee" size={30} />
              <h3>Ready for your next order</h3>
              <p>New counter and mobile orders will appear here.</p>
              <Link className="ui-button" href="/orders">
                View orders
                <Icon name="arrow" size={15} />
              </Link>
            </div>
          ) : (
            <div
              className="dashboard-table-scroll"
              role="region"
              aria-label="Recent orders table"
              tabIndex={0}
            >
              <PaginatedTable
                className="dashboard-table"
                aria-label="Recent orders"
              >
                <thead>
                  <tr>
                    <th>Order / customer</th>
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
                          className="dashboard-order-link"
                          onClick={() => setSelectedOrder(order.id)}
                        >
                          {order.order_number}
                          <Icon name="arrow" size={13} />
                        </button>
                        <small>
                          {order.customer?.full_name || "Walk-in / guest"}
                        </small>
                      </td>
                      <td>
                        <span className="order-channel">
                          <Icon
                            name={
                              order.order_source === "pos" ? "coffee" : "orders"
                            }
                            size={14}
                          />
                          {order.order_source === "pos" ? "Counter" : "Mobile"}
                        </span>
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
                          {order.status.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td className="number">{peso(order.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </PaginatedTable>
            </div>
          )}
        </section>
        <section
          className="dashboard-panel purchasing-panel"
          aria-labelledby="purchase-heading"
        >
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-kicker">PLAN AHEAD</p>
              <h2 id="purchase-heading">Stock to reorder</h2>
            </div>
            <Icon name="purchase" />
          </div>
          <div className="purchase-summary">
            <strong>{stockReady ? drafts.length : "?"}</strong>
            <div>
              <h3>Purchase drafts</h3>
              <p>Ready for your review</p>
            </div>
          </div>
          <p className="purchase-description">
            Review quantities before approving supplier orders.
          </p>
          <Link className="ui-button" href="/purchasing?filter=draft">
            Review drafts
            <Icon name="arrow" size={16} />
          </Link>
          <Link className="incoming-link" href="/purchasing?filter=incoming">
            <Icon name="stock" />
            <span>Incoming deliveries</span>
            <b>{stockReady ? incoming.length : "?"}</b>
            <Icon name="arrow" size={15} />
          </Link>
        </section>
      </div>
      <footer className="dashboard-footer">
        <span>
          <Icon name="coffee" size={16} />A clear view. A well-run café.
        </span>
        <span>
          Jayds Café<span aria-hidden="true"> / </span>Back office
        </span>
      </footer>
      {selectedOrder && (
        <OrderDetailsModal
          orderId={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
}
