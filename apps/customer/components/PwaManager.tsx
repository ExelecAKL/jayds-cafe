"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
export default function PwaManager() {
  const path = usePathname(),
    [online, setOnline] = useState(true),
    [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    queueMicrotask(update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    let active = true;
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      void navigator.serviceWorker
        .getRegistration()
        .then(
          (reg) =>
            reg ?? navigator.serviceWorker.register("/sw.js", { scope: "/" }),
        )
        .then((reg) => {
          if (!reg || !active) return;
          if (reg.waiting) setWaiting(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            worker?.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller &&
                active
              )
                setWaiting(worker);
            });
          });
        })
        .catch(() => {
          // Private browsing, policy restrictions or outages may prevent a
          // worker. Online ordering remains usable and device drafts survive.
        });
    return () => {
      active = false;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const paymentInProgress =
    path.startsWith("/checkout") || path.startsWith("/orders/");
  return (
    <>
      {!online && (
        <div
          role="status"
          className="app-notice-enter bg-[#38291f] px-4 py-2 text-center text-sm text-white"
        >
          Offline · Browse your saved menu and edit your bag. Reconnect to
          confirm sales.
        </div>
      )}
      {waiting && !paymentInProgress && (
        <div className="app-notice-enter fixed bottom-24 right-4 z-[70] max-w-xs rounded-2xl border border-border bg-bg-card p-4 shadow-xl">
          <p className="text-sm">
            A Jayds update is ready. Your draft is saved.
          </p>
          <button
            className="btn-primary mt-3 min-h-12 w-full"
            onClick={() => {
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => window.location.reload(),
                { once: true },
              );
              waiting.postMessage({ type: "SKIP_WAITING" });
            }}
          >
            Update app
          </button>
          <Link
            href="/notifications"
            className="mt-2 block text-center text-xs underline"
          >
            App settings
          </Link>
        </div>
      )}
    </>
  );
}
