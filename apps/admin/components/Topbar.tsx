"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AdminHelp, adminGuides } from "./AdminHelp";
import { findNavItem } from "./adminNav";
import { Icon, useOperations } from "./Operations";
const titles: Record<string, string> = {
  dashboard: "Overview",
  orders: "Orders",
  menu: "Menu catalog",
  categories: "Categories",
  inventory: "Inventory",
  purchasing: "Purchasing",
  analytics: "Reports",
  vouchers: "Vouchers",
  "staff-accounts": "Staff accounts",
  loyalty: "Members",
  "void-security": "Void security",
  audit: "Activity log",
};
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const [helpPath, setHelpPath] = useState<string | null>(null);
  const page = pathname.split("/").filter(Boolean).at(-1) ?? "dashboard";
  const ops = useOperations();
  const alerts = ops.stock.filter(
    (item) => Number(item.available_stock) <= Number(item.min_stock_alert),
  ).length;
  return (
    <header className="ops-topbar">
      <div className="ops-topbar-left">
        <button
          className="ops-icon-button ops-mobile-menu"
          aria-label="Open navigation"
          onClick={onMenu}
        >
          <Icon name="menu" />
        </button>
        <span className="ops-breadcrumb">
          Back office <span>/</span>{" "}
          <strong>
            {findNavItem(pathname)?.label ??
              adminGuides[page]?.title ??
              titles[page] ??
              "Management"}
          </strong>
        </span>
      </div>
      <div className="ops-topbar-right">
        <button
          className="ops-button small"
          aria-label="Help with this page"
          onClick={() => setHelpPath(pathname)}
        >
          Help
        </button>
        <span className="ops-branch">
          {ops.settings?.branch_name ?? "Jayds Café · Main branch"}
        </span>
        <span
          className={`ops-connection ${ops.connected && !ops.error ? "online" : ""}`}
        >
          <i />
          {ops.error
            ? "Data unavailable"
            : ops.connected
              ? "Live"
              : "Reconnecting"}
        </span>
        {ops.error && (
          <button
            className="ops-button small"
            disabled={ops.loading}
            onClick={() => void ops.refresh()}
          >
            Retry data
          </button>
        )}
        <Link
          href="/inventory?filter=low"
          className="ops-alert-button"
          aria-label={`${alerts} stock alerts`}
        >
          <Icon name="bell" />
          {alerts > 0 && <b>{alerts}</b>}
        </Link>
      </div>
      {helpPath === pathname && (
        <AdminHelp page={page} onClose={() => setHelpPath(null)} />
      )}
    </header>
  );
}
