"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CustomerBranch } from "@cafeos/shared/customer/types";
import { outletIsOpen } from "../utils/outletHours";
import Icon from "../components/Icon";

const OutletContext = createContext<{ canSelect: () => boolean }>({
  canSelect: () => true,
});
export const useOutletAvailability = () => useContext(OutletContext);
export function OutletAvailabilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [branch, setBranch] = useState<CustomerBranch | null>(null),
    [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    function refresh() {
      if (document.hidden) return;
      void fetch("/api/branch", { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!controller.signal.aborted && data?.name) setBranch(data);
        })
        .catch(() => {});
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  function canSelect() {
    if (outletIsOpen(branch) === false) {
      setOpen(true);
      return false;
    }
    return true;
  }
  return (
    <OutletContext.Provider value={{ canSelect }}>
      {children}
      <dialog
        ref={dialog}
        className="native-dialog outlet-closed-dialog"
        aria-labelledby="outlet-closed-title"
        onCancel={() => setOpen(false)}
      >
        <div className="p-6">
          <div className="closed-outlet-mark">
            <Icon name="clock" size={28} />
          </div>
          <p className="eyebrow">See you for your next cup</p>
          <h2 id="outlet-closed-title" className="section-title">
            The café is closed right now.
          </h2>
          <p className="mt-3 text-sm text-text-secondary">
            You can still browse our menu. Come back during opening hours to
            customize your order.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="btn-secondary flex-1"
              href="/menu"
              onClick={() => setOpen(false)}
            >
              Back to homepage
            </Link>
            <Link
              autoFocus
              className="btn-primary flex-1"
              href="/menu/browse"
              onClick={() => setOpen(false)}
            >
              View menu
            </Link>
          </div>
        </div>
      </dialog>
    </OutletContext.Provider>
  );
}
