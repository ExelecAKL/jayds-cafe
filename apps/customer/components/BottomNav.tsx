"use client";
import Link from "./OfflineMenuLink";
import { usePathname } from "next/navigation";
import { useCart } from "../context/CartContext";
import Icon, { type IconName } from "./Icon";
import { BrandArtwork, BrandIcon } from "@cafeos/shared/brand";
const tabs: { label: string; href: string; icon: IconName }[] = [
  { label: "Home", href: "/menu", icon: "home" },
  { label: "Menu", href: "/menu/browse", icon: "coffee" },
  { label: "Orders", href: "/orders", icon: "orders" },
  { label: "Account", href: "/account", icon: "user" },
];
export default function BottomNav() {
  const pathname = usePathname();
  const { hydrated, itemCount } = useCart();
  if (
    pathname?.startsWith("/checkout") ||
    ["/login", "/register", "/forgot-password"].some((p) =>
      pathname?.startsWith(p),
    )
  )
    return null;
  return (
    <nav className="app-nav" aria-label="Main navigation">
      <Link href="/menu" className="nav-brand" aria-label="Jayds Café home">
        <BrandArtwork
          variant="wordmark"
          tone="cream"
          className="nav-wordmark"
        />
      </Link>
      <div className="nav-tabs">
        {tabs.map((tab) => {
          const active =
            tab.href === "/menu"
              ? pathname === "/menu" || pathname === "/"
              : tab.href === "/menu/browse"
                ? pathname?.startsWith("/menu/") ||
                  pathname === "/cart" ||
                  pathname === "/favorites"
                : tab.href === "/account"
                  ? [
                      "/account",
                      "/profile",
                      "/rewards",
                      "/vouchers",
                      "/help",
                      "/privacy",
                      "/terms",
                      "/notifications",
                    ].some((p) => pathname?.startsWith(p))
                  : pathname?.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`nav-tab ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="relative">
                {tab.label === "Home" ? (
                  <BrandIcon name="mascot" size={24} />
                ) : (
                  <Icon name={tab.icon} />
                )}
                {tab.label === "Menu" && hydrated && itemCount > 0 && (
                  <span
                    key={itemCount}
                    className="nav-badge jm-pop"
                    aria-label={`${itemCount} items in bag`}
                  >
                    {itemCount > 99 ? "99+" : itemCount}
                  </span>
                )}
              </span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
      <Link href="/help" className="nav-help">
        <Icon name="help" />
        <span>Help</span>
      </Link>
    </nav>
  );
}
