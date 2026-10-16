import { useState, useEffect } from "react";
import { Feedback } from "./Operations";
import { Pagination, ADMIN_PAGE_SIZE } from "./Pagination";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import { AdminDialog } from "./AdminDialog";
import { supabase } from "@cafeos/shared/supabase/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type TrafficOrder = {
  id: string;
  order_number: string;
  total: number;
  created_at: string;
  customer: { full_name: string } | null;
};
type MarginItem = { name: string; price: number };
type RecipeRow = {
  quantity_used: number;
  ingredient: { name: string; cost_per_unit: number; unit: string } | null;
};
// ----- HEATMAP MODAL -----
export function HeatmapModal({
  dayIdx,
  hour,
  dayName,
  startDate,
  endDate,
  onClose,
}: {
  dayIdx: number;
  hour: number;
  dayName: string;
  startDate: Date;
  endDate: Date;
  onClose: () => void;
}) {
  const [orders, setOrders] = useState<TrafficOrder[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [totalRev, setTotalRev] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void withRequestDeadline((signal) =>
        supabase
          .rpc("admin_sales_orders", {
            p_start: startDate.toISOString(),
            p_end: endDate.toISOString(),
            p_weekday: dayIdx,
            p_hour: hour + 13,
            p_page: page - 1,
          })
          .abortSignal(signal),
      )
        .then(({ data, error }) => {
          if (!active) return;
          if (error || !data)
            throw new Error("Order details could not load. Try again.");
          setOrders(data.orders);
          setTotal(Number(data.total));
          setTotalRev(Number(data.revenue));
          setLoading(false);
        })
        .catch(() => {
          if (active) {
            setError("Order details could not load. Try again.");
            setLoading(false);
          }
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [dayIdx, hour, startDate, endDate, page, attempt]);

  return (
    <AdminDialog
      title="Orders by hour"
      onClose={onClose}
      className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col"
    >
      <div className="px-6 py-4 border-b border-gray-100 flex justify-between bg-amber-50">
        <div>
          <h3 className="font-bold text-gray-900">Orders by hour</h3>
          <p className="text-sm text-gray-600">
            {dayName} at {hour + 13}:00 – {hour + 14}:00
          </p>
        </div>
        <button
          aria-label="Close dialog"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      <div className="p-6 overflow-y-auto max-h-[70vh]">
        {loading ? (
          <div className="py-10 text-center">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-amber-200 rounded-full animate-spin mx-auto" />
          </div>
        ) : error ? (
          <div>
            <Feedback error={error} />
            <button
              className="ops-button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-4 mb-6">
              <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                  Paid orders
                </p>
                <p className="text-2xl font-black text-gray-900">{total}</p>
              </div>
              <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                  Collected total
                </p>
                <p className="text-2xl font-black text-amber-600">
                  ₱{totalRev.toFixed(0)}
                </p>
              </div>
            </div>

            <h4 className="font-bold text-gray-900 mb-3 text-sm">Orders</h4>
            {orders.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                No transactions captured during this block.
              </p>
            ) : (
              <div className="space-y-2" id="traffic-orders">
                {orders.map((o) => (
                  <div
                    key={o.id}
                    className="flex justify-between items-center p-3 rounded-lg border border-gray-100 bg-white shadow-sm"
                  >
                    <div>
                      <p className="font-bold text-gray-900 text-sm">
                        {o.order_number}
                      </p>
                      <p className="text-xs text-gray-500">
                        {o.customer?.full_name || "Walk-in"} •{" "}
                        {new Date(o.created_at).toLocaleDateString("en-PH", {
                          timeZone: "Asia/Manila",
                        })}
                      </p>
                    </div>
                    <p className="font-bold text-gray-900">
                      ₱{Number(o.total).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {total > ADMIN_PAGE_SIZE && (
              <Pagination
                currentPage={page}
                totalPages={Math.ceil(total / ADMIN_PAGE_SIZE)}
                totalItems={total}
                pageSize={ADMIN_PAGE_SIZE}
                onPageChange={setPage}
                controlsId="traffic-orders"
                label="Hour orders pagination"
              />
            )}
          </>
        )}
      </div>
    </AdminDialog>
  );
}

// ----- BEST SELLER MODAL -----
export function BestSellerModal({
  itemName,
  itemKey,
  startDate,
  endDate,
  onClose,
}: {
  itemName: string;
  itemKey: string;
  startDate: Date;
  endDate: Date;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [salesByHour, setSalesByHour] = useState<
    { hour: string; qty: number }[]
  >([]);
  const [addons, setAddons] = useState<{ name: string; qty: number }[]>([]);
  const [totalSold, setTotalSold] = useState(0);
  const [totalRev, setTotalRev] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void withRequestDeadline((signal) =>
        supabase
          .rpc("admin_sales_item", {
            p_start: startDate.toISOString(),
            p_end: endDate.toISOString(),
            p_item_key: itemKey,
          })
          .abortSignal(signal),
      )
        .then(({ data, error }) => {
          if (!active) return;
          if (error || !data)
            throw new Error("Product sales could not load. Try again.");
          setTotalSold(Number(data.total_sold));
          setTotalRev(Number(data.revenue));
          setSalesByHour(data.hourly);
          setAddons(data.addons);
          setLoading(false);
        })
        .catch(() => {
          if (active) {
            setError("Product sales could not load. Try again.");
            setLoading(false);
          }
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [itemKey, startDate, endDate, attempt]);

  return (
    <AdminDialog
      title={`Product sales: ${itemName}`}
      onClose={onClose}
      className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col"
    >
      <div className="px-6 py-4 border-b border-gray-100 flex justify-between bg-gray-50">
        <div>
          <h3 className="font-bold text-gray-900 border-l-4 border-amber-500 pl-3">
            Product sales: {itemName}
          </h3>
        </div>
        <button
          aria-label="Close dialog"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      <div className="p-6 overflow-y-auto max-h-[70vh]">
        {loading ? (
          <div className="py-10 text-center">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-amber-200 rounded-full animate-spin mx-auto" />
          </div>
        ) : error ? (
          <div>
            <Feedback error={error} />
            <button
              className="ops-button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-4 mb-6">
              <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                  Units sold
                </p>
                <p className="text-2xl font-black text-gray-900">{totalSold}</p>
              </div>
              <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                  Item sales
                </p>
                <p className="text-2xl font-black text-amber-600">
                  ₱{totalRev.toFixed(0)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h4 className="font-bold text-gray-900 text-sm mb-3">
                  Units by order time
                </h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={salesByHour}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#f0f0f0"
                    />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip formatter={(value) => [value, "Purchased"]} />
                    <Bar
                      isAnimationActive={false}
                      dataKey="qty"
                      fill="#f59e0b"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 text-sm mb-3">
                  Paid extras
                </h4>
                {addons.length === 0 ? (
                  <p className="text-sm text-gray-400 italic bg-gray-50 p-4 rounded-xl text-center">
                    No add-ons typically ordered with this item.
                  </p>
                ) : (
                  <div className="space-y-2 border border-gray-100 rounded-xl p-3 bg-gray-50">
                    {addons.map((a, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center text-sm"
                      >
                        <span className="text-gray-700">{a.name}</span>
                        <span className="font-bold text-gray-900 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-100">
                          {a.qty}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <details className="ops-disclosure mt-5">
              <summary>View hourly numbers</summary>
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Hour (Philippine time)</th>
                    <th className="number">Units sold</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByHour.map((row) => (
                    <tr key={row.hour}>
                      <td>{row.hour}</td>
                      <td className="number">{row.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <p className="ops-muted text-xs mt-3">
              Item subtotals before order discounts and delivery.
            </p>
          </>
        )}
      </div>
    </AdminDialog>
  );
}

// ----- MARGIN MODAL -----
export function MarginModal({
  menuItemId,
  onClose,
}: {
  menuItemId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<MarginItem | null>(null);
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function fetchMarginDeep() {
      setLoading(true);
      setError("");
      try {
        const [product, requirements] = await withRequestDeadline((signal) =>
          Promise.all([
            supabase
              .from("menu_items")
              .select("name, price")
              .eq("id", menuItemId)
              .abortSignal(signal)
              .single(),
            supabase
              .from("menu_item_ingredients")
              .select(
                "quantity_used, ingredient:ingredients(name, cost_per_unit, unit)",
              )
              .eq("menu_item_id", menuItemId)
              .abortSignal(signal),
          ]),
        );
        const { data: itemData, error: itemError } = product,
          { data: recipeData, error: recipeError } = requirements;

        if (itemError || recipeError || !itemData)
          throw new Error("Recipe costs could not load. Please retry.");
        if (active) {
          setItem(itemData);
          setRecipe((recipeData ?? []) as unknown as RecipeRow[]);
        }
      } catch {
        if (active) setError("Recipe costs could not load. Please retry.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void Promise.resolve().then(() => {
      if (active) return fetchMarginDeep();
    });
    return () => {
      active = false;
    };
  }, [menuItemId, attempt]);

  const rawCost = recipe.reduce(
    (s, r) => s + r.quantity_used * (r.ingredient?.cost_per_unit || 0),
    0,
  );
  const profit = Number(item?.price ?? 0) - rawCost;
  const marginPct =
    Number(item?.price ?? 0) > 0
      ? (profit / Number(item?.price ?? 0)) * 100
      : 0;

  const pieData = [
    { name: "Recipe cost", value: rawCost, color: "#ef4444" }, // Red-500
    { name: "Price remainder", value: Math.max(0, profit), color: "#10b981" }, // Green-500
  ];

  return (
    <AdminDialog
      title="Recipe cost estimate"
      onClose={onClose}
      className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col"
    >
      <div className="px-6 py-4 border-b border-gray-100 flex justify-between bg-gray-50">
        <div>
          <h3 className="font-bold text-gray-900">Recipe cost estimate</h3>
          <p className="text-sm text-gray-500">{item?.name}</p>
        </div>
        <button
          aria-label="Close dialog"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      <div className="p-6 overflow-y-auto max-h-[70vh]">
        {loading ? (
          <p role="status">Loading breakdown…</p>
        ) : error ? (
          <div className="space-y-4">
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
            <button
              className="ops-button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row items-center gap-6 mb-6">
              <div className="w-40 h-40 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `₱${Number(v).toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-0.5">
                    Selling Price
                  </p>
                  <p className="text-2xl font-black text-gray-900">
                    ₱{Number(item?.price ?? 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-0.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>{" "}
                    Recipe cost
                  </p>
                  <p className="text-lg font-bold text-gray-700">
                    ₱{rawCost.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-0.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>{" "}
                    Price remainder
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${marginPct >= 60 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                    >
                      {marginPct.toFixed(1)}% Margin
                    </span>
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    ₱{profit.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <h4 className="font-bold text-gray-900 text-sm mb-3">
              Estimated ingredient costs
            </h4>
            <div className="space-y-2 border border-gray-100 rounded-xl bg-gray-50 p-2">
              {recipe.map((r, i) => {
                const ing = r.ingredient;
                const sub = r.quantity_used * (ing?.cost_per_unit || 0);
                return (
                  <div
                    key={i}
                    className="flex justify-between items-center text-sm p-1.5 hover:bg-white rounded border border-transparent hover:border-gray-100 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 w-12 text-right font-mono text-xs">
                        {r.quantity_used}
                        {ing?.unit}
                      </span>
                      <span className="font-medium text-gray-700">
                        {ing?.name || "Unknown"}
                      </span>
                    </div>
                    <span className="font-mono text-gray-600">
                      ₱{sub.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AdminDialog>
  );
}
