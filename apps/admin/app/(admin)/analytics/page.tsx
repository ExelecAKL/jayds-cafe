// apps/admin/app/(admin)/analytics/page.tsx
// Sales & Analytics Dashboard — revenue, best sellers, peak hours, margins

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { exportAsCsv, exportAsPng } from "../../../utils/exportMetrics";
import {
  HeatmapModal,
  BestSellerModal,
  MarginModal,
} from "../../../components/AnalyticsModals";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import { PageHeader, Feedback, Icon } from "../../../components/Operations";
import Link from "next/link";
import { PaginatedTable } from "../../../components/PaginatedTable";

type Period = "today" | "week" | "month" | "year";

interface RevenuePoint {
  label: string;
  revenue: number;
  orders: number;
}
interface BestSeller {
  item_key: string;
  name: string;
  qty: number;
  revenue: number;
}
interface MarginRow {
  id: string;
  name: string;
  price: number;
  cost: number;
  profit: number;
  margin: number;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedPeriod, setLoadedPeriod] = useState<Period | null>(null);
  const requestVersion = useRef(0);
  const [revenue, setRevenue] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [prevRevenue, setPrevRevenue] = useState(0);
  const [chartData, setChartData] = useState<RevenuePoint[]>([]);
  const [bestSellers, setBestSellers] = useState<BestSeller[]>([]);
  const [heatmap, setHeatmap] = useState<number[][]>([]);
  const [margins, setMargins] = useState<MarginRow[]>([]);

  // Modal State
  const [selectedHeatmap, setSelectedHeatmap] = useState<{
    dayIdx: number;
    hour: number;
    dayName: string;
  } | null>(null);
  const [selectedBestSeller, setSelectedBestSeller] =
    useState<BestSeller | null>(null);
  const [selectedMarginItem, setSelectedMarginItem] = useState<string | null>(
    null,
  );

  // Date tracking for modals
  const [activeDateRange, setActiveDateRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);

  const fetchAnalytics = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const { data, error } = await withRequestDeadline((signal) =>
        supabase
          .rpc("admin_sales_report", { p_period: period })
          .abortSignal(signal),
      );
      if (requestVersion.current !== version) return;
      if (error || !data)
        throw new Error("Sales reports could not load. Please try again.");
      setRevenue(Number(data.revenue));
      setOrderCount(Number(data.orders));
      setPrevRevenue(Number(data.previous_revenue));
      setChartData(data.chart);
      setBestSellers(data.best_sellers);
      setHeatmap(data.heatmap);
      setMargins(data.margins);
      setActiveDateRange({
        start: new Date(data.start),
        end: new Date(data.end),
      });
      setLoadedPeriod(period);
    } catch (failure) {
      if (requestVersion.current === version)
        setError(
          failure instanceof Error
            ? failure.message
            : "Sales reports could not load.",
        );
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void Promise.resolve().then(fetchAnalytics);
  }, [fetchAnalytics]);

  const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0;
  const revenueChange =
    prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;

  // Find busiest hour
  const busiestInfo = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let maxVal = 0;
    let maxDay = 0;
    let maxHour = 0;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 9; h++) {
        if (heatmap[d]?.[h] > maxVal) {
          maxVal = heatmap[d][h];
          maxDay = d;
          maxHour = h;
        }
      }
    }
    return maxVal > 0
      ? `${days[maxDay]} ${maxHour + 13}:00–${maxHour + 14}:00`
      : "No data";
  }, [heatmap]);

  const maxHeat = useMemo(() => Math.max(1, ...heatmap.flat()), [heatmap]);

  // Exports Handlers
  const handleExportMarginsCSV = () => {
    const payload = margins.map((m) => ({
      Item: m.name,
      Price: m.price.toFixed(2),
      Cost: m.cost.toFixed(2),
      PriceLessRecipeCost: m.profit.toFixed(2),
      MarginPercent: m.margin.toFixed(1),
    }));
    exportAsCsv(payload, `Item_Margins_${period}`);
  };

  const header = (
    <PageHeader
      eyebrow="REPORTS"
      title="Sales reports"
      description="Paid orders by date received · Philippine time"
    >
      <div className="ops-segmented" aria-label="Reporting period">
        {(["today", "week", "month", "year"] as Period[]).map((value) => (
          <button
            key={value}
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {value === "today"
              ? "Today"
              : value === "week"
                ? "This week"
                : value === "month"
                  ? "This month"
                  : "This year"}
          </button>
        ))}
      </div>
      <button
        className="ops-button"
        disabled={loading}
        onClick={() => void fetchAnalytics()}
      >
        <Icon name="refresh" />
        Refresh
      </button>
    </PageHeader>
  );
  if (loadedPeriod !== period)
    return (
      <div>
        {header}
        <Feedback error={error} />
        <section className="ops-panel">
          <div className="ops-empty" role={loading ? "status" : undefined}>
            {loading ? (
              <>
                <div
                  className="ops-detail-skeleton"
                  style={{ width: "100%", maxWidth: 500 }}
                >
                  <i />
                  <i />
                  <i />
                </div>
                <p>Loading sales…</p>
              </>
            ) : (
              <button
                className="ops-button"
                onClick={() => void fetchAnalytics()}
              >
                Try again
              </button>
            )}
          </div>
        </section>
      </div>
    );
  return (
    <div>
      {header}
      <Feedback error={error} />
      {loading && (
        <p role="status" className="ops-muted text-sm mb-3">
          Refreshing sales…
        </p>
      )}
      {/* Revenue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Sales collected</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ₱{revenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </p>
          {prevRevenue > 0 && (
            <p
              className={`text-xs mt-1 font-medium ${revenueChange >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {revenueChange >= 0 ? "▲" : "▼"}{" "}
              {Math.abs(revenueChange).toFixed(1)}% vs prev
            </p>
          )}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Paid orders</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{orderCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Avg Order Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ₱{avgOrderValue.toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Busiest Time</p>
          <p className="text-lg font-bold text-amber-600 mt-1">{busiestInfo}</p>
        </div>
      </div>

      {/* Revenue Chart */}
      <div
        id="revenue-chart"
        className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8 relative"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-900">Sales over time</h2>
          <button
            onClick={() =>
              exportAsPng("revenue-chart", `Revenue_Chart_${period}`)
            }
            className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
          >
            ↓ PNG
          </button>
        </div>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            No revenue data for this period
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₱${v}`} />
              <Tooltip
                formatter={(value) => [
                  `₱${Number(value ?? 0).toFixed(2)}`,
                  "Revenue",
                ]}
              />
              <Line
                isAnimationActive={false}
                type="monotone"
                dataKey="revenue"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <details className="ops-disclosure mb-8">
        <summary>View sales table</summary>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Period</th>
                <th className="number">Paid orders</th>
                <th className="number">Sales collected (PHP)</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className="number">{row.orders}</td>
                  <td className="number">{row.revenue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {/* Best Sellers */}
      <div
        id="best-sellers-chart"
        className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8"
      >
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 relative">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-900">Top 10 Best Sellers</h2>
            <button
              onClick={() =>
                exportAsPng("best-sellers-chart", `Best_Sellers_${period}`)
              }
              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
            >
              ↓ PNG
            </button>
          </div>
          {bestSellers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              No sales data
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={bestSellers}
                layout="vertical"
                onClick={(data) => {
                  if (data?.activeLabel)
                    setSelectedBestSeller(
                      bestSellers.find(
                        (item) => item.name === data.activeLabel,
                      ) ?? null,
                    );
                }}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={120}
                />
                {/* @ts-expect-error recharts Formatter type is overly strict */}
                <Tooltip formatter={(value: number) => [value, "Sold"]} />
                <Bar
                  isAnimationActive={false}
                  dataKey="qty"
                  fill="#f59e0b"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Best Sellers Table */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">Sales Breakdown</h2>
          <div className="overflow-x-auto">
            <PaginatedTable
              aria-label="Best sellers"
              resetKey={period}
              className="w-full text-sm"
            >
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    #
                  </th>
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Item
                  </th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Sold
                  </th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Item sales
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bestSellers.map((item, i) => (
                  <tr
                    key={item.item_key}
                    onClick={() => setSelectedBestSeller(item)}
                    className="hover:bg-amber-50 cursor-pointer transition-colors"
                  >
                    <td className="py-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 font-medium text-gray-900">
                      <button
                        className="text-left underline-offset-4 hover:underline"
                        onClick={() => setSelectedBestSeller(item)}
                      >
                        {item.name}
                      </button>
                    </td>
                    <td className="py-2 text-right text-gray-600">
                      {item.qty}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      ₱{item.revenue.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PaginatedTable>
          </div>
        </div>
      </div>

      {/* Peak Hours Heatmap */}
      <div
        id="heatmap-chart"
        className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8 relative"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-900">
            Peak hours · 1 PM–10 PM
          </h2>
          <button
            onClick={() => exportAsPng("heatmap-chart", `Heatmap_${period}`)}
            className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
          >
            ↓ PNG
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[500px]">
            <div className="flex gap-0.5 mb-1">
              <div className="w-12" />
              {Array.from({ length: 9 }, (_, h) => (
                <div
                  key={h}
                  className="flex-1 text-center text-[10px] text-gray-400"
                >
                  {h + 13}:00
                </div>
              ))}
            </div>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (day, di) => (
                <div key={day} className="flex gap-0.5 mb-0.5">
                  <div className="w-12 text-xs text-gray-500 flex items-center">
                    {day}
                  </div>
                  {Array.from({ length: 9 }, (_, h) => {
                    const val = heatmap[di]?.[h] || 0;
                    const intensity = val / maxHeat;
                    return (
                      <button
                        type="button"
                        key={h}
                        aria-label={`${day} ${h + 13}:00 · ${val} paid orders`}
                        onClick={() =>
                          setSelectedHeatmap({
                            dayIdx: di,
                            hour: h,
                            dayName: day,
                          })
                        }
                        className="flex-1 h-8 rounded-md cursor-pointer hover:ring-2 hover:ring-inset hover:ring-amber-600 transition-colors box-border"
                        style={{
                          backgroundColor:
                            val === 0
                              ? "#f9fafb"
                              : `rgba(245, 158, 11, ${0.15 + intensity * 0.85})`,
                        }}
                        title={`${day} ${h + 13}:00 — ${val} order${val !== 1 ? "s" : ""}`}
                      />
                    );
                  })}
                </div>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Profit Margins */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-semibold text-gray-900">Menu pricing guide</h2>
          <button
            onClick={handleExportMarginsCSV}
            className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-bold"
          >
            ↓ CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <PaginatedTable
            aria-label="Product margins"
            resetKey={period}
            className="w-full text-sm"
          >
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Item
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Price
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Ingredient Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Price less recipe cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Margin %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {margins.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setSelectedMarginItem(m.id)}
                  className="hover:bg-amber-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <button
                      className="text-left underline-offset-4 hover:underline"
                      onClick={() => setSelectedMarginItem(m.id)}
                    >
                      {m.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    ₱{m.price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    ₱{m.cost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    ₱{m.profit.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        m.margin >= 80
                          ? "bg-green-50 text-green-700"
                          : m.margin >= 50
                            ? "bg-yellow-50 text-yellow-700"
                            : "bg-red-50 text-red-700"
                      }`}
                    >
                      {m.margin.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </PaginatedTable>
        </div>
      </div>

      <p className="ops-chart-caption">
        Recipe costs are estimates for pricing.{" "}
        <Link href="/finance" className="underline">
          Open Finance for business profit and tax.
        </Link>
      </p>
      {/* Interactive Modals */}
      {selectedHeatmap && activeDateRange && (
        <HeatmapModal
          dayIdx={selectedHeatmap.dayIdx}
          hour={selectedHeatmap.hour}
          dayName={selectedHeatmap.dayName}
          startDate={activeDateRange.start}
          endDate={activeDateRange.end}
          onClose={() => setSelectedHeatmap(null)}
        />
      )}
      {selectedBestSeller && activeDateRange && (
        <BestSellerModal
          itemName={selectedBestSeller.name}
          itemKey={selectedBestSeller.item_key}
          startDate={activeDateRange.start}
          endDate={activeDateRange.end}
          onClose={() => setSelectedBestSeller(null)}
        />
      )}
      {selectedMarginItem && (
        <MarginModal
          menuItemId={selectedMarginItem}
          onClose={() => setSelectedMarginItem(null)}
        />
      )}
    </div>
  );
}
