// apps/admin/components/AdminSkeletons.tsx
// Shape-matched placeholders for the back office: tables keep their column
// rhythm, metrics keep their tiles, drawers keep their sections. Every
// placeholder is one polite status region; the shapes themselves are hidden.
import type { CSSProperties, ReactNode } from "react";
import {
  Skeleton,
  SkeletonStatus,
  SkeletonText,
  repeat,
} from "@cafeos/shared/ui/skeleton";

export { Skeleton, SkeletonStatus, SkeletonText };

type Column = "title" | "text" | "badge" | "number" | "action" | "media";

// Widths cycle so neighbouring rows never line up into stripes.
const cellWidths: Record<Column, string[]> = {
  title: ["74%", "58%", "66%", "82%", "52%"],
  text: ["62%", "48%", "70%", "40%", "56%"],
  badge: ["4.75rem", "5.5rem", "4.25rem", "6rem", "5rem"],
  number: ["3.75rem", "4.5rem", "3.25rem", "5rem", "4rem"],
  action: ["4.5rem", "4.5rem", "4.5rem", "4.5rem", "4.5rem"],
  media: ["2.5rem", "2.5rem", "2.5rem", "2.5rem", "2.5rem"],
};

const defaultColumns: Column[] = ["title", "text", "badge", "number"];

function Cell({ kind, row }: { kind: Column; row: number }) {
  const width = cellWidths[kind][row % 5];
  if (kind === "title")
    return (
      <span className="ask-cell ask-cell-title">
        <Skeleton width={width} height={13} />
        <Skeleton width={`calc(${width} - 22%)`} height={10} />
      </span>
    );
  if (kind === "badge")
    return (
      <span className="ask-cell">
        <Skeleton shape="pill" width={width} height={22} />
      </span>
    );
  if (kind === "action")
    return (
      <span className="ask-cell ask-cell-end">
        <Skeleton shape="block" width={width} height={32} radius={8} />
      </span>
    );
  if (kind === "media")
    return (
      <span className="ask-cell">
        <Skeleton shape="block" width={40} height={40} radius={8} />
      </span>
    );
  return (
    <span className={`ask-cell${kind === "number" ? " ask-cell-end" : ""}`}>
      <Skeleton width={width} height={12} />
    </span>
  );
}

/** A table placeholder whose columns match the real table. */
export function TableSkeleton({
  label = "Loading records",
  rows = 6,
  columns = defaultColumns,
  header = true,
  className = "",
}: {
  label?: string | null;
  rows?: number;
  columns?: Column[];
  header?: boolean;
  className?: string;
}) {
  return (
    <SkeletonStatus label={label} className={`ask-table-frame ${className}`}>
      <TableRows rows={rows} columns={columns} header={header} />
    </SkeletonStatus>
  );
}

export function MetricsSkeleton({
  count = 4,
  label = "Loading summary",
}: {
  count?: number;
  label?: string | null;
}) {
  return (
    <SkeletonStatus label={label} className="ops-metrics">
      <MetricTiles count={count} />
    </SkeletonStatus>
  );
}

function MetricTiles({ count }: { count: number }) {
  return repeat(count, (index) => (
    <div className="ops-metric ask-metric" key={index} aria-hidden="true">
      <span className="ask-metric-label">
        <Skeleton width={["6rem", "5rem", "6.5rem", "4.5rem"][index % 4]} height={11} />
        <Skeleton shape="circle" width={18} height={18} />
      </span>
      <Skeleton width={["7rem", "4.5rem", "5.5rem", "6rem"][index % 4]} height={28} />
      <Skeleton width="70%" height={10} />
    </div>
  ));
}

