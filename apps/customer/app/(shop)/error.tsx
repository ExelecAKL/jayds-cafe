"use client";
// A screen that fails to load gets a calm way back instead of a blank page.
// Weak mobile data is the usual cause, so the copy says so when offline.
import { useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "../../components/BottomNav";
import { EmptyState } from "../../components/AppShell";

export default function ShopError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    console.error(error);
    const update = () => setOffline(!navigator.onLine);
    queueMicrotask(update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [error]);
  return (
    <div className="jayds-app">
      <main className="app-content" id="main-content" tabIndex={-1}>
        <EmptyState
          icon={offline ? "warning" : "coffee"}
          title={offline ? "You’re offline." : "This screen didn’t load."}
          description={
            offline
              ? "Your bag is saved on this device. Reconnect to mobile data or Wi-Fi, then try again."
              : "The connection may have dropped for a moment. Your bag is saved. Try again, or head back to the menu."
          }
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" className="btn-primary" onClick={() => retry()}>
                Try again
              </button>
              <Link href="/menu" className="btn-secondary">
                Back to home
              </Link>
            </div>
          }
        />
      </main>
      <BottomNav />
    </div>
  );
}
