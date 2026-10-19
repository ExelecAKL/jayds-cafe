"use client";
// If a cashier screen fails, the saved ticket draft is still on the terminal.
import { useEffect, useState } from "react";
import Link from "next/link";
import { PosIcon } from "../../components/PosPrimitives";

export default function PosError({
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
    <div className="pos-auth">
      <div className="pos-auth-card jm-reveal">
        <div className="pos-empty">
          <PosIcon name="register" size={36} />
          <strong>{offline ? "This terminal is offline" : "This screen didn’t load"}</strong>
          <span>
            {offline
              ? "The current ticket draft is saved here. Reconnect to take payments and update orders."
              : "The connection may have dropped. The current ticket draft is still saved on this terminal."}
          </span>
        </div>
        <div className="pos-auth-actions">
          <button type="button" className="pos-button pos-primary" onClick={() => retry()}>
            Try again
          </button>
          <Link href="/new-order" className="pos-button">
            Back to Register
          </Link>
        </div>
      </div>
    </div>
  );
}