export function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="ops-page-header ask-header" aria-hidden="true">
      <div className="ask-header-copy">
        <Skeleton width="5rem" height={10} />
        <Skeleton shape="title" width="min(18rem, 70vw)" height={36} />
        <Skeleton width="min(30rem, 84vw)" height={13} />
      </div>
      {actions > 0 && (
        <div className="ops-header-actions">
          {repeat(actions, (index) => (
            <Skeleton
              key={index}
              shape="block"
              width={index === actions - 1 ? "8.5rem" : "6.5rem"}
              height={44}
              radius={10}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ToolbarSkeleton({ controls = 2 }: { controls?: number }) {
  return (
    <div className="ops-toolbar ask-toolbar" aria-hidden="true">
      <Skeleton shape="block" height={44} radius={10} className="ask-search" />
      {repeat(controls, (index) => (
        <Skeleton
          key={index}
          shape="block"
          width={index ? "8rem" : "9.5rem"}
          height={44}
          radius={10}
        />
      ))}
    </div>
  );
}

/** A whole workspace: header, optional metrics, toolbar and table. */
export function PageSkeleton({
  label = "Loading this page",
  metrics = 0,
  columns,
  rows = 7,
  tabs = 0,
  actions = 1,
  toolbar = 2,
}: {
  label?: string | null;
  metrics?: number;
  columns?: Column[];
  rows?: number;
  tabs?: number;
  actions?: number;
  toolbar?: number;
}) {
  return (
    <SkeletonStatus label={label} className="ask-page">
      <HeaderSkeleton actions={actions} />
      {metrics > 0 && (
        <div className="ops-metrics" aria-hidden="true">
          <MetricTiles count={metrics} />
        </div>
      )}
      {tabs > 0 && (
        <div className="ops-tabs ask-tabs" aria-hidden="true">
          {repeat(tabs, (index) => (
            <Skeleton
              key={index}
              shape="block"
              width={["5.5rem", "6.5rem", "5rem", "7rem", "6rem"][index % 5]}
              height={36}
              radius={8}
            />
          ))}
        </div>
      )}
      <section className="ops-panel" aria-hidden="true">
        {toolbar > 0 && <ToolbarSkeleton controls={toolbar - 1} />}
        <div className="ask-table-frame">
          <TableRows rows={rows} columns={columns} />
        </div>
      </section>
    </SkeletonStatus>
  );
}

/** Table rows without their own status region, for use inside a placeholder. */
function TableRows({
  rows,
  columns = defaultColumns,
  header = true,
}: {
  rows: number;
  columns?: Column[];
  header?: boolean;
}) {
  const template = columns
    .map((kind) =>
      kind === "title"
        ? "minmax(9rem, 2fr)"
        : kind === "media"
          ? "2.5rem"
          : kind === "action" || kind === "number"
            ? "minmax(4.5rem, 0.8fr)"
            : "minmax(5rem, 1fr)",
    )
    .join(" ");
  return (
    <div
      className="ask-table"
      aria-hidden="true"
      style={{ "--ask-columns": template } as CSSProperties}
    >
      {header && (
        <div className="ask-row ask-head">
          {columns.map((kind, index) => (
            <span
              key={index}
              className={`ask-cell${kind === "number" || kind === "action" ? " ask-cell-end" : ""}`}
            >
              {kind !== "media" && (
                <Skeleton width={kind === "title" ? "4.5rem" : "3.25rem"} height={9} />
              )}
            </span>
          ))}
        </div>
      )}
      {repeat(rows, (row) => (
        <div className="ask-row" key={row}>
          {columns.map((kind, index) => (
            <Cell key={index} kind={kind} row={row + index} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Drawer and modal bodies: a title block, a key/value grid and a list. */
export function DetailSkeleton({
  label = "Loading details",
  fields = 6,
  lines = 3,
}: {
  label?: string | null;
  fields?: number;
  lines?: number;
}) {
  return (
    <SkeletonStatus label={label} className="ask-detail">
      <div className="ask-detail-head" aria-hidden="true">
        <div className="jsk-stack">
          <Skeleton shape="title" width="52%" height={24} />
          <Skeleton width="34%" height={11} />
        </div>
        <Skeleton shape="pill" width="5.5rem" height={26} />
      </div>
      <div className="ask-detail-grid" aria-hidden="true">
        {repeat(fields, (index) => (
          <div key={index} className="ask-field">
            <Skeleton width={["4rem", "5.5rem", "3.5rem", "6rem", "4.5rem", "5rem"][index % 6]} height={10} />
            <Skeleton width={["70%", "55%", "80%", "45%", "62%", "50%"][index % 6]} height={14} />
          </div>
        ))}
      </div>
      <div className="ask-detail-list" aria-hidden="true">
        {repeat(lines, (index) => (
          <div className="ask-line" key={index}>
            <Skeleton shape="block" width={40} height={40} radius={8} />
            <div className="jsk-stack">
              <Skeleton width={["58%", "44%", "66%"][index % 3]} height={13} />
              <Skeleton width={["36%", "48%", "30%"][index % 3]} height={10} />
            </div>
            <Skeleton width="4rem" height={13} />
          </div>
        ))}
      </div>
    </SkeletonStatus>
  );
}

export function FormSkeleton({
  label = "Loading form",
  sections = 2,
  fields = 4,
}: {
  label?: string | null;
  sections?: number;
  fields?: number;
}) {
  return (
    <SkeletonStatus label={label} className="ask-form">
      {repeat(sections, (section) => (
        <div className="ops-form-section" key={section} aria-hidden="true">
          <Skeleton shape="title" width={section ? "9rem" : "12rem"} height={20} />
          <div className="ask-form-grid">
            {repeat(fields, (index) => (
              <div className="ask-field" key={index}>
                <Skeleton width={["5rem", "6.5rem", "4rem", "7rem"][index % 4]} height={11} />
                <Skeleton shape="block" height={44} radius={10} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonStatus>
  );
}

export function ChartSkeleton({
  label = "Loading chart",
  bars = 12,
}: {
  /** Pass null inside another placeholder so only one region announces. */
  label?: string | null;
  bars?: number;
}) {
  // A gentle, deterministic skyline so the placeholder reads as a chart.
  const heights = [42, 58, 50, 66, 54, 72, 61, 78, 64, 70, 56, 82, 68, 60];
  const shapes = (
    <>
      <div className="ask-chart-plot" aria-hidden="true">
        {repeat(bars, (index) => (
          <Skeleton
            key={index}
            shape="block"
            radius={6}
            height={`${heights[index % heights.length]}%`}
            className="ask-bar"
          />
        ))}
      </div>
      <div className="ask-chart-axis" aria-hidden="true">
        {repeat(6, (index) => (
          <Skeleton key={index} width="2.25rem" height={9} />
        ))}
      </div>
    </>
  );
  if (label === null)
    return (
      <div className="ask-chart" aria-hidden="true">
        {shapes}
      </div>
    );
  return (
    <SkeletonStatus label={label} className="ask-chart">
      {shapes}
    </SkeletonStatus>
  );
}

/** Card grids such as vouchers. */
export function CardGridSkeleton({
  label = "Loading",
  count = 6,
}: {
  label?: string | null;
  count?: number;
}) {
  return (
    <SkeletonStatus label={label} className="ask-cards">
      {repeat(count, (index) => (
        <div className="ops-panel ask-card" key={index} aria-hidden="true">
          <div className="ask-card-head">
            <Skeleton shape="title" width={["7rem", "5.5rem", "8rem"][index % 3]} height={22} />
            <Skeleton shape="pill" width="4.5rem" height={22} />
          </div>
          <SkeletonText lines={2} height={11} lastWidth="60%" />
          <div className="ask-card-foot">
            <Skeleton width="5rem" height={11} />
            <Skeleton shape="block" width="5.5rem" height={34} radius={8} />
          </div>
        </div>
      ))}
    </SkeletonStatus>
  );
}

/** The signed-in frame while access is verified: sidebar, topbar, page. */
export function ShellSkeleton({ children }: { children?: ReactNode }) {
  return (
    <div className="admin-shell ask-shell">
      <aside className="ops-sidebar ask-sidebar" aria-hidden="true">
        <div className="ask-brand">
          <Skeleton shape="block" width={36} height={36} radius={10} />
          <div className="jsk-stack">
            <Skeleton width="6.5rem" height={14} />
            <Skeleton width="4.5rem" height={9} />
          </div>
        </div>
        {repeat(4, (group) => (
          <div className="ask-nav-group" key={group}>
            <Skeleton width="3.5rem" height={9} />
            {repeat(group === 0 ? 4 : 3, (item) => (
              <div className="ask-nav-item" key={item}>
                <Skeleton shape="block" width={18} height={18} radius={5} />
                <Skeleton width={["7rem", "5.5rem", "6.5rem", "5rem"][(item + group) % 4]} height={12} />
              </div>
            ))}
          </div>
        ))}
      </aside>
      <div className="ops-main">
        <header className="ops-topbar ask-topbar" aria-hidden="true">
          <Skeleton width="10rem" height={13} />
          <div className="ask-topbar-right">
            <Skeleton shape="block" width="12rem" height={40} radius={10} className="ask-jump" />
            <Skeleton shape="circle" width={36} height={36} />
            <Skeleton shape="circle" width={36} height={36} />
          </div>
        </header>
        <main>
          {children ?? <PageSkeleton label="Opening Admin" metrics={4} />}
        </main>
      </div>
    </div>
  );
}
