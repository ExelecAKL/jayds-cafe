// apps/pos/components/PosSkeletons.tsx
// Placeholders shaped like the real cashier screens: product tiles fill the
// same grid cells, tickets keep their columns, and the rail stays visible so
// moving between Register and Orders never blanks the terminal.
import type { ReactNode } from "react";
import { BrandArtwork } from "@cafeos/shared/brand";
import {
  Skeleton,
  SkeletonStatus,
  SkeletonText,
  repeat,
} from "@cafeos/shared/ui/skeleton";
import { PosIcon } from "./PosPrimitives";

export { Skeleton, SkeletonStatus, SkeletonText };

export function ProductTileSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="product-card is-skeleton" aria-hidden="true">
      <div className="product-main">
        <div className="product-image">
          <Skeleton shape="block" height="100%" radius={7} />
        </div>
        <Skeleton width={["78%", "62%", "70%", "54%"][index % 4]} height={14} />
        <div className="product-price">
          <Skeleton width={56} height={13} />
          <Skeleton shape="circle" width={18} height={18} />
        </div>
      </div>
      <Skeleton shape="block" height={30} radius={8} />
    </div>
  );
}

/** Product tiles placed straight into the catalog grid's own cells. */
export function CatalogTilesSkeleton({ count }: { count: number }) {
  return (
    <>
      <span className="sr-only" role="status">
        Loading menu…
      </span>
      {repeat(count, (index) => (
        <ProductTileSkeleton key={index} index={index} />
      ))}
    </>
  );
}

export function CategoryChipsSkeleton({ count = 5 }: { count?: number }) {
  return repeat(count, (index) => (
    <Skeleton
      key={index}
      shape="block"
      width={[64, 92, 78, 104, 86][index % 5]}
      height={48}
      radius={10}
    />
  ));
}

export function OrderTicketSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="order-ticket is-skeleton" aria-hidden="true">
      <div className="order-ticket-open">
        <div className="order-ticket-heading">
          <Skeleton width={[92, 104, 84][index % 3]} height={18} />
          <Skeleton width={44} height={11} />
        </div>
        <div className="order-badges">
          <Skeleton shape="pill" width={74} height={24} />
          <Skeleton shape="pill" width={64} height={24} />
          <Skeleton shape="pill" width={86} height={24} />
        </div>
        <SkeletonText lines={index % 2 ? 1 : 2} height={11} lastWidth="56%" />
      </div>
      <div className="order-ticket-total">
        <Skeleton width={52} height={12} />
        <Skeleton width={72} height={16} />
      </div>
      <Skeleton shape="block" height={48} radius={10} />
    </div>
  );
}

export function ColumnTicketsSkeleton({
  count = 2,
  label,
}: {
  count?: number;
  label: string | null;
}) {
  return (
    <SkeletonStatus label={label} className="pos-skeleton-stack">
      {repeat(count, (index) => (
        <OrderTicketSkeleton key={index} index={index} />
      ))}
    </SkeletonStatus>
  );
}

/** Dialog body for an order ticket that is still loading. */
export function TicketDialogSkeleton({ label }: { label: string }) {
  return (
    <SkeletonStatus label={label} className="pos-skeleton-ticket">
      <div className="pos-skeleton-row" aria-hidden="true">
        <Skeleton width={120} height={22} />
        <Skeleton shape="pill" width={80} height={26} />
      </div>
      {repeat(3, (index) => (
        <div className="pos-skeleton-row" key={index} aria-hidden="true">
          <div className="jsk-stack">
            <Skeleton width={["62%", "48%", "56%"][index]} height={14} />
            <Skeleton width={["38%", "30%", "44%"][index]} height={10} />
          </div>
          <Skeleton width={64} height={14} />
        </div>
      ))}
      <div className="pos-skeleton-row is-total" aria-hidden="true">
        <Skeleton width={64} height={18} />
        <Skeleton width={96} height={24} />
      </div>
      <Skeleton shape="block" height={56} radius={12} />
    </SkeletonStatus>
  );
}

