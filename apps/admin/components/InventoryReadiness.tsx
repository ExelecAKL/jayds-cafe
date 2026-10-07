"use client";
import Link from "next/link";
import { Badge, useOperations } from "./Operations";

export default function InventoryReadiness() {
  const { readiness, loading, error } = useOperations();
  if (!readiness || loading || error)
    return <p className="ops-muted">Checking inventory setup…</p>;
  const checks = [
    {
      label: "Open orders",
      count: readiness.active_orders,
      detail: "Finish or cancel open orders before switching inventory on.",
      href: "/orders",
      action: "Review orders",
    },
    {
      label: "Product recipes",
      count: readiness.missing_recipes.length,
      detail: readiness.missing_recipes.map((item) => item.name).join(", "),
      href: "/inventory?tab=recipes&filter=missing_recipe",
      action: "Complete recipes",
    },
    {
      label: "Opening stock counts",
      count: readiness.missing_counts.length,
      detail: `${readiness.active_stock_items - readiness.missing_counts.length} of ${readiness.active_stock_items} stock items have current posted counts.`,
      href: "/inventory?tab=stocktakes",
      action: "Post counts",
    },
    {
      label: "Units and balances",
      count: readiness.invalid_stock.length,
      detail: readiness.invalid_stock.map((item) => item.name).join(", "),
      href: "/inventory",
      action: "Review stock",
    },
  ];
  return (
    <section aria-label="Inventory activation checklist" className="ops-panel">
      {checks.map((check) => (
        <div
          key={check.label}
          className="ops-action-row"
          style={{ flexWrap: "wrap" }}
        >
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            <strong>{check.label}</strong>
            <p>
              {check.count
                ? check.detail
                : check.label === "Opening stock counts"
                  ? check.detail
                  : "Ready"}
            </p>
          </div>
          <Badge tone={check.count ? "warning" : "success"}>
            {check.count ? `${check.count} need attention` : "Ready"}
          </Badge>
          {check.count > 0 && (
            <Link className="ops-button small" href={check.href}>
              {check.action}
            </Link>
          )}
        </div>
      ))}
    </section>
  );
}
