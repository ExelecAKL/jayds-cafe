"use client";

import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { Pagination, ADMIN_PAGE_SIZE } from "./Pagination";

type ServerPagination = {
  currentPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
};
type Props = ComponentPropsWithoutRef<"table"> & {
  resetKey?: string | number;
  pagination?: ServerPagination;
};
type Section = ReactElement<{ children?: ReactNode }>;

function flattenRows(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? flattenRows(child.props.children)
      : typeof child === "string" && !child.trim()
        ? []
        : [child],
  );
}
function isPlaceholder(row: ReactNode) {
  if (!isValidElement<{ children?: ReactNode }>(row)) return false;
  const cells = Children.toArray(row.props.children);
  return (
    cells.length === 1 &&
    isValidElement<{ colSpan?: number }>(cells[0]) &&
    Number(cells[0].props.colSpan) > 1
  );
}

function TablePage({
  sections,
  body,
  rows,
  placeholders,
  pagination,
  tableProps,
}: {
  sections: ReactNode[];
  body?: Section;
  rows: ReactNode[];
  placeholders: ReactNode[];
  pagination?: ServerPagination;
  tableProps: ComponentPropsWithoutRef<"table">;
}) {
  const [page, setPage] = useState(1);
  const generatedId = useId();
  const tableId = tableProps.id ?? generatedId;
  const totalItems = pagination?.totalItems ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ADMIN_PAGE_SIZE));
  const currentPage = Math.max(
    1,
    Math.min(pagination?.currentPage ?? page, totalPages),
  );
  // Keep the local page valid when deletion or a refresh shrinks the result set.
  if (!pagination && page !== currentPage) setPage(currentPage);
  const visibleRows = pagination
    ? rows
    : rows.slice(
        (currentPage - 1) * ADMIN_PAGE_SIZE,
        currentPage * ADMIN_PAGE_SIZE,
      );
  const label = tableProps["aria-label"] ?? "Table";
  return (
    <div className="admin-paginated-table" data-paginated-table>
      <div className="admin-table-scroll">
        <table {...tableProps} id={tableId}>
          {sections.map((section) =>
            section === body && body
              ? cloneElement(
                  body,
                  {},
                  visibleRows.length ? visibleRows : placeholders,
                )
              : section,
          )}
        </table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={ADMIN_PAGE_SIZE}
        onPageChange={pagination?.onPageChange ?? setPage}
        controlsId={tableId}
        label={label + " pagination"}
        disabled={pagination?.loading}
      />
    </div>
  );
}

// Callers provide direct thead/tbody sections. Only the current page's tbody
// rows are mounted; row actions, keys, and controlled input state are preserved.
export function PaginatedTable({
  children,
  resetKey = "",
  pagination,
  ...tableProps
}: Props) {
  const sections = Children.toArray(children);
  const body = sections.find(
    (section): section is Section =>
      isValidElement<{ children?: ReactNode }>(section) &&
      section.type === "tbody",
  );
  const allRows = flattenRows(body?.props.children);
  return (
    <TablePage
      key={resetKey}
      sections={sections}
      body={body}
      rows={allRows.filter((row) => !isPlaceholder(row))}
      placeholders={allRows.filter(isPlaceholder)}
      pagination={pagination}
      tableProps={tableProps}
    />
  );
}