function RegisterBody() {
  return (
    <div className="register-layout">
      <section className="catalog-panel" aria-hidden="true">
        <div className="catalog-search">
          <Skeleton shape="block" height={48} radius={10} />
        </div>
        <div className="catalog-categories">
          <CategoryChipsSkeleton />
        </div>
        <div className="catalog-products pos-skeleton-catalog">
          {repeat(12, (index) => (
            <ProductTileSkeleton key={index} index={index} />
          ))}
        </div>
      </section>
      <aside className="ticket-panel" aria-hidden="true">
        <header className="ticket-heading">
          <div className="jsk-stack">
            <Skeleton width={130} height={18} />
            <Skeleton width={170} height={11} />
          </div>
        </header>
        <div className="ticket-lines">
          <div className="pos-empty">
            <Skeleton shape="block" width={56} height={56} radius={14} />
            <Skeleton width={140} height={14} />
          </div>
        </div>
        <footer className="ticket-footer">
          <Skeleton shape="block" height={56} radius={12} />
        </footer>
      </aside>
    </div>
  );
}

function OrdersBody() {
  return (
    <div className="orders-workspace">
      <div className="orders-toolbar" aria-hidden="true">
        <Skeleton shape="block" width={300} height={48} radius={10} />
        <Skeleton shape="block" width={230} height={48} radius={10} />
      </div>
      <div className="orders-grid">
        {["New", "Confirmed", "Preparing", "Ready"].map((stage, index) => (
          <section className="orders-column" key={stage} aria-hidden="true">
            <header className="orders-column-heading">
              {stage}
              <span>
                <Skeleton inline width={14} height={10} />
              </span>
            </header>
            <div className="column-tickets">
              {repeat(index % 2 ? 1 : 2, (ticket) => (
                <OrderTicketSkeleton key={ticket} index={ticket + index} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * The cashier frame while a screen's code or the staff session loads. The
 * rail is a static copy of the real one so it never flickers.
 */
export function PosScreenSkeleton({
  screen,
  title,
  label,
  children,
}: {
  screen: "register" | "orders" | "void" | "plain";
  title: string;
  label: string;
  children?: ReactNode;
}) {
  const links = [
    { key: "register", name: "Register", icon: "register" },
    { key: "orders", name: "Orders", icon: "orders" },
    { key: "tv", name: "TV board", icon: "tv" },
    { key: "void", name: "Cancel order", icon: "trash" },
  ];
  return (
    <SkeletonStatus label={label} className="pos-shell pos-skeleton-shell">
      <div className="pos-rail" aria-hidden="true">
        <span className="pos-brand">
          <BrandArtwork variant="symbol" tone="cream" className="pos-brand-symbol" />
          <BrandArtwork variant="wordmark" tone="cream" className="pos-brand-wordmark" />
        </span>
        <div className="pos-rail-links">
          {links.map((link) => (
            <span
              key={link.key}
              className="pos-rail-placeholder"
              data-current={link.key === screen || undefined}
            >
              <PosIcon name={link.icon} />
              <span>{link.name}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="pos-workspace">
        <div className="pos-topbar" aria-hidden="true">
          <div>
            <Skeleton width={150} height={10} />
            <p className="pos-skeleton-title">{title}</p>
          </div>
          <div className="pos-topbar-right">
            <Skeleton shape="block" width={72} height={48} radius={10} />
            <Skeleton width={70} height={12} />
            <Skeleton width={110} height={12} />
          </div>
        </div>
        <div className="pos-main">
          {children ??
            (screen === "register" ? (
              <RegisterBody />
            ) : screen === "orders" ? (
              <OrdersBody />
            ) : (
              <div className="pos-skeleton-panel" aria-hidden="true">
                <Skeleton width={200} height={22} />
                <SkeletonText lines={2} height={12} />
                <Skeleton shape="block" height={56} radius={12} />
                <Skeleton shape="block" height={56} radius={12} />
              </div>
            ))}
        </div>
      </div>
    </SkeletonStatus>
  );
}
