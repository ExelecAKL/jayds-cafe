"use client";

import { useEffect } from "react";

const DEV_CACHE_RESET_KEY = "cafeos-customer-dev-cache-reset";

export default function DevCacheReset() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    if (process.env.NODE_ENV !== "development") {
      return;
    }

    if (window.sessionStorage.getItem(DEV_CACHE_RESET_KEY) === "done") {
      return;
    }

    let cancelled = false;

    async function resetPwaCaches() {
      let didReset = false;

      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();

        await Promise.all(
          registrations.map(async (registration) => {
            const unregistered = await registration.unregister();
            didReset = didReset || unregistered;
          }),
        );
      }

      if ("caches" in window) {
        const cacheKeys = await window.caches.keys();

        await Promise.all(
          cacheKeys.map(async (cacheKey) => {
            const deleted = await window.caches.delete(cacheKey);
            didReset = didReset || deleted;
          }),
        );
      }

      if (cancelled) {
        return;
      }

      window.sessionStorage.setItem(DEV_CACHE_RESET_KEY, "done");

      if (didReset) {
        window.location.reload();
      }
    }

    void resetPwaCaches();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
