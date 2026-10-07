"use client";
import { useEffect, useRef, type ReactNode } from "react";
const paths: Record<string, ReactNode> = {
  register: (
    <>
      <rect x="3" y="3" width="18" height="13" rx="2" />
      <path d="M7 21h10M12 16v5M7 7h4M7 11h8" />
    </>
  ),
  orders: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 12h6M9 17h4" />
    </>
  ),
  tv: (
    <>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 22h8M12 18v4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  left: <path d="m15 5-7 7 7 7" />,
  right: <path d="m9 5 7 7-7 7" />,
  check: <path d="m4 12 5 5L20 6" />,
  edit: (
    <>
      <path d="m14 5 5 5M4 20l4-1 12-12a2 2 0 0 0-4-4L4 15z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
    </>
  ),
  scan: (
    <>
      <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M3 12h18" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-3a8 8 0 0 1 16 0v3" />
    </>
  ),
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </>
  ),
  coffee: (
    <>
      <path d="M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM17 9h1a3 3 0 0 1 0 6h-1M6 2v3M10 2v3M14 2v3" />
    </>
  ),
  delivery: (
    <>
      <path d="M3 5h11v13H3zM14 9h4l3 4v5h-7M14 13h7" />
      <circle cx="7" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15" />
    </>
  ),
  logout: (
    <>
      <path d="M9 4H4v16h5M13 8l4 4-4 4M8 12h12" />
    </>
  ),
  fullscreen: <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />,
  volume: (
    <>
      <path d="m3 9 4 0 5-5v16l-5-5H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M3 9h18M16 14h5" />
    </>
  ),
  note: (
    <>
      <path d="M4 3h16v18H4zM8 7h8M8 12h8M8 17h5" />
    </>
  ),
  warning: (
    <>
      <path d="m12 3 10 18H2zM12 9v5M12 17h.01" />
    </>
  ),
};
export function PosIcon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.orders}
    </svg>
  );
}
export function PosDialog({
  title,
  children,
  onClose,
  wide = false,
  locked = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  locked?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null),
    close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const node = panel.current;
    node?.querySelector<HTMLElement>("button,input,textarea,select")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab" && node) {
        const buttons = [
          ...node.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
          ),
        ].filter((i) => i.getClientRects().length > 0);
        const first = buttons[0],
          last = buttons.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, [locked]);
  return (
    <div
      className="pos-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"pos-dialog " + (wide ? "pos-dialog-wide" : "")}
      >
        <header className="pos-dialog-header">
          <h2>{title}</h2>
          <button
            className="pos-icon-button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={locked}
          >
            <PosIcon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function PosConfirm({
  title,
  message,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <PosDialog title={title} onClose={onCancel}>
      <div className="pos-dialog-body">
        <p>{message}</p>
      </div>
      <footer className="pos-dialog-footer">
        <button className="pos-button" onClick={onCancel}>
          Keep ticket
        </button>
        <button className="pos-button pos-danger" onClick={onConfirm}>
          Confirm
        </button>
      </footer>
    </PosDialog>
  );
}
