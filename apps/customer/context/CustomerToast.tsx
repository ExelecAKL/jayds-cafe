"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Icon from "../components/Icon";
const Toast = createContext<(text: string) => void>(() => {});
export function CustomerToastProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(
    null,
  );
  const notify = useCallback(
    (text: string) => setNotice({ text, id: Date.now() }),
    [],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
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
          <div className="customer-toast">
            <Icon name="check" size={20} />
            <p>{notice.text}</p>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setNotice(null)}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
      </div>
    </Toast.Provider>
  );
}
export const useCustomerToast = () => useContext(Toast);
