// apps/admin/app/(admin)/orders/page.tsx
// Full orders table with status filter, date filter, search

"use client";
import { AdminSelect } from "../../../components/AdminSelect";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import { OrderDetailsModal } from "../../../components/OrderDetailsModal";
import type { Order, OrderStatus } from "@cafeos/shared/types";
import {
  Badge,
  Empty,
  Feedback,
  PageHeader,
} from "../../../components/Operations";
import { TableSkeleton } from "../../../components/AdminSkeletons";
import {
  ColorLegend,
  StatusPill,
  orderStatusTone,
  paymentTone,
} from "../../../components/StatusSemantics";
import { ADMIN_PAGE_SIZE } from "../../../components/Pagination";
import { PaginatedTable } from "../../../components/PaginatedTable";

const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];
const ORDER_LIST_SELECT = `
  id,
  order_number,
  customer_id,
  status,
  order_type,
  order_source,
  payment_method,
  payment_status,
  subtotal,
  total,
  points_earned,
  notes,
  maya_checkout_id,
  maya_payment_id,
  staff_id,
  created_at,
  updated_at,
  stock_conflict,
  is_parked,
  items:order_items(id),
  customer:profiles!orders_customer_id_fkey(id, full_name, email)
`;
const statusLabels: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stockOnly, setStockOnly] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() =>
      setStockOnly(
        new URLSearchParams(window.location.search).get("filter") ===
          "stock_conflict",
      ),
    );
  }, []);

  // Filters
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "cash" | "maya">(
    "all",
  );
  const [typeFilter, setTypeFilter] = useState<
    "all" | "dine_in" | "takeout" | "pickup" | "delivery"
  >("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [loadedOnce, setLoadedOnce] = useState(false);
  // Query once typing pauses instead of on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Selection
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Server Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const latestRequest = useRef(0);

  // Helper to reset page whenever a filter changes
  useEffect(() => {
    void Promise.resolve().then(() => setCurrentPage(1));
  }, [
    statusFilter,
    paymentFilter,
    typeFilter,
    searchQuery,
    dateFilter,
    stockOnly,
  ]);

  const fetchOrders = useCallback(async () => {
    const request = ++latestRequest.current;
    setLoading(true);

    let query = supabase
      .from("orders")
      .select(ORDER_LIST_SELECT, { count: "exact" })
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (paymentFilter !== "all")
      query = query.eq("payment_method", paymentFilter);
    if (typeFilter !== "all") query = query.eq("order_type", typeFilter);
    if (stockOnly)
      query = query
        .eq("stock_conflict", true)
        .in("status", ["pending", "confirmed"]);

    if (searchQuery) {
      query = query.ilike("order_number", `%${searchQuery}%`);
    }

    if (dateFilter) {
      const start = new Date(`${dateFilter}T00:00:00+08:00`);
      const end = new Date(`${dateFilter}T23:59:59.999+08:00`);
      query = query
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
    }

    // Server offset
    query = query.range(
      (currentPage - 1) * ADMIN_PAGE_SIZE,
      currentPage * ADMIN_PAGE_SIZE - 1,
    );

    const { data, error, count } = await query;
    if (request !== latestRequest.current) return;

    if (error) {
      setError(error.message);
    } else {
      setError("");
      setOrders((data as unknown as Order[]) || []);
      if (count !== null) {
        setTotalItems(count);
        const lastPage = Math.max(1, Math.ceil(count / ADMIN_PAGE_SIZE));
        if (currentPage > lastPage) setCurrentPage(lastPage);
      }
    }
    setLoading(false);
    setLoadedOnce(true);
  }, [
    statusFilter,
    paymentFilter,
    typeFilter,
    searchQuery,
    dateFilter,
    currentPage,
    stockOnly,
  ]);

  useEffect(() => {
    void Promise.resolve().then(fetchOrders);

    const channel = supabase
      .channel("admin-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchOrders();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  const filtered = Boolean(
    statusFilter !== "all" ||
      paymentFilter !== "all" ||
      typeFilter !== "all" ||
      dateFilter ||
      searchInput.trim() ||
      stockOnly,
  );
  const clearFilters = () => {
    setStatusFilter("all");
    setPaymentFilter("all");
    setTypeFilter("all");
    setDateFilter("");
    setSearchInput("");
    setSearchQuery("");
    setStockOnly(false);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Orders"
        description="Counter and mobile orders, reservations, and preparation status."
      />
      <Feedback error={error} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search */}
        <input
          type="search"
          aria-label="Search order number"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search Order #..."
          className="px-4 py-2.5 rounded-xl border border-subtle bg-surface text-ink text-sm placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-warning-border transition-all w-48"
        />

        {/* Status Filter */}
        <AdminSelect
          aria-label="Order status"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as OrderStatus | "all")
          }
          className="px-4 py-2.5 rounded-xl border border-subtle bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-warning-border transition-all"
        >
          <option value="all">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </AdminSelect>

        {/* Payment Filter */}
        <AdminSelect
          aria-label="Payment method"
          value={paymentFilter}
          onChange={(e) =>
            setPaymentFilter(e.target.value as typeof paymentFilter)
          }
          className="px-4 py-2.5 rounded-xl border border-subtle bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-warning-border transition-all"
        >
          <option value="all">All Payments</option>
          <option value="cash">Cash Only</option>
          <option value="maya">Maya Only</option>
        </AdminSelect>

        {/* Type Filter */}
        <AdminSelect
          aria-label="Order type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="px-4 py-2.5 rounded-xl border border-subtle bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-warning-border transition-all"
        >
          <option value="all">All Types</option>
          <option value="dine_in">Dine In</option>
          <option value="takeout">Takeout</option>
          <option value="pickup">Pickup</option>
          <option value="delivery">Delivery</option>
        </AdminSelect>

        {/* Date Filter */}
        <input
          type="date"
          aria-label="Order date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-subtle bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-warning-border transition-all"
        />

        <label className="ops-check">
          <input
            type="checkbox"
            checked={stockOnly}
            onChange={(event) => setStockOnly(event.target.checked)}
          />
          Stock needs attention
        </label>
        {filtered && (
          <button
            onClick={clearFilters}
            className="text-warning text-sm font-medium hover:text-warning transition-colors"
          >
            Clear filters
          </button>
        )}
        {loading && loadedOnce && (
          <span className="ops-refresh-note" role="status">
            Updating…
          </span>
        )}
      </div>

      <ColorLegend
        items={[
          { tone: "warning", label: "Pending or unpaid" },
          { tone: "info", label: "Confirmed or preparing" },
          { tone: "success", label: "Ready or paid" },
          { tone: "neutral", label: "Completed or refunded" },
          { tone: "danger", label: "Cancelled, failed or blocked by stock" },
        ]}
      />

      {/* Orders Table */}
      <div className="bg-surface rounded-2xl shadow-sm border border-subtle overflow-hidden">
        {loading && !loadedOnce ? (
          <TableSkeleton
            label="Loading orders…"
            rows={8}
            columns={["title", "text", "text", "badge", "badge", "badge", "number", "text"]}
          />
        ) : (
          <div className="overflow-x-auto" data-refreshing={loading}>
            <PaginatedTable
              aria-label="Orders"
              pagination={{
                currentPage,
                totalItems,
                onPageChange: setCurrentPage,
                loading: loading,
              }}
              className="w-full"
            >
              <thead>
                <tr className="border-b border-subtle bg-raised">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    Order #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className="hover:bg-raised transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-ink">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedOrderId(order.id);
                        }}
                      >
                        {order.order_number}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {order.customer?.full_name || "Walk-in"}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {order.items?.length || 0} items
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      <div className="font-medium capitalize">
                        {order.order_type.replace("_", " ")}
                      </div>
                      <span className="ops-source-label">
                        {order.order_source === "pos" ? "Counter" : "App"}
                      </span>
                      {order.is_parked && <Badge>Parked</Badge>}
                      {order.stock_conflict && (
                        <Badge tone="danger">Stock needs attention</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill tone={orderStatusTone(order.status)}>
                        {statusLabels[order.status] ?? order.status}
                      </StatusPill>
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill tone={paymentTone(order.payment_status)}>
                        {order.payment_method === "maya" ? "Maya · " : "Cash · "}
                        {order.payment_status.charAt(0).toUpperCase() +
                          order.payment_status.slice(1)}
                      </StatusPill>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-ink">
                      ₱{order.total.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {new Date(order.created_at).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PaginatedTable>

            {orders.length === 0 && !loading && (
              <Empty
                icon="orders"
                title={filtered ? "No orders match these filters" : "No orders yet"}
                description={
                  filtered
                    ? "Try a different order number, date or status, or clear the filters to see every order."
                    : "Counter and app orders will appear here as soon as they are placed."
                }
              >
                {filtered && (
                  <button className="ops-button" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </Empty>
            )}
          </div>
        )}
      </div>

      {/* Render the details modal if an order is selected */}
      {selectedOrderId && (
        <OrderDetailsModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}
    </div>
  );
}
