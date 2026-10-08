"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Confirmation = {
  title: string;
  description: string;
  details?: string[];
  confirmLabel: string;
  danger?: boolean;
};
const Context = createContext<
  ((options: Confirmation) => Promise<boolean>) | null
>(null);

/** Resolves before the caller writes. Closing or unmounting always cancels. */
export function ActionConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Confirmation | null>(null);
  const resolver = useRef<((accepted: boolean) => void) | null>(null);
  const panel = useRef<HTMLElement>(null);
  const titleId = useId(),
    descriptionId = useId();
  const finish = useCallback((accepted: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(accepted);
  }, []);
  const confirm = useCallback((options: Confirmation) => {
    if (resolver.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setRequest(options);
    });
  }, []);
  useEffect(
    () => () => {
      resolver.current?.(false);
      resolver.current = null;
    },
    [],
  );
  useEffect(() => {
    if (!request) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      // Parent drawers must not close or move focus beneath this confirmation.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(false);
      }
      if (event.key === "Tab") {
        event.stopImmediatePropagation();
        const controls = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled)",
          ) ?? [],
        );
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("keydown", keyboard, true);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [request, finish]);
  return (
    <Context.Provider value={confirm}>
      {children}
      {request &&
        createPortal(
          <div className="jayds-confirm-overlay">
            <section
              ref={panel}
              className="jayds-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
            >
              <span className="jayds-confirm-eyebrow">
                Review before saving
              </span>
              <h2 id={titleId}>{request.title}</h2>
              <p id={descriptionId}>{request.description}</p>
              {!!request.details?.length && (
                <ul>
                  {request.details.map((detail, i) => (
                    <li key={i}>{detail}</li>
                  ))}
                </ul>
              )}
              <footer>
                <button onClick={() => finish(false)}>Go back</button>
                <button
                  className={request.danger ? "is-danger" : "is-primary"}
                  onClick={() => finish(true)}
                >
                  {request.confirmLabel}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </Context.Provider>
  );
}
export function useActionConfirm() {
  const confirm = useContext(Context);
  if (!confirm) throw new Error("ActionConfirmProvider is required");
  return confirm;
}
