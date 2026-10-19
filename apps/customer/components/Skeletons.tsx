// apps/customer/components/Skeletons.tsx
// Shape-matched placeholders for every customer screen. Each one reuses the
// real container classes so the layout does not shift when content arrives.
import type { ReactNode } from "react";
import BottomNav from "./BottomNav";
import {
  Skeleton,
  SkeletonStatus,
  SkeletonText,
  repeat,
} from "@cafeos/shared/ui/skeleton";

export { Skeleton, SkeletonStatus, SkeletonText };

export function ProductCardSkeleton() {
  return (
    <div className="product-card is-skeleton" aria-hidden="true">
      <div className="product-art">
        <Skeleton shape="block" radius={0} height="100%" />
      </div>
      <div className="product-copy">
        <Skeleton shape="title" width="72%" height={20} />
        <SkeletonText lines={2} height={11} lastWidth="54%" className="mt-3" />
        <div className="product-footer">
          <Skeleton width={64} height={16} />
          <Skeleton shape="block" width={78} height={48} radius={12} />
        </div>
      </div>
    </div>
  );
}

export function ProductGridSkeleton({
  count = 6,
  label = "Loading the menu",
}: {
  count?: number;
  label?: string;
}) {
  return (
    <SkeletonStatus label={label} className="product-grid">
      {repeat(count, (index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </SkeletonStatus>
  );
}

/** Menu browse results: a category heading and its first row of products. */
export function MenuSectionsSkeleton({
  label = "Loading the menu",
}: {
  /** Null when the page already announces loading elsewhere. */
  label?: string | null;
}) {
  return (
    <SkeletonStatus label={label} className="menu-group">
      <div className="section-heading" aria-hidden="true">
        <Skeleton shape="title" width={150} height={26} />
        <Skeleton width={72} height={12} />
      </div>
      <div className="product-grid">
        {repeat(8, (index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    </SkeletonStatus>
  );
}

/** Items for the category rail itself: an icon above a short label. */
export function CategoryRailSkeleton({ count = 6 }: { count?: number }) {
  return repeat(count, (index) => (
    <span className="rail-skeleton-item" key={index} aria-hidden="true">
      <Skeleton shape="circle" width={28} height={28} />
      <Skeleton width={[44, 56, 38, 50, 42, 60][index % 6]} height={10} />
    </span>
  ));
}

export function ProductDetailSkeleton() {
  return (
    <SkeletonStatus label="Loading this product" className="detail-layout">
      <section className="detail-image-section" aria-hidden="true">
        <div className="detail-art">
          <Skeleton shape="media" radius={0} />
        </div>
        <div className="detail-introduction mt-6 grid gap-3">
          <Skeleton width={96} height={11} />
          <Skeleton shape="title" width="68%" height={36} />
          <SkeletonText lines={2} height={13} lastWidth="70%" />
          <Skeleton width={120} height={26} className="mt-2" />
        </div>
      </section>
      <div className="space-y-4" aria-hidden="true">
        {repeat(3, (index) => (
          <div className="detail-options" key={index}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <Skeleton shape="title" width={index === 1 ? 70 : 104} />
              <Skeleton width={74} height={11} />
            </div>
            <div className="flex flex-wrap gap-2">
              {repeat(index === 2 ? 4 : 3, (chip) => (
                <Skeleton
                  key={chip}
                  shape="pill"
                  width={[92, 116, 84, 104][chip]}
                  height={40}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkeletonStatus>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="order-card is-skeleton" aria-hidden="true">
      <div className="flex items-start justify-between gap-3">
        <div className="grid flex-1 gap-2">
          <Skeleton width={128} height={11} />
          <Skeleton shape="title" width={142} height={30} />
        </div>
        <Skeleton shape="pill" width={84} height={28} />
      </div>
      <Skeleton width={150} height={11} className="mt-4" />
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Skeleton width={46} height={11} />
          <Skeleton shape="pill" width={64} height={24} />
        </div>
        <Skeleton width={72} height={18} />
      </div>
    </div>
  );
}

export function OrderListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonStatus
      label="Loading your orders"
      className="grid gap-4 lg:grid-cols-2"
    >
      {repeat(count, (index) => (
        <OrderCardSkeleton key={index} />
      ))}
    </SkeletonStatus>
  );
}

/** Order tracking: progress steps, then the itemised summary. */
export function OrderDetailSkeleton() {
  return (
    <SkeletonStatus label="Checking your order" className="space-y-4">
      <section className="skeleton-surface" aria-hidden="true">
        <Skeleton width={110} height={11} />
        <Skeleton shape="title" width="58%" height={28} className="mt-3" />
        <div className="skeleton-steps mt-6">
          {repeat(4, (index) => (
            <div key={index} className="skeleton-step">
              <Skeleton shape="circle" width={28} height={28} />
              <Skeleton width="70%" height={11} />
            </div>
          ))}
        </div>
      </section>
      <section className="skeleton-surface" aria-hidden="true">
        <Skeleton shape="title" width={140} />
        {repeat(3, (index) => (
          <div key={index} className="skeleton-line-item">
            <Skeleton shape="block" width={56} height={56} radius={14} />
            <div className="jsk-stack">
              <Skeleton width={index === 1 ? "48%" : "62%"} height={15} />
              <Skeleton width="38%" height={11} />
            </div>
            <Skeleton width={58} height={15} />
          </div>
        ))}
        <div className="skeleton-total">
          <Skeleton width={70} height={15} />
          <Skeleton width={84} height={20} />
        </div>
      </section>
    </SkeletonStatus>
  );
}

export function BagItemSkeleton() {
  return (
    <div
      className="rounded-3xl border border-border bg-bg-card p-4 sm:p-5"
      aria-hidden="true"
    >
      <div className="flex items-start gap-3">
        <Skeleton shape="block" width={80} height={80} radius={16} />
        <div className="jsk-stack">
          <Skeleton shape="title" width="64%" height={20} />
          <Skeleton width="80%" height={11} />
          <div className="mt-3 flex items-center justify-between gap-3">
            <Skeleton shape="pill" width={112} height={44} />
            <Skeleton width={64} height={16} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BagSkeleton() {
  return (
    <SkeletonStatus
      label="Loading your bag"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]"
    >
      <div className="min-w-0 space-y-4">
        <div className="section-heading" aria-hidden="true">
          <Skeleton shape="title" width={170} height={26} />
          <Skeleton width={76} height={14} />
        </div>
        <BagItemSkeleton />
        <BagItemSkeleton />
      </div>
      <SummarySkeleton />
    </SkeletonStatus>
  );
}

export function SummarySkeleton() {
  return (
    <div className="skeleton-surface h-fit" aria-hidden="true">
      <Skeleton shape="title" width={120} />
      {repeat(3, (index) => (
        <div className="skeleton-total" key={index}>
          <Skeleton width={[80, 64, 96][index]} height={13} />
          <Skeleton width={56} height={13} />
        </div>
      ))}
      <Skeleton shape="block" height={52} radius={16} className="mt-5" />
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <SkeletonStatus label="Loading your account" className="account-grid">
      <div className="space-y-5" aria-hidden="true">
        <section className="skeleton-surface">
          <div className="flex items-center gap-4">
            <Skeleton shape="block" width={64} height={64} radius={16} />
            <div className="jsk-stack">
              <Skeleton shape="title" width="62%" />
              <Skeleton width="78%" height={12} />
            </div>
          </div>
          <Skeleton shape="block" height={72} radius={18} className="mt-5" />
        </section>
      </div>
      <div className="space-y-5" aria-hidden="true">
        <Skeleton width={140} height={11} />
        <ListRowsSkeleton rows={5} />
      </div>
    </SkeletonStatus>
  );
}

/** Rows of icon, title and description, like account links and settings. */
export function ListRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {repeat(rows, (index) => (
        <div className="skeleton-list-row" key={index}>
          <Skeleton shape="block" width={44} height={44} radius={14} />
          <div className="jsk-stack">
            <Skeleton width={[118, 92, 136, 104, 126][index % 5]} height={14} />
            <Skeleton width={[180, 150, 200, 168, 190][index % 5]} height={11} />
          </div>
          <Skeleton width={12} height={12} />
        </div>
      ))}
    </div>
  );
}

export function RewardsSkeleton() {
  return (
    <SkeletonStatus label="Loading your rewards" className="space-y-4">
      <section className="skeleton-wallet" aria-hidden="true">
        <Skeleton width={110} height={11} />
        <Skeleton shape="title" width={180} height={44} className="mt-3" />
        <Skeleton shape="pill" height={10} className="mt-6" />
        <Skeleton width="56%" height={11} className="mt-3" />
      </section>
      <section className="skeleton-surface" aria-hidden="true">
        <Skeleton shape="title" width={150} />
        <ListRowsSkeleton rows={3} />
      </section>
    </SkeletonStatus>
  );
}

export function VoucherCardSkeleton() {
  return (
    <div className="skeleton-surface" aria-hidden="true">
      <div className="flex items-start justify-between gap-3">
        <div className="grid flex-1 gap-2">
          <Skeleton width={76} height={11} />
          <Skeleton shape="title" width="58%" height={30} />
        </div>
        <Skeleton shape="block" width={48} height={48} radius={16} />
      </div>
      <SkeletonText lines={2} height={12} lastWidth="66%" className="mt-4" />
      <div className="my-4 flex gap-2">
        <Skeleton shape="block" width={96} height={32} radius={8} />
        <Skeleton shape="block" width={120} height={32} radius={8} />
      </div>
      <Skeleton shape="block" height={48} radius={14} />
    </div>
  );
}

export function VoucherGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <SkeletonStatus
      label="Loading vouchers"
      className="grid gap-4 sm:grid-cols-2"
    >
      {repeat(count, (index) => (
        <VoucherCardSkeleton key={index} />
      ))}
    </SkeletonStatus>
  );
}

export function FormSkeleton({
  fields = 4,
  label = "Loading your details",
  columns = 1,
}: {
  fields?: number;
  label?: string;
  columns?: 1 | 2;
}) {
  return (
    <SkeletonStatus
      label={label}
      className={columns === 2 ? "grid gap-6 lg:grid-cols-2" : "grid gap-6"}
    >
      {repeat(columns, (column) => (
        <div className="skeleton-surface" key={column} aria-hidden="true">
          <Skeleton shape="title" width="46%" />
          <Skeleton width="72%" height={12} className="mt-3" />
          {repeat(fields, (index) => (
            <div className="skeleton-field" key={index}>
              <Skeleton width={[72, 96, 64, 110][index % 4]} height={12} />
              <Skeleton shape="block" height={48} radius={14} />
            </div>
          ))}
          <Skeleton
            shape="block"
            width={150}
            height={48}
            radius={999}
            className="mt-6"
          />
        </div>
      ))}
    </SkeletonStatus>
  );
}

export function AddressGridSkeleton() {
  return (
    <SkeletonStatus label="Loading your addresses" className="space-y-4">
      <Skeleton shape="pill" width={140} height={48} />
      <div className="mt-4 grid gap-4 sm:grid-cols-2" aria-hidden="true">
        {repeat(2, (index) => (
          <div className="skeleton-surface" key={index}>
            <Skeleton shape="title" width={90} height={20} />
            <SkeletonText lines={2} height={12} className="mt-3" />
            <div className="mt-4 flex gap-3">
              <Skeleton shape="pill" width={72} height={48} />
              <Skeleton shape="pill" width={84} height={48} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonStatus>
  );
}

/** Conversation-style rows for support requests and notifications. */
export function MessageListSkeleton({
  rows = 3,
  label,
}: {
  rows?: number;
  label: string;
}) {
  return (
    <SkeletonStatus label={label} className="skeleton-messages">
      {repeat(rows, (index) => (
        <div className="skeleton-message" key={index} aria-hidden="true">
          <Skeleton shape="circle" width={36} height={36} />
          <div className="jsk-stack">
            <div className="flex items-center justify-between gap-3">
              <Skeleton width={[140, 110, 160][index % 3]} height={14} />
              <Skeleton width={48} height={10} />
            </div>
            <SkeletonText
              lines={index === 1 ? 1 : 2}
              height={11}
              lastWidth="58%"
            />
          </div>
        </div>
      ))}
    </SkeletonStatus>
  );
}

/** Printable documents: invoices and receipts. */
export function DocumentSkeleton({ label }: { label: string }) {
  return (
    <SkeletonStatus label={label} className="skeleton-document">
      <div className="flex items-start justify-between gap-4" aria-hidden="true">
        <div className="grid flex-1 gap-2">
          <Skeleton shape="title" width={150} />
          <Skeleton width={190} height={11} />
          <Skeleton width={160} height={11} />
        </div>
        <Skeleton shape="block" width={56} height={56} radius={12} />
      </div>
      <div className="skeleton-rule" aria-hidden="true" />
      {repeat(4, (index) => (
        <div className="skeleton-total" key={index} aria-hidden="true">
          <Skeleton width={[160, 120, 140, 100][index]} height={12} />
          <Skeleton width={60} height={12} />
        </div>
      ))}
      <div className="skeleton-rule" aria-hidden="true" />
      <div className="skeleton-total" aria-hidden="true">
        <Skeleton width={70} height={16} />
        <Skeleton width={90} height={20} />
      </div>
    </SkeletonStatus>
  );
}

/** Route-level frame used while a screen's code loads. */
export function ScreenSkeleton({
  children,
  label = "Loading",
  back = false,
}: {
  children?: ReactNode;
  label?: string;
  back?: boolean;
}) {
  return (
    <div className="jayds-app">
      <header className="app-header" aria-hidden="true">
        <div className="app-header-inner">
          {back && <Skeleton shape="block" width={48} height={48} radius={15} />}
          <div className="jsk-stack">
            <Skeleton width={84} height={11} />
            <Skeleton shape="title" width="min(22rem, 70%)" height={30} />
          </div>
        </div>
      </header>
      <main className="app-content">
        {children ?? <ProductGridSkeleton label={label} />}
      </main>
      {/* The real navigation stays put so the frame never flickers. */}
      <BottomNav />
    </div>
  );
}
