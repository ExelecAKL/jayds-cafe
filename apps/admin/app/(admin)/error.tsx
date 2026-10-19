"use client";
// A page that fails inside the back office keeps the navigation and offers a
// retry, with the likely cause named when the device is offline.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Empty } from "../../components/Operations";

export default function AdminError({
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
    <section className="ops-panel">
      <Empty
        icon="alert"
        title={offline ? "You’re offline" : "This page didn’t load"}
        description={
          offline
            ? "Reconnect, then try again. Nothing you saved earlier was lost."
            : "The connection may have dropped or the data took too long. Try again; if it keeps happening, open another page and come back."
        }
      >
        <div className="ops-guide-links">
          <button type="button" className="ops-button primary" onClick={() => retry()}>
            Try again
          </button>
          <Link href="/dashboard" className="ops-button">
            Go to Overview
          </Link>
        </div>
      </Empty>
    </section>
  );
}
