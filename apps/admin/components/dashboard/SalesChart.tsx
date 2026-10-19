"use client";
import { useId, useState } from "react";
import { Icon, peso } from "../Operations";
import { ChartSkeleton } from "../AdminSkeletons";

type Sales = { revenue: number; days: { date: string; revenue: number }[] };
const label = (date: string, short = false) =>
  new Date(date + "T12:00:00Z").toLocaleDateString(
    "en-PH",
    short
      ? { weekday: "short", timeZone: "Asia/Manila" }
      : { month: "short", day: "numeric", timeZone: "Asia/Manila" },
  );
export function SalesChart({
  sales,
  days,
  loading,
  error,
  onRetry,
}: {
  sales: Sales | null;
  days: number;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const [view, setView] = useState("area");
  const id = useId().replaceAll(":", "");
  const series = sales?.days ?? [];
  const max = Math.max(1, ...series.map((day) => Number(day.revenue)));
  const top = max > 1 ? Math.ceil(max / 4) * 4 : 4;
  const points = series.map((day, index) => ({
    x:
      series.length === 1
        ? 360
        : 12 + (index / Math.max(series.length - 1, 1)) * 696,
    y: 196 - (Number(day.revenue) / top) * 176,
  }));
  const path = points
    .map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
    .join(" ");
  const peak = series.reduce<Sales["days"][number] | null>(
    (best, day) =>
      !best || Number(day.revenue) > Number(best.revenue) ? day : best,
    null,
  );
  return (
    <>
      <div className="dashboard-panel-heading">
        <div>
          <p className="dashboard-kicker">THE BIG PICTURE</p>
          <h2 id="sales-heading">Sales performance</h2>
        </div>
        <div className="chart-view" role="group" aria-label="Chart display">
          <button
            aria-label="Area chart"
            aria-pressed={view === "area"}
            onClick={() => setView("area")}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 14l5-5 4 2 5-7M3 17h14" />
            </svg>
          </button>
          <button
            aria-label="Bar chart"
            aria-pressed={view === "bars"}
            onClick={() => setView("bars")}
          >
            <Icon name="reports" size={17} />
          </button>
        </div>
      </div>
      {!sales && !error ? (
        <ChartSkeleton label="Loading verified sales data" bars={14} />
      ) : !sales ? (
        <div className="chart-placeholder" role="status">
          {error ? (
            <>
              <Icon name="alert" size={28} />
              <strong>Sales are unavailable</strong>
              <span>Refresh to reconnect to your sales data.</span>
              <button
                className="ui-button"
                disabled={loading}
                onClick={onRetry}
              >
                Retry sales
              </button>
            </>
          ) : (
            <>
              <div className="chart-loading ui-skeleton" />
              <span>Loading verified sales data</span>
            </>
          )}
        </div>
      ) : !series.length || Number(sales.revenue) === 0 ? (
        <div className="chart-placeholder">
          <Icon name="reports" size={30} />
          <strong>No paid sales in this period</strong>
          <span>Collected sales will appear as orders are paid.</span>
        </div>
      ) : (
        <>
          <div className="chart-context">
            <span>
              <i />
              Collected sales
            </span>
            <span>Philippine business dates</span>
          </div>
          <figure
            className="sales-chart"
            aria-label={`Collected sales over ${days} days. Total ${peso(sales.revenue)}. Daily values are available in View daily sales.`}
          >
            <div className="chart-y-axis" aria-hidden="true">
              {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
                <span key={ratio}>
                  {new Intl.NumberFormat("en-PH", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(top * ratio)}
                </span>
              ))}
            </div>
            <div className="chart-plot">
              <svg
                className="chart-svg"
                viewBox="0 0 720 210"
                preserveAspectRatio="none"
                role="img"
                aria-labelledby={`${id}-title`}
              >
                <title id={`${id}-title`}>
                  Daily sales in Philippine pesos
                </title>
                <defs>
                  <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" className="chart-gradient-top" />
                    <stop offset="100%" className="chart-gradient-bottom" />
                  </linearGradient>
                </defs>
                {[20, 64, 108, 152, 196].map((y) => (
                  <line
                    className="chart-grid-line"
                    key={y}
                    x1="0"
                    y1={y}
                    x2="720"
                    y2={y}
                  />
                ))}
                {view === "area" ? (
                  <>
                    <path
                      d={`${path} L${points.at(-1)?.x},196 L${points[0]?.x},196 Z`}
                      fill={`url(#${id}-fill)`}
                    />
                    <path className="chart-line" d={path} />
                    {points.map((point, index) => (
                      <circle
                        className="chart-point"
                        key={index}
                        cx={point.x}
                        cy={point.y}
                        r={3}
                      >
                        <title>
                          {label(series[index].date)}:{" "}
                          {peso(series[index].revenue)}
                        </title>
                      </circle>
                    ))}
                  </>
                ) : (
                  points.map((point, index) => (
                    <rect
                      className="chart-bar"
                      key={index}
                      x={
                        series.length === 1
                          ? 348
                          : 4 + (index / series.length) * 712
                      }
                      y={point.y}
                      width={Math.max(3, 712 / series.length - 12)}
                      height={Math.max(0, 196 - point.y)}
                      rx={3}
                    >
                      <title>
                        {label(series[index].date)}:{" "}
                        {peso(series[index].revenue)}
                      </title>
                    </rect>
                  ))
                )}
              </svg>
              <div className="chart-x-axis" aria-hidden="true">
                {series
                  .filter(
                    (_, index) =>
                      days === 7 ||
                      index % Math.ceil(series.length / 6) === 0 ||
                      index === series.length - 1,
                  )
                  .map((day) => (
                    <span key={day.date}>{label(day.date, days === 7)}</span>
                  ))}
              </div>
            </div>
          </figure>
          <div className="chart-insights">
            <div>
              <span>Daily average</span>
              <strong>
                {peso(Number(sales.revenue) / Math.max(series.length, 1))}
              </strong>
            </div>
            <div>
              <span>Best day{peak ? ` · ${label(peak.date)}` : ""}</span>
              <strong>{peso(peak?.revenue ?? 0)}</strong>
            </div>
          </div>
          <details className="chart-data">
            <summary>
              View daily sales
              <Icon name="plus" size={15} />
            </summary>
            <div
              className="dashboard-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Daily sales data"
            >
              <table className="dashboard-table" aria-label="Daily sales">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="number">Collected (PHP)</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((day) => (
                    <tr key={day.date}>
                      <td>{label(day.date)}</td>
                      <td className="number">{peso(day.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </>
  );
}
