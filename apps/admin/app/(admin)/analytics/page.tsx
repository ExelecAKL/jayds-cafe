// apps/admin/app/(admin)/analytics/page.tsx
// Sales & Analytics Dashboard — revenue, best sellers, peak hours, margins

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@cafeos/shared/supabase/client';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { exportAsCsv, exportAsPng } from '../../../utils/exportMetrics';
import { Pagination } from '../../../components/Pagination';
import { HeatmapModal, BestSellerModal, MarginModal } from '../../../components/AnalyticsModals';

type Period = 'today' | 'week' | 'month' | 'year';

interface RevenuePoint { label: string; revenue: number; orders: number }
interface BestSeller { name: string; qty: number; revenue: number }
interface MarginRow { id: string; name: string; price: number; cost: number; profit: number; margin: number }

function getDateRange(period: Period): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const now = new Date();
  const end = new Date(now);
  let start: Date;
  let prevStart: Date;
  let prevEnd: Date;

  if (period === 'today') {
    start = new Date(now); start.setHours(0, 0, 0, 0);
    prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 1);
    prevEnd = new Date(start);
  } else if (period === 'week') {
    start = new Date(now); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
    prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
    prevEnd = new Date(start);
  } else if (period === 'month') {
    start = new Date(now); start.setDate(start.getDate() - 30); start.setHours(0, 0, 0, 0);
    prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 30);
    prevEnd = new Date(start);
  } else {
    start = new Date(now); start.setFullYear(start.getFullYear() - 1); start.setHours(0, 0, 0, 0);
    prevStart = new Date(start); prevStart.setFullYear(prevStart.getFullYear() - 1);
    prevEnd = new Date(start);
  }
  return { start, end, prevStart, prevEnd };
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('today');
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [prevRevenue, setPrevRevenue] = useState(0);
  const [chartData, setChartData] = useState<RevenuePoint[]>([]);
  const [bestSellers, setBestSellers] = useState<BestSeller[]>([]);
  const [heatmap, setHeatmap] = useState<number[][]>([]);
  const [margins, setMargins] = useState<MarginRow[]>([]);

  // Modal State
  const [selectedHeatmap, setSelectedHeatmap] = useState<{ dayIdx: number, hour: number, dayName: string } | null>(null);
  const [selectedBestSeller, setSelectedBestSeller] = useState<string | null>(null);
  const [selectedMarginItem, setSelectedMarginItem] = useState<string | null>(null);

  // Pagination State for Margins
  const [marginsPage, setMarginsPage] = useState(1);
  const marginsPageSize = 10;
  
  // Date tracking for modals
  const [activeDateRange, setActiveDateRange] = useState<{ start: Date, end: Date } | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    const { start, end, prevStart, prevEnd } = getDateRange(period);
    setActiveDateRange({ start, end });

    // Current period orders
    const { data: orders } = await supabase
      .from('orders')
      .select('id, total, payment_status, created_at, status')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    // Previous period orders (for comparison)
    const { data: prevOrders } = await supabase
      .from('orders')
      .select('total, payment_status')
      .gte('created_at', prevStart.toISOString())
      .lt('created_at', prevEnd.toISOString());

    const paidOrders = (orders || []).filter((o) => o.payment_status === 'paid');
    const prevPaid = (prevOrders || []).filter((o) => o.payment_status === 'paid');

    const totalRev = paidOrders.reduce((s, o) => s + Number(o.total), 0);
    const prevRev = prevPaid.reduce((s, o) => s + Number(o.total), 0);

    setRevenue(totalRev);
    setOrderCount(paidOrders.length);
    setPrevRevenue(prevRev);

    // Chart data
    const points: Record<string, RevenuePoint> = {};
    for (const o of paidOrders) {
      const d = new Date(o.created_at);
      const label = period === 'today'
        ? `${d.getHours()}:00`
        : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
      if (!points[label]) points[label] = { label, revenue: 0, orders: 0 };
      points[label].revenue += Number(o.total);
      points[label].orders += 1;
    }
    setChartData(Object.values(points));

    // Best sellers (exclude cancelled orders)
    const validOrders = (orders || []).filter((o) => o.status !== 'cancelled');
    const orderIds = validOrders.map((o) => o.id);
    if (orderIds.length > 0) {
      const { data: items } = await supabase
        .from('order_items')
        .select('name, quantity, subtotal')
        .in('order_id', orderIds.slice(0, 200));

      const itemMap: Record<string, BestSeller> = {};
      for (const item of items || []) {
        // Extract base name by stripping out the customization suffix (e.g., "Latte (Hot, Small)" -> "Latte")
        const baseName = item.name.split(' (')[0].trim();
        
        if (!itemMap[baseName]) itemMap[baseName] = { name: baseName, qty: 0, revenue: 0 };
        itemMap[baseName].qty += item.quantity;
        itemMap[baseName].revenue += Number(item.subtotal);
      }
      setBestSellers(Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 10));
    } else {
      setBestSellers([]);
    }

    // Heatmap (7 days × hours 14-22 only — operating hours)
    const grid: number[][] = Array.from({ length: 7 }, () => Array(9).fill(0)); // 9 hours: 14-22
    for (const o of validOrders) {
      const d = new Date(o.created_at);
      const dayIdx = d.getDay();
      const hour = d.getHours();
      if (hour >= 14 && hour <= 22) {
        grid[dayIdx][hour - 14] += 1;
      }
    }
    setHeatmap(grid);

    // Margins
    const { data: menuRows } = await supabase
      .from('menu_items')
      .select('id, name, price')
      .eq('is_available', true);
    const { data: recipeRows } = await supabase
      .from('menu_item_ingredients')
      .select('menu_item_id, quantity_used, ingredient:ingredients(cost_per_unit)');

    const costMap: Record<string, number> = {};
    for (const r of recipeRows || []) {
      const costPerUnit = (r.ingredient as unknown as { cost_per_unit: number })?.cost_per_unit || 0;
      costMap[r.menu_item_id] = (costMap[r.menu_item_id] || 0) + r.quantity_used * costPerUnit;
    }

    const marginRows: MarginRow[] = (menuRows || [])
      .filter((m) => costMap[m.id] !== undefined && costMap[m.id] > 0)
      .map((m) => {
        const cost = costMap[m.id] || 0;
        const profit = Number(m.price) - cost;
        return { id: m.id, name: m.name, price: Number(m.price), cost, profit, margin: Number(m.price) > 0 ? (profit / Number(m.price)) * 100 : 0 };
      })
      .sort((a, b) => b.margin - a.margin);
    setMargins(marginRows);

    setLoading(false);
  }, [period]);

  useEffect(() => { void fetchAnalytics(); }, [fetchAnalytics]);

  const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0;
  const revenueChange = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;

  // Find busiest hour
  const busiestInfo = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let maxVal = 0; let maxDay = 0; let maxHour = 0;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 9; h++) {
        if (heatmap[d]?.[h] > maxVal) { maxVal = heatmap[d][h]; maxDay = d; maxHour = h; }
      }
    }
    return maxVal > 0 ? `${days[maxDay]} ${maxHour + 14}:00–${maxHour + 15}:00` : 'No data';
  }, [heatmap]);

  const maxHeat = useMemo(() => Math.max(1, ...heatmap.flat()), [heatmap]);

  const paginatedMargins = useMemo(() => {
    return margins.slice((marginsPage - 1) * marginsPageSize, marginsPage * marginsPageSize);
  }, [margins, marginsPage]);
  const totalMarginsPages = Math.ceil(margins.length / marginsPageSize);
  
  useEffect(() => {
    if (marginsPage > totalMarginsPages && totalMarginsPages > 0) {
      setMarginsPage(totalMarginsPages);
    }
  }, [totalMarginsPages, marginsPage]);

  // Exports Handlers
  const handleExportPageCSV = () => {
    // Export raw orders vs revenue for the CSV overview
    const payload = chartData.map(c => ({ Period: c.label, Orders: c.orders, Revenue: c.revenue.toFixed(2) }));
    exportAsCsv(payload, `Financial_Overview_${period}`);
  };
  
  const handleExportMarginsCSV = () => {
    const payload = margins.map(m => ({ Item: m.name, Price: m.price.toFixed(2), Cost: m.cost.toFixed(2), Profit: m.profit.toFixed(2), MarginPercent: m.margin.toFixed(1) }));
    exportAsCsv(payload, `Item_Margins_${period}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <div className="flex gap-2">
          {(['today', 'week', 'month', 'year'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                period === p ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Annual'}
            </button>
          ))}
          <button 
            onClick={handleExportPageCSV}
            className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-sm rounded-lg ml-2"
          >
            ↓ Global CSV
          </button>
        </div>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Revenue</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">₱{revenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          {prevRevenue > 0 && (
            <p className={`text-xs mt-1 font-medium ${revenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {revenueChange >= 0 ? '▲' : '▼'} {Math.abs(revenueChange).toFixed(1)}% vs prev
            </p>
          )}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Orders</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{orderCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Avg Order Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">₱{avgOrderValue.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Busiest Time</p>
          <p className="text-lg font-bold text-amber-600 mt-1">{busiestInfo}</p>
        </div>
      </div>

      {/* Revenue Chart */}
      <div id="revenue-chart" className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8 relative">
        <div className="flex justify-between items-center mb-4">
           <h2 className="font-semibold text-gray-900">Revenue Over Time</h2>
           <button onClick={() => exportAsPng('revenue-chart', `Revenue_Chart_${period}`)} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">↓ PNG</button>
        </div>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No revenue data for this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₱${v}`} />
              {/* @ts-expect-error recharts Formatter type is overly strict */}
              <Tooltip formatter={(value: number) => [`₱${value.toFixed(2)}`, 'Revenue']} />
              <Line type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Best Sellers */}
      <div id="best-sellers-chart" className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 relative">
          <div className="flex justify-between items-center mb-4">
             <h2 className="font-semibold text-gray-900">Top 10 Best Sellers</h2>
             <button onClick={() => exportAsPng('best-sellers-chart', `Best_Sellers_${period}`)} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">↓ PNG</button>
          </div>
          {bestSellers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No sales data</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={bestSellers} layout="vertical" onClick={(data) => { if(data?.activeLabel) setSelectedBestSeller(data.activeLabel as string); }} style={{cursor: 'pointer'}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                {/* @ts-expect-error recharts Formatter type is overly strict */}
                <Tooltip formatter={(value: number) => [value, 'Sold']} />
                <Bar dataKey="qty" fill="#f59e0b" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Best Sellers Table */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">Sales Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Sold</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bestSellers.map((item, i) => (
                  <tr key={item.name} onClick={() => setSelectedBestSeller(item.name)} className="hover:bg-amber-50 cursor-pointer transition-colors">
                    <td className="py-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 font-medium text-gray-900">{item.name}</td>
                    <td className="py-2 text-right text-gray-600">{item.qty}</td>
                    <td className="py-2 text-right font-medium text-gray-900">₱{item.revenue.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Peak Hours Heatmap */}
      <div id="heatmap-chart" className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8 relative">
        <div className="flex justify-between items-center mb-4">
           <h2 className="font-semibold text-gray-900">Peak Hours Heatmap (14:00–22:00)</h2>
           <button onClick={() => exportAsPng('heatmap-chart', `Heatmap_${period}`)} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">↓ PNG</button>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[500px]">
            <div className="flex gap-0.5 mb-1">
              <div className="w-12" />
              {Array.from({ length: 9 }, (_, h) => (
                <div key={h} className="flex-1 text-center text-[10px] text-gray-400">{h + 14}:00</div>
              ))}
            </div>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, di) => (
              <div key={day} className="flex gap-0.5 mb-0.5">
                <div className="w-12 text-xs text-gray-500 flex items-center">{day}</div>
                {Array.from({ length: 9 }, (_, h) => {
                  const val = heatmap[di]?.[h] || 0;
                  const intensity = val / maxHeat;
                  return (
                    <div
                      key={h}
                      onClick={() => setSelectedHeatmap({ dayIdx: di, hour: h, dayName: day })}
                      className="flex-1 aspect-square rounded-sm cursor-pointer hover:border-2 hover:border-amber-600 transition-all box-border"
                      style={{
                        backgroundColor: val === 0
                          ? '#f9fafb'
                          : `rgba(245, 158, 11, ${0.15 + intensity * 0.85})`,
                      }}
                      title={`${day} ${h + 14}:00 — ${val} order${val !== 1 ? 's' : ''}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Profit Margins */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-semibold text-gray-900">Profit Margins per Item</h2>
          <button onClick={handleExportMarginsCSV} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-bold">↓ CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ingredient Cost</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginatedMargins.map((m) => (
                <tr key={m.id} onClick={() => setSelectedMarginItem(m.id)} className="hover:bg-amber-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                  <td className="px-4 py-3 text-right text-gray-600">₱{m.price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">₱{m.cost.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">₱{m.profit.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      m.margin >= 80 ? 'bg-green-50 text-green-700'
                      : m.margin >= 50 ? 'bg-yellow-50 text-yellow-700'
                      : 'bg-red-50 text-red-700'
                    }`}>
                      {m.margin.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            currentPage={marginsPage}
            totalPages={totalMarginsPages}
            totalItems={margins.length}
            pageSize={marginsPageSize}
            onPageChange={setMarginsPage}
          />
        </div>
      </div>

      {/* Interactive Modals */}
      {selectedHeatmap && activeDateRange && (
        <HeatmapModal dayIdx={selectedHeatmap.dayIdx} hour={selectedHeatmap.hour} dayName={selectedHeatmap.dayName} startDate={activeDateRange.start} endDate={activeDateRange.end} onClose={() => setSelectedHeatmap(null)} />
      )}
      {selectedBestSeller && activeDateRange && (
        <BestSellerModal itemName={selectedBestSeller} startDate={activeDateRange.start} endDate={activeDateRange.end} onClose={() => setSelectedBestSeller(null)} />
      )}
      {selectedMarginItem && (
        <MarginModal menuItemId={selectedMarginItem} onClose={() => setSelectedMarginItem(null)} />
      )}
    </div>
  );
}
