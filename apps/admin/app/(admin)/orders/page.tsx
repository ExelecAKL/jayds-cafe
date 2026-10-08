// apps/admin/app/(admin)/orders/page.tsx
// Full orders table with status filter, date filter, search

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import { OrderDetailsModal } from "../../../components/OrderDetailsModal";
import type { Order, OrderStatus } from "@cafeos/shared/types";
import { Badge, Feedback, PageHeader } from "../../../components/Operations";
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
const statusColors: Record<OrderStatus, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  confirmed: "bg-blue-50 text-blue-700",
  preparing: "bg-purple-50 text-purple-700",
  ready: "bg-green-50 text-green-700",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-50 text-red-700",
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
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");

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
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Order #..."
          className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all w-48"
        />

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as OrderStatus | "all")
          }
          className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
        >
          <option value="all">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        {/* Payment Filter */}
        <select
          value={paymentFilter}
          onChange={(e) =>
            setPaymentFilter(e.target.value as typeof paymentFilter)
          }
          className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
        >
          <option value="all">All Payments</option>
          <option value="cash">Cash Only</option>
          <option value="maya">Maya Only</option>
        </select>

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
        >
          <option value="all">All Types</option>
          <option value="dine_in">Dine In</option>
          <option value="takeout">Takeout</option>
          <option value="pickup">Pickup</option>
          <option value="delivery">Delivery</option>
        </select>

        {/* Date Filter */}
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
        />

        <label className="ops-check">
          <input
            type="checkbox"
            checked={stockOnly}
            onChange={(event) => setStockOnly(event.target.checked)}
          />
          Stock needs attention
        </label>
        {(statusFilter !== "all" ||
          paymentFilter !== "all" ||
          typeFilter !== "all" ||
          dateFilter ||
          searchQuery ||
          stockOnly) && (
          <button
            onClick={() => {
              setStatusFilter("all");
              setPaymentFilter("all");
              setTypeFilter("all");
              setDateFilter("");
              setSearchQuery("");
              setStockOnly(false);
            }}
            className="text-amber-600 text-sm font-medium hover:text-amber-700 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 mx-auto border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Order #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedOrderId(order.id);
                        }}
                      >
                        {order.order_number}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {order.customer?.full_name || "Walk-in"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {order.items?.length || 0} items
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="font-medium capitalize">
                        {order.order_type.replace("_", " ")}
                      </div>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          order.order_source === "pos"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {order.order_source === "pos" ? "POS" : "App"}
                      </span>
                      {order.is_parked && <Badge>Parked</Badge>}
                      {order.stock_conflict && (
                        <Badge tone="danger">Stock needs attention</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[order.status]}`}
                      >
                        {order.status.charAt(0).toUpperCase() +
                          order.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          order.payment_status === "paid"
                            ? "bg-green-50 text-green-700"
                            : "bg-yellow-50 text-yellow-700"
                        }`}
                      >
                        {order.payment_method === "maya" ? "💳 " : "💵 "}
                        {order.payment_status.charAt(0).toUpperCase() +
                          order.payment_status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      ₱{order.total.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
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

            {orders.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                No orders found.
              </div>
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
