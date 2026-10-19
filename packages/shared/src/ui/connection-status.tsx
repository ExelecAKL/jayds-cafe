"use client";
// packages/shared/src/ui/connection-status.tsx
// Connection awareness for phones on mobile data. One small banner says when
// the device is offline, when the line is slow, and when it is back. Signals
// come from the browser (online/offline, Network Information API, Data Saver)
// and from request timing reported by browserFetch.
import { useEffect, useRef, useState } from "react";

export type NetworkQuality = "ok" | "slow" | "offline";

type NetworkInformation = EventTarget & {
  effectiveType?: string;
  saveData?: boolean;
  rtt?: number;
};
function connection(): NetworkInformation | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation })
    .connection;
}
/** The browser's own hint: 2G-class networks or a very long round trip. */
function hintedSlow() {
  const info = connection();
  if (!info) return false;
  return (
    info.effectiveType === "slow-2g" ||
    info.effectiveType === "2g" ||
    (typeof info.rtt === "number" && info.rtt >= 1_200)
  );
}
/** True when the person turned on Data Saver or the network is 2G-class. */
export function prefersLightData() {
  return !!connection()?.saveData || hintedSlow();
}

const SLOW_HOLD = 25_000;
const ERROR_WINDOW = 30_000;

/** Live network quality for components that adapt (for example, maps). */
export function useNetworkQuality(): NetworkQuality {
  const [quality, setQuality] = useState<NetworkQuality>("ok");
  useEffect(() => {
    let slowUntil = 0;
    let quick = 0;
    const errors: number[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const evaluate = () => {
      clearTimeout(timer);
      if (!navigator.onLine) return setQuality("offline");
      const now = Date.now();
      while (errors.length && now - errors[0] > ERROR_WINDOW) errors.shift();
      const slow = hintedSlow() || now < slowUntil || errors.length >= 2;
      setQuality(slow ? "slow" : "ok");
      if (now < slowUntil) timer = setTimeout(evaluate, slowUntil - now + 50);
    };
    const onSlow = () => {
      quick = 0;
      slowUntil = Date.now() + SLOW_HOLD;
      evaluate();
    };
    const onOk = () => {
      // Two quick answers in a row mean the line recovered.
      if (++quick >= 2) {
        slowUntil = 0;
        errors.length = 0;
      }
      evaluate();
    };
    const onError = () => {
      quick = 0;
      errors.push(Date.now());
      evaluate();
    };
    const info = connection();
    queueMicrotask(evaluate);
    window.addEventListener("online", evaluate);
    window.addEventListener("offline", evaluate);
    window.addEventListener("jayds:network-slow", onSlow);
    window.addEventListener("jayds:network-ok", onOk);
    window.addEventListener("jayds:network-error", onError);
    info?.addEventListener?.("change", evaluate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", evaluate);
      window.removeEventListener("offline", evaluate);
      window.removeEventListener("jayds:network-slow", onSlow);
      window.removeEventListener("jayds:network-ok", onOk);
      window.removeEventListener("jayds:network-error", onError);
      info?.removeEventListener?.("change", evaluate);
    };
  }, []);
  return quality;
}

export type ConnectionCopy = {
  offline: string;
  slow: string;
  restored?: string;
};

export function ConnectionStatus({
  copy,
  className = "",
}: {
  copy: ConnectionCopy;
  className?: string;
}) {
  const quality = useNetworkQuality();
  const [restored, setRestored] = useState(false);
  const [dismissedSlow, setDismissedSlow] = useState(false);
  const [stillOffline, setStillOffline] = useState(false);
  const previous = useRef<NetworkQuality>("ok");

  useEffect(() => {
    const before = previous.current;
    previous.current = quality;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (before === "offline" && quality !== "offline") {
      void Promise.resolve().then(() => setRestored(true));
      timer = setTimeout(() => setRestored(false), 3_200);
    }
    if (quality === "ok") void Promise.resolve().then(() => setDismissedSlow(false));
    document.documentElement.dataset.network = quality;
    return () => clearTimeout(timer);
  }, [quality]);

  const retry = () => {
    if (!navigator.onLine) {
      setStillOffline(true);
      setTimeout(() => setStillOffline(false), 3_000);
      return;
    }
    // Data screens refresh on these events already.
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
  };

  const state =
    quality === "offline"
      ? "offline"
      : restored
        ? "restored"
        : quality === "slow" && !dismissedSlow
          ? "slow"
          : "hidden";

  return (
    <div
      className={`jcs ${className}`}
      data-state={state}
      role="status"
      aria-live="polite"
    >
      {state !== "hidden" && (
        <div className="jcs-pill" key={state}>
          <span className="jcs-icon" aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {state === "restored" ? (
                <path d="m5 12 4 4L19 6" />
              ) : state === "slow" ? (
                <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16" />
              ) : (
                <path d="M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.8M15.5 10.6a10 10 0 0 1 3.5 2.3M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" />
              )}
            </svg>
          </span>
          <span className="jcs-text">
            {state === "offline"
              ? stillOffline
                ? "Still offline. Check Wi-Fi or mobile data."
                : copy.offline
              : state === "slow"
                ? copy.slow
                : (copy.restored ?? "Back online.")}
          </span>
          {state === "offline" && (
            <button type="button" className="jcs-action" onClick={retry}>
              Try again
            </button>
          )}
          {state === "slow" && (
            <button
              type="button"
              className="jcs-close"
              aria-label="Dismiss slow connection notice"
              onClick={() => setDismissedSlow(true)}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
