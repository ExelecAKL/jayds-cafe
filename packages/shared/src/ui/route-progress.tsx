"use client";
// packages/shared/src/ui/route-progress.tsx
// A thin top bar that starts when someone follows an in-app link and completes
// when the new page's path arrives. Decorative: Next.js already announces the
// new route, so the bar stays hidden from assistive technology.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const START_EVENT = "jayds:navigation-start";
const CANCEL_EVENT = "jayds:navigation-cancel";
const SAFETY_TIMEOUT = 12_000;
const SETTLE_DELAY = 420;

/**
 * Call from a link's click handler when it prevents the navigation (for
 * example while ordering is closed). The bar's appearance delay means a
 * cancelled start is never seen.
 */
export function cancelNavigation() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(CANCEL_EVENT));
}

/** Call before router.push() so programmatic navigation shows progress too. */
export function announceNavigation(href?: string) {
  if (typeof window === "undefined") return;
  if (href) {
    try {
      const target = new URL(href, window.location.href);
      if (target.pathname === window.location.pathname) return;
    } catch {
      return;
    }
  }
  window.dispatchEvent(new Event(START_EVENT));
}

export function RouteProgress({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timers = useRef<{
    safety?: ReturnType<typeof setTimeout>;
    settle?: ReturnType<typeof setTimeout>;
  }>({});
  const finishRef = useRef<() => void>(() => undefined);
  const renderedPath = useRef<string | null>(null);

  useEffect(() => {
    const clear = () => {
      clearTimeout(timers.current.safety);
      clearTimeout(timers.current.settle);
    };
    const finish = () => {
      clear();
      setState((current) => (current === "idle" ? current : "done"));
      timers.current.settle = setTimeout(() => setState("idle"), SETTLE_DELAY);
    };
    const start = () => {
      clear();
      setState("loading");
      timers.current.safety = setTimeout(finish, SAFETY_TIMEOUT);
    };
    const cancel = () => {
      clear();
      setState("idle");
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      let target: URL;
      try {
        target = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (target.origin !== window.location.origin) return;
      if (target.pathname === window.location.pathname) return;
      start();
    };
    // Back and forward load a new page too; a hash or query change does not.
    const popstate = () => {
      if (window.location.pathname !== renderedPath.current) start();
    };
    finishRef.current = finish;
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", popstate);
    window.addEventListener(START_EVENT, start);
    window.addEventListener(CANCEL_EVENT, cancel);
    window.addEventListener("pagehide", clear);
    return () => {
      clear();
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", popstate);
      window.removeEventListener(START_EVENT, start);
      window.removeEventListener(CANCEL_EVENT, cancel);
      window.removeEventListener("pagehide", clear);
    };
  }, []);

  useEffect(() => {
    const first = renderedPath.current === null;
    renderedPath.current = window.location.pathname;
    if (!first) finishRef.current();
  }, [pathname]);

  return (
    <div
      aria-hidden="true"
      className={`jm-route-progress ${className}`}
      data-state={state}
    >
      <span />
    </div>
  );
}
