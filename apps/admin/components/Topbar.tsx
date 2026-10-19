"use client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminHelp, adminGuides } from "./AdminHelp";
import { findNavItem } from "./adminNav";
import {
  CommandPalette,
  rememberRecentPage,
  useCommandPaletteShortcut,
} from "./CommandPalette";
import { Icon, useOperations } from "./Operations";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationCenter } from "./notifications/NotificationCenter";
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
  notifications: "Notifications",
};
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const [helpPath, setHelpPath] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useCommandPaletteShortcut(openPalette);
  const current = findNavItem(pathname);
  const page = pathname.split("/").filter(Boolean).at(-1) ?? "dashboard";
  const ops = useOperations();
  useEffect(() => rememberRecentPage(pathname), [pathname]);
  // "?" opens help for the current page, "/" jumps to the page's search box.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "input,textarea,select,[contenteditable='true'],[role='dialog'],[role='listbox']",
        )
      )
        return;
      if (event.key === "?") {
        event.preventDefault();
        setHelpPath(pathname);
      } else if (event.key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          "#admin-content input[type='search'], #admin-content .ops-toolbar input:not([type='checkbox']):not([type='date'])",
        );
        if (!search) return;
        event.preventDefault();
        search.focus();
        search.select();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [pathname]);
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
          {current?.group ?? "Back office"} <span>/</span>{" "}
          <strong>
            {current?.label ??
              adminGuides[page]?.title ??
              titles[page] ??
              "Management"}
          </strong>
        </span>
      </div>
      <div className="ops-topbar-right">
        <ThemeToggle />
        <button
          type="button"
          className="ops-jump"
          onClick={openPalette}
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Icon name="search" size={16} />
          <span>Jump to…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button
          className="ops-button small ops-help-button"
          aria-label="Help with this page"
          aria-keyshortcuts="?"
          title="Help with this page · ?"
          onClick={() => setHelpPath(pathname)}
        >
          <Icon name="help" size={15} />
          <span>Help</span>
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
        <NotificationCenter />
      </div>
      {helpPath === pathname && (
        <AdminHelp page={page} onClose={() => setHelpPath(null)} />
      )}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </header>
  );
}
