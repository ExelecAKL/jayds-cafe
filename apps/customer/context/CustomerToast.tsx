"use client";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Icon, { type IconName } from "../components/Icon";

export type ToastTone = "success" | "info" | "error";
export type ToastOptions = {
  tone?: ToastTone;
  /** A single follow-up, such as "View bag" or "Undo". */
  action?: { label: string; href?: string; onClick?: () => void };
  icon?: IconName;
};
type Notify = (text: string, options?: ToastOptions) => void;

const Toast = createContext<Notify>(() => {});
const toneIcon: Record<ToastTone, IconName> = {
  success: "check",
  info: "info",
  error: "warning",
};

export function CustomerToastProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{
    text: string;
    id: number;
    leaving: boolean;
    tone: ToastTone;
    icon: IconName;
    action?: ToastOptions["action"];
  } | null>(null);
  const sequence = useRef(0);
  const notify = useCallback<Notify>(
    (text, options = {}) =>
      setNotice({
        text,
        id: ++sequence.current,
        leaving: false,
        tone: options.tone ?? "success",
        icon: options.icon ?? toneIcon[options.tone ?? "success"],
        action: options.action,
      }),
    [],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => {
        setNotice((current) =>
          current?.id !== notice.id
            ? current
            : notice.leaving
              ? null
              : { ...current, leaving: true },
        );
      },
      notice.leaving ? 500 : 5000,
    );
    return () => clearTimeout(timer);
  }, [notice]);

  // Connection changes are shown by the shared connection banner instead.
  const dismiss = () =>
    setNotice((current) => (current ? { ...current, leaving: true } : current));

  return (
    <Toast.Provider value={notify}>
      {children}
      <div
        className="customer-toast-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {notice && (
          <div
            key={notice.id}
            className={`customer-toast tone-${notice.tone}`}
            data-state={notice.leaving ? "leaving" : "visible"}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget && notice.leaving)
                setNotice((current) =>
                  current?.id === notice.id ? null : current,
                );
            }}
          >
            <span className="customer-toast-icon" aria-hidden="true">
              <Icon name={notice.icon} size={18} />
            </span>
            <p>{notice.text}</p>
            {notice.action &&
              (notice.action.href ? (
                <Link
                  href={notice.action.href}
                  className="customer-toast-action"
                  onClick={() => {
                    notice.action?.onClick?.();
                    dismiss();
                  }}
                >
                  {notice.action.label}
                </Link>
              ) : (
                <button
                  type="button"
                  className="customer-toast-action"
                  onClick={() => {
                    notice.action?.onClick?.();
                    dismiss();
                  }}
                >
                  {notice.action.label}
                </button>
              ))}
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={dismiss}
            >
              <Icon name="close" size={18} />
            </button>
            <span className="customer-toast-timer" aria-hidden="true" />
          </div>
        )}
      </div>
    </Toast.Provider>
  );
}
export const useCustomerToast = () => useContext(Toast);
