"use client";
import Link from "next/link";
import { Icon, type IconName } from "./Operations";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Tone = "error" | "success" | "info" | "warning";
type Action = { label: string; href: string };
type Toast = {
  id: number;
  message: string;
  tone: Tone;
  action?: Action;
  leaving: boolean;
};
const toneIcon: Record<Tone, IconName> = {
  success: "check",
  error: "alert",
  warning: "alert",
  info: "bell",
};
const toneLabel: Record<Tone, string> = {
  success: "Done",
  error: "Problem",
  warning: "Heads up",
  info: "Update",
};
// Errors stay long enough to read twice; confirmations get out of the way.
const lifetime: Record<Tone, number> = {
  success: 5000,
  info: 6500,
  warning: 8000,
  error: 10000,
};
const EXIT = 220;

export function notifyAdmin(
  message: string,
  tone: Tone = "info",
  options: { action?: Action } = {},
) {
  window.dispatchEvent(
    new CustomEvent("jayds-admin-toast", {
      detail: { message, tone, action: options.action },
    }),
  );
}

function ToastCard({
  toast,
  dismiss,
}: {
  toast: Toast;
  dismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(lifetime[toast.tone]);
  const started = useRef(0);
  useEffect(() => {
    if (paused || toast.leaving) return;
    started.current = Date.now();
    const timer = window.setTimeout(
      () => dismiss(toast.id),
      remaining.current,
    );
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started.current),
      );
    };
  }, [toast, paused, dismiss]);
  return (
    <div
      className={`admin-toast ${toast.tone}${toast.leaving ? " is-leaving" : ""}${paused ? " is-paused" : ""}`}
      role={toast.tone === "error" ? "alert" : "status"}
      style={{ "--toast-life": `${lifetime[toast.tone]}ms` } as React.CSSProperties}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <span className="admin-toast-mark" aria-hidden="true">
        <Icon name={toneIcon[toast.tone]} size={16} />
      </span>
      <div className="admin-toast-copy">
        <strong>{toneLabel[toast.tone]}</strong>
        <p>{toast.message}</p>
      </div>
      {toast.action && (
        <Link
          href={toast.action.href}
          className="admin-toast-action"
          onClick={() => dismiss(toast.id)}
        >
          {toast.action.label}
        </Link>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        className="admin-toast-close"
        onClick={() => dismiss(toast.id)}
      >
        <Icon name="close" size={16} />
      </button>
      <span className="admin-toast-timer" aria-hidden="true" />
    </div>
  );
}

export function AdminToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const dismiss = useCallback((id: number) => {
    setToasts((items) =>
      items.map((item) => (item.id === id ? { ...item, leaving: true } : item)),
    );
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(
      () => setToasts((items) => items.filter((item) => item.id !== id)),
      reduced ? 0 : EXIT,
    );
  }, []);
  const show = useCallback((message: string, tone: Tone, action?: Action) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    const id = ++nextId.current;
    setToasts((items) =>
      items.some(
        (item) => !item.leaving && item.message === trimmed && item.tone === tone,
      )
        ? items
        : [
            ...items.filter((item) => !item.leaving).slice(-2),
            { id, message: trimmed, tone, action, leaving: false },
          ],
    );
  }, []);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (
        event as CustomEvent<{ message?: string; tone?: Tone; action?: Action }>
      ).detail;
      if (typeof detail?.message === "string")
        show(detail.message, detail.tone ?? "info", detail.action);
    };
    // Existing inline feedback remains beside the form. Surface it once as a toast
    // across legacy and shared Admin components, without changing their save logic.
    const seen = new WeakMap<Element, string>();
    const scan = () =>
      document
        .querySelectorAll(
          '[role="alert"],.ops-feedback.success,[data-admin-success]',
        )
        .forEach((node) => {
          if (node.closest("[data-admin-toasts]")) return;
          const message = ((node as HTMLElement).innerText ?? node.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim();
          if (!message || !node.getClientRects().length || seen.get(node) === message)
            return;
          seen.set(node, message);
          show(message, node.getAttribute("role") === "alert" ? "error" : "success");
        });
    const observer = new MutationObserver(scan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "open"],
    });
    let invalidTimer: number | undefined;
    const invalid = (event: Event) => {
      if (invalidTimer !== undefined) return;
      const field = event.target as HTMLInputElement;
      const labelCopy = field.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
      labelCopy
        ?.querySelectorAll("[data-field-requirement],input,select,textarea")
        .forEach((node) => node.remove());
      const label =
        labelCopy?.textContent?.replace(/\s+/g, " ").trim() ||
        field.getAttribute("aria-label") ||
        field.name ||
        "Required field";
      show(`${label}: ${field.validationMessage || "Please check this field."}`, "error");
      invalidTimer = window.setTimeout(() => {
        invalidTimer = undefined;
      }, 0);
    };
    // Connection changes are shown by the shared connection banner.
    window.addEventListener("jayds-admin-toast", receive);
    document.addEventListener("invalid", invalid, true);
    scan();
    return () => {
      observer.disconnect();
      window.removeEventListener("jayds-admin-toast", receive);
      document.removeEventListener("invalid", invalid, true);
      window.clearTimeout(invalidTimer);
    };
  }, [show]);
  return (
    <>
      {children}
      <aside data-admin-toasts className="admin-toasts" aria-label="Notifications">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </aside>
    </>
  );
}
