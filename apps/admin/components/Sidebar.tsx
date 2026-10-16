"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { Icon } from "./Operations";
import { BrandArtwork, BrandIcon } from "@cafeos/shared/brand";
import { adminNavGroups as groups, isNavActive } from "./adminNav";
export function Sidebar({
  isOpen = false,
  onClose,
}: {
  role?: "admin" | "staff";
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    sidebar.current?.querySelector<HTMLElement>("a")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
      if (event.key !== "Tab") return;
      const links = sidebar.current?.querySelectorAll<HTMLElement>("a,button");
      if (!links?.length) return;
      const first = links[0];
      const last = links[links.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);
  return (
    <>
      {isOpen && <div className="ops-sidebar-backdrop" onClick={onClose} />}
      <aside
        ref={sidebar}
        aria-label="Admin navigation"
        className={"ops-sidebar " + (isOpen ? "open" : "")}
      >
        <Link
          href="/dashboard"
          className="ops-brand"
          aria-label="Jayds Café back office"
        >
          <span className="ops-brand-mark">
            <BrandIcon name="mascot" size={32} />
          </span>
          <span>
            <BrandArtwork
              variant="horizontal"
              tone="cream"
              className="ops-brand-wordmark"
            />
            <small>BACK OFFICE</small>
          </span>
        </Link>
        <div className="ops-sidebar-label">ONE BRANCH. ONE WORKSPACE.</div>
        <nav>
          {groups.map((group) => (
            <div className="ops-nav-group" key={group.label}>
              <h3>{group.label}</h3>
              {group.items.map((item) => (
                <Link
                  href={item.href}
                  key={item.href}
                  onClick={onClose}
                  aria-current={
                    isNavActive(pathname, item.href) ? "page" : undefined
                  }
                  className={isNavActive(pathname, item.href) ? "active" : ""}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {isNavActive(pathname, item.href) && <i />}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="ops-sidebar-footer">
          <div className="ops-avatar">
            {(profile?.full_name || "Admin").slice(0, 1)}
          </div>
          <div>
            <strong>{profile?.full_name || "Café administrator"}</strong>
            <small>Administrator</small>
          </div>
          <button aria-label="Sign out" onClick={() => void signOut()}>
            <Icon name="logout" />
          </button>
        </div>
      </aside>
    </>
  );
}
