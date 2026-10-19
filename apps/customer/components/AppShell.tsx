"use client";
import Link from "next/link";
import OfflineMenuLink from "./OfflineMenuLink";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";
import FloatingCartBar from "./FloatingCartBar";
import Icon, { type IconName } from "./Icon";
import { useCart } from "../context/CartContext";
const portraitTitles: Record<string, string> = {
  "/cart": "Your bag",
  "/rewards": "Rewards",
  "/vouchers": "Vouchers",
  "/favorites": "Favorites",
  "/profile/edit": "Personal details",
  "/notifications": "Notifications",
  "/help": "Help & support",
};
export default function AppShell({
  title,
  mobileTitle,
  eyebrow = "Jayds Café",
  description,
  backHref,
  actions,
  children,
  className = "",
  cart = false,
}: {
  title: string;
  mobileTitle?: string;
  eyebrow?: string;
  description?: string;
  backHref?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  cart?: boolean;
}) {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const showBag =
    !pathname?.startsWith("/cart") &&
    !pathname?.startsWith("/checkout") &&
    (!cart || itemCount === 0);
  const portraitTitle = mobileTitle ?? portraitTitles[pathname || ""];
  const screen = pathname?.startsWith("/checkout")
    ? "checkout-screen"
    : pathname?.startsWith("/account")
      ? "account-screen"
      : pathname?.startsWith("/orders")
        ? "orders-screen"
        : "";
  return (
    <div className={`jayds-app ${screen} ${className}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          {backHref && (
            <OfflineMenuLink
              href={backHref}
              className="icon-button shrink-0"
              aria-label="Go back"
            >
              <Icon name="arrowLeft" />
            </OfflineMenuLink>
          )}
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="page-title">
              {portraitTitle ? (
                <>
                  <span className="wide-screen-title">{title}</span>
                  <span className="portrait-screen-title">{portraitTitle}</span>
                </>
              ) : (
                title
              )}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-text-secondary">{description}</p>
            )}
          </div>
          {showBag && (
            <Link
              href="/cart"
              className="header-bag-link"
              aria-label={`View your bag${itemCount ? `, ${itemCount} items` : ""}`}
            >
              <Icon name="bag" size={20} />
              <span className="header-bag-label">Your bag</span>
              {itemCount > 0 && (
                <span key={itemCount} className="header-bag-count jm-pop">
                  {itemCount}
                </span>
              )}
            </Link>
          )}
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="app-content app-page-enter"
      >
        {children}
      </main>
      {cart && <FloatingCartBar />}
      <BottomNav />
    </div>
  );
}
export function EmptyState({
  icon = "coffee",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={32} />
      </span>
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </section>
  );
}
export function InlineNotice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success" | "warning";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`inline-notice notice-${tone}`}
    >
      <span className="notice-icon" aria-hidden="true">
        <Icon
          name={
            tone === "error" || tone === "warning"
              ? "warning"
              : tone === "success"
                ? "check"
                : "info"
          }
          size={20}
        />
      </span>
      <div className="notice-content">{children}</div>
    </div>
  );
}
export function WalletTabs({ active }: { active: "rewards" | "vouchers" }) {
  return (
    <nav aria-label="Wallet" className="segmented-control mb-5">
      <Link
        href="/rewards"
        aria-current={active === "rewards" ? "page" : undefined}
        className={active === "rewards" ? "is-selected" : ""}
      >
        Points & rewards
      </Link>
      <Link
        href="/vouchers"
        aria-current={active === "vouchers" ? "page" : undefined}
        className={active === "vouchers" ? "is-selected" : ""}
      >
        Vouchers
      </Link>
    </nav>
  );
}
