"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import AppShell, { InlineNotice } from "../../../components/AppShell";
import { customerHeaders } from "../../../context/CustomerFeatures";
export default function NotificationSettings() {
  const { user } = useAuth();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [enabled, setEnabled] = useState(false),
    [config, setConfig] = useState<{
      configured: boolean;
      publicKey: string | null;
    } | null>(null),
    [orderId, setOrderId] = useState("");
  useEffect(() => {
    void fetch("/api/customer/push")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setMessage("Alert settings could not load."));
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .getRegistration()
        .then(async (r) =>
          setEnabled(!!(await r?.pushManager.getSubscription())),
        );
    queueMicrotask(() => {
      try {
        const ids = JSON.parse(
          localStorage.getItem("cafeos-guest-orders") ?? "[]",
        );
        if (Array.isArray(ids)) setOrderId(ids[0] ?? "");
      } catch {}
    });
  }, []);
  async function change() {
    setBusy(true);
    setMessage("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error(
          "Install Jayds on your Home Screen on a supported device to enable alerts.",
        );
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg)
        throw new Error(
          "Install or reload the production app first. In-app order tracking is available.",
        );
      let sub = await reg.pushManager.getSubscription();
      if (enabled && sub) {
        const r = await fetch("/api/customer/push", {
          method: "DELETE",
          headers: await customerHeaders(user?.id ?? null),
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        if (!r.ok) throw new Error("The preference could not save.");
        await sub.unsubscribe();
        setEnabled(false);
        setMessage("Background alerts disabled.");
        return;
      }
      if (!config?.configured || !config.publicKey)
        throw new Error("Background alerts are not configured yet.");
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error(
          "Permission was not granted. You can continue with in-app tracking.",
        );
      const key = Uint8Array.from(
        atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      sub ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const r = await fetch("/api/customer/push", {
        method: "POST",
        headers: await customerHeaders(user?.id ?? null),
        body: JSON.stringify({ subscription: sub.toJSON(), orderId }),
      });
      const data = await r.json();
      if (!r.ok) {
        await sub.unsubscribe();
        throw new Error(data.error || "Alert preferences could not save.");
      }
      setEnabled(true);
      setMessage("Order alerts enabled for this device.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Alerts could not update.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell title="App & notifications" backHref="/account">
      <section className="surface-card mx-auto max-w-xl space-y-5 p-6">
        <h2 className="text-xl font-semibold">
          Order updates on your Home Screen
        </h2>
        <p className="text-sm text-text-secondary">
          Choose background alerts for ready orders and courier milestones. No
          marketing permission is required. Your device can delay alerts; the
          order screen always shows the latest confirmed status.
        </p>
        {!user && (
          <p className="text-sm">
            Guest alerts require an order on this original device.
          </p>
        )}
        {config && !config.configured && (
          <InlineNotice>
            Background alerts are awaiting café configuration. In-app tracking
            remains available.
          </InlineNotice>
        )}
        <button
          className="btn-primary min-h-12 w-full"
          disabled={
            busy || (!enabled && !config?.configured) || (!enabled && !user && !orderId)
          }
          onClick={change}
        >
          {busy
            ? "Updating…"
            : enabled
              ? "Disable background alerts"
              : "Enable background alerts"}
        </button>
        {message && <InlineNotice>{message}</InlineNotice>}
        <div className="border-t border-border pt-5">
          <h2 className="text-lg font-semibold">Install Jayds Café</h2>
          <p className="mt-2 text-sm leading-relaxed">
            On Android, choose “Install app” from your browser menu. On iPhone
            or iPad, open Jayds in Safari, tap Share, then Add to Home Screen.
            Open the installed app to enable supported background alerts. The
            app works in portrait and landscape.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
