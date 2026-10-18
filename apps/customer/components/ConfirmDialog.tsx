"use client";
import { useEffect, useRef, useId, type ReactNode } from "react";
import { keepDialogFocus } from "./dialogFocus";
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Keep order",
  onConfirm,
  onCancel,
  busy = false,
  disabled = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onKeyDown={keepDialogFocus}
      className="native-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="p-6">
        <h2 className="section-title" id={titleId}>
          {title}
        </h2>
        <div className="mt-3 text-sm leading-relaxed text-text-secondary">
          {children}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            autoFocus
            type="button"
            disabled={busy}
            className="btn-secondary flex-1"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={busy || disabled}
            onClick={onConfirm}
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
