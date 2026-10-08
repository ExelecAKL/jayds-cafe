"use client";

export const ADMIN_PAGE_SIZE = 10;
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  controlsId?: string;
  label?: string;
  disabled?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  controlsId,
  label = "Pagination",
  disabled = false,
}: PaginationProps) {
  const pages = Math.max(1, totalPages);
  const page = Math.max(1, Math.min(currentPage, pages));
  const startItem = totalItems ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, totalItems);
  return (
    <nav className="admin-pagination" aria-label={label}>
      <p
        className="admin-pagination-summary"
        aria-live="polite"
        aria-atomic="true"
      >
        Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of{" "}
        <strong>{totalItems}</strong> entries
      </p>
      <div className="admin-pagination-controls">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          aria-controls={controlsId}
        >
          Previous
        </button>
        <span className="admin-page-number" aria-current="page">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= pages}
          aria-controls={controlsId}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
