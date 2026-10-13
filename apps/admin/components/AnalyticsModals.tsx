import { useState, useEffect } from "react";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHeatmapData() {
      setLoading(true);
      const { data } = await supabase
        .from("orders")
        .select(
          `id, order_number, total, created_at, customer:profiles!orders_customer_id_fkey(full_name)`,
        )
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .eq("payment_status", "paid");

      const filtered = (data || []).filter((o) => {
        const d = new Date(o.created_at);
        return d.getDay() === dayIdx && d.getHours() === hour + 14;
      });

      setOrders(filtered as unknown as TrafficOrder[]);
      setLoading(false);
    }
    void fetchHeatmapData();
  }, [dayIdx, hour, startDate, endDate]);

  const totalRev = orders.reduce((s, o) => s + Number(o.total), 0);

  return (
    <AdminDialog
      title="Traffic Breakdown"
      onClose={onClose}
      className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col"
    >
      <div className="px-6 py-4 border-b border-gray-100 flex justify-between bg-amber-50">
        <div>
          <h3 className="font-bold text-gray-900">Traffic Breakdown</h3>
          <p className="text-sm text-gray-600">
            {dayName} at {hour + 14}:00 – {hour + 15}:00
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
        ) : (
          <>
            <div className="flex gap-4 mb-6">
              <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                  Orders Propelled
                </p>
                <p className="text-2xl font-black text-gray-900">
                  {orders.length}
                </p>
              </div>
              <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                  Revenue Captured
                </p>
                <p className="text-2xl font-black text-amber-600">
                  ₱{totalRev.toFixed(0)}
                </p>
              </div>
            </div>

            <h4 className="font-bold text-gray-900 mb-3 text-sm">
              Targeted Transactions
            </h4>
            {orders.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                No transactions captured during this block.
              </p>
            ) : (
              <div className="space-y-2">
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
                        {new Date(o.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="font-bold text-gray-900">
                      ₱{Number(o.total).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
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
  startDate,
  endDate,
  onClose,
}: {
  itemName: string;
  startDate: Date;
  endDate: Date;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [salesByHour, setSalesByHour] = useState<
    { hour: string; qty: number }[]
  >([]);
  const [addons, setAddons] = useState<{ name: string; qty: number }[]>([]);
  const [totalSold, setTotalSold] = useState(0);
  const [totalRev, setTotalRev] = useState(0);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, created_at")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .eq("payment_status", "paid");

      const orderIds = (ordersData || []).map((o) => o.id);

      if (orderIds.length > 0) {
        // Fetch all order items matching this name
        const { data: itemData } = await supabase
          .from("order_items")
          .select("id, order_id, quantity, subtotal")
          .eq("name", itemName)
          .in("order_id", orderIds);

        if (itemData) {
          let totalQ = 0;
          let totalR = 0;
          const hourBins: Record<number, number> = {};

          itemData.forEach((item) => {
            totalQ += item.quantity;
            totalR += Number(item.subtotal);

            // Find matching order to check time
            const o = ordersData?.find((ord) => ord.id === item.order_id);
            if (o) {
              const h = new Date(o.created_at).getHours();
              hourBins[h] = (hourBins[h] || 0) + item.quantity;
            }
          });

          setTotalSold(totalQ);
          setTotalRev(totalR);

          const hourlyArray = Object.keys(hourBins)
            .map((h) => ({ hour: `${h}:00`, qty: hourBins[Number(h)] }))
            .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
          setSalesByHour(hourlyArray);

          // Fetch addons for these specific order items
          const itemIds = itemData.map((i) => i.id);
          const { data: addonData } = await supabase
            .from("order_item_addons")
            .select("quantity, addon:addons(name)")
            .in("order_item_id", itemIds);

          const addonBins: Record<string, number> = {};
          addonData?.forEach((a) => {
            const relation = a.addon as unknown as { name: string } | null;
            const name = relation?.name || "Unknown";
            addonBins[name] = (addonBins[name] || 0) + a.quantity;
          });

          setAddons(
            Object.keys(addonBins)
              .map((name) => ({ name, qty: addonBins[name] }))
              .sort((a, b) => b.qty - a.qty),
          );
        }
      }
      setLoading(false);
    }
    void fetchData();
  }, [itemName, startDate, endDate]);

  return (
    <AdminDialog
      title={`Demographics: ${itemName}`}
      onClose={onClose}
      className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col"
    >
      <div className="px-6 py-4 border-b border-gray-100 flex justify-between bg-gray-50">
        <div>
          <h3 className="font-bold text-gray-900 border-l-4 border-amber-500 pl-3">
            Demographics: {itemName}
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
        ) : (
          <>
            <div className="flex gap-4 mb-6">
              <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                  Volume Sold
                </p>
                <p className="text-2xl font-black text-gray-900">{totalSold}</p>
              </div>
              <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                  Revenue Driven
                </p>
                <p className="text-2xl font-black text-amber-600">
                  ₱{totalRev.toFixed(0)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="font-bold text-gray-900 text-sm mb-3">
                  Popular Purchasing Hours
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
                    <Bar dataKey="qty" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 text-sm mb-3">
                  Frequently Paired Add-ons
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
        const { data: itemData, error: itemError } = await supabase
          .from("menu_items")
          .select("name, price")
          .eq("id", menuItemId)
          .single();

        const { data: recipeData, error: recipeError } = await supabase
          .from("menu_item_ingredients")
          .select(
            "quantity_used, ingredient:ingredients(name, cost_per_unit, unit)",
          )
          .eq("menu_item_id", menuItemId);

        if (itemError || recipeError || !itemData)
          throw new Error("Financial breakdown could not load. Please retry.");
        if (active) {
          setItem(itemData);
          setRecipe((recipeData ?? []) as unknown as RecipeRow[]);
        }
      } catch {
        if (active)
          setError("Financial breakdown could not load. Please retry.");
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
    { name: "Cost of Goods", value: rawCost, color: "#ef4444" }, // Red-500
    { name: "Gross Profit", value: Math.max(0, profit), color: "#10b981" }, // Green-500
  ];

  return (
    <AdminDialog
      title="Financial Breakdown"
      onClose={onClose}
      className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col"
    >
      <div className="px-6 py-4 border-b border-gray-100 flex justify-between bg-gray-50">
        <div>
          <h3 className="font-bold text-gray-900">Financial Breakdown</h3>
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
            <div className="flex items-center gap-6 mb-6">
              <div className="w-40 h-40 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
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
                    Cost of Goods
                  </p>
                  <p className="text-lg font-bold text-gray-700">
                    ₱{rawCost.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-0.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>{" "}
                    Gross Profit
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
              COGS Composition (Ingredients Used)
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
