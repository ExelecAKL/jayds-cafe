"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Tone = "error" | "success" | "info";
type Toast = { id: number; message: string; tone: Tone };
export function notifyAdmin(message: string, tone: Tone = "info") {
  window.dispatchEvent(new CustomEvent("jayds-admin-toast", { detail: { message, tone } }));
}
function ToastCard({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => dismiss(toast.id), toast.tone === "error" ? 10000 : 6000);
    return () => window.clearTimeout(timer);
  }, [toast, paused, dismiss]);
  return <div className={`admin-toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <span className="admin-toast-mark" aria-hidden="true">{toast.tone === "error" ? "!" : toast.tone === "success" ? "✓" : "i"}</span>
    <p>{toast.message}</p>
    <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>×</button>
  </div>;
}
export function AdminToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const dismiss = useCallback((id: number) => setToasts(items => items.filter(item => item.id !== id)), []);
  const show = useCallback((message: string, tone: Tone) => {
    const trimmed = message.trim(); if (!trimmed) return;
    const id = ++nextId.current;
    setToasts(items => items.some(item => item.message === trimmed && item.tone === tone) ? items : [...items.slice(-2), { id, message: trimmed, tone }]);
  }, []);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; tone?: Tone }>).detail;
      if (typeof detail?.message === "string") show(detail.message, detail.tone ?? "info");
    };
    // Existing inline feedback remains beside the form. Surface it once as a toast
    // across legacy and shared Admin components, without changing their save logic.
    const seen = new WeakMap<Element, string>();
    const scan = () => document.querySelectorAll('[role="alert"],.ops-feedback.success,[data-admin-success]').forEach(node => {
      if (node.closest('[data-admin-toasts]')) return;
      const message = node.textContent?.trim() ?? "";
      if (!message || !node.getClientRects().length || seen.get(node) === message) return;
      seen.set(node, message);
      show(message, node.getAttribute("role") === "alert" ? "error" : "success");
    });
    const observer = new MutationObserver(scan); observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "aria-hidden", "open"] });
    let invalidTimer: number | undefined;
    const invalid = (event: Event) => {
      if (invalidTimer !== undefined) return;
      const field = event.target as HTMLInputElement;
      const labelCopy = field.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
      labelCopy?.querySelectorAll('[data-field-requirement],input,select,textarea').forEach(node => node.remove());
      const label = labelCopy?.textContent?.replace(/\s+/g, " ").trim() || field.getAttribute("aria-label") || field.name || "Required field";
      show(`${label}: ${field.validationMessage || "Please check this field."}`, "error");
      invalidTimer = window.setTimeout(() => { invalidTimer = undefined; }, 0);
    };
    window.addEventListener("jayds-admin-toast", receive); document.addEventListener("invalid", invalid, true); scan();
    return () => { observer.disconnect(); window.removeEventListener("jayds-admin-toast", receive); document.removeEventListener("invalid", invalid, true); window.clearTimeout(invalidTimer); };
  }, [show]);
  return <>{children}<aside data-admin-toasts className="admin-toasts" aria-label="Notifications">
    {toasts.map(toast => <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />)}
  </aside></>;
}
