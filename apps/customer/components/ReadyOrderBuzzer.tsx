"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { supabase } from "@cafeos/shared/supabase/client";
import { customerHeaders } from "../context/CustomerFeatures";
import { cashAtPickup } from "@cafeos/shared/pos/fulfillment";
interface ReadyOrder {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  order_source?: string;
  order_type?: string;
  payment_method?: string;
  pickup_window_start?: string | null;
}
export default function ReadyOrderBuzzer() {
  const pathname = usePathname();
  const { user, initialized } = useAuth(),
    [ready, setReady] = useState<ReadyOrder | null>(null),
    [sound, setSound] = useState(false),
    audio = useRef<AudioContext | null>(null),
    seen = useRef(new Set<string>());
  useEffect(() => {
    if (!initialized) return;
    let active = true;
    const owner = user?.id ?? "guest",
      storage = "jayds-ready-seen:" + owner;
    async function refresh() {
      try {
        let orders: ReadyOrder[] = [];
        if (user) {
          const { data, error } = await supabase
            .from("orders")
            .select(
              "id,order_number,status,payment_status,order_source,order_type,payment_method,pickup_window_start",
            )
            .eq("customer_id", user.id)
            .eq("status", "ready")
            .limit(20);
          if (error) return;
          orders = (data ?? []) as ReadyOrder[];
        } else {
          const ids = JSON.parse(
            localStorage.getItem("cafeos-guest-orders") ?? "[]",
          );
          if (!Array.isArray(ids) || !ids.length) return;
          const r = await fetch("/api/orders/guest", {
            method: "POST",
            headers: await customerHeaders(null),
            body: JSON.stringify({ orderIds: ids.slice(0, 20) }),
            cache: "no-store",
          });
          if (!r.ok) return;
          orders = (await r.json()).orders ?? [];
        }
        if (!active) return;
        for (const order of orders) {
          if (
            order.status !== "ready" ||
            (order.payment_status !== "paid" &&
              !(cashAtPickup(order) && order.payment_status === "pending")) ||
            seen.current.has(order.id)
          )
            continue;
          seen.current.add(order.id);
          setReady(order);
          if (audio.current?.state === "running") {
            const oscillator = audio.current.createOscillator(),
              gain = audio.current.createGain();
            oscillator.connect(gain);
            gain.connect(audio.current.destination);
            oscillator.frequency.value = 740;
            gain.gain.value = 0.08;
            oscillator.start();
            oscillator.stop(audio.current.currentTime + 0.25);
          }
          try {
            localStorage.setItem(
              storage,
              JSON.stringify([...seen.current].slice(-50)),
            );
          } catch {}
          break;
        }
      } catch {
        /* Polling and foreground notices recover when online. */
      }
    }
    queueMicrotask(() => {
      if (!active) return;
      setReady(null);
      try {
        seen.current = new Set(
          JSON.parse(localStorage.getItem(storage) ?? "[]"),
        );
      } catch {
        seen.current = new Set();
      }
      void refresh();
    });
    const update = () => {
        if (document.visibilityState === "visible") void refresh();
      },
      timer = setInterval(update, 10000);
    window.addEventListener("online", update);
    window.addEventListener("focus", update);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", update);
      window.removeEventListener("focus", update);
    };
  }, [user, initialized]);
  if (!ready || pathname === "/orders/" + ready.id) return null;
  return (
    <aside
      role="status"
      className="fixed bottom-24 left-4 right-4 z-[60] mx-auto max-w-md rounded-2xl border border-border bg-bg-card p-4 shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong>Your order is ready</strong>
          <p className="text-sm">
            {ready.order_number} ·{" "}
            {ready.order_type === "delivery"
              ? "Open your delivery details."
              : cashAtPickup(ready) && ready.payment_status === "pending"
                ? "Pay when you collect at the counter."
                : "Open your pickup details."}
          </p>
        </div>
        <button
          className="min-h-12 px-3 text-sm"
          aria-label="Dismiss order notice"
          onClick={() => setReady(null)}
        >
          Close
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          href={"/orders/" + ready.id}
          className="btn-primary min-h-12 flex-1"
        >
          View order
        </Link>
        <button
          className="btn-secondary min-h-12"
          onClick={() => {
            if (sound) {
              void audio.current?.suspend();
              setSound(false);
            } else {
              audio.current ??= new AudioContext();
              void audio.current.resume();
              setSound(true);
            }
          }}
        >
          {sound ? "Mute" : "Enable sound"}
        </button>
      </div>
    </aside>
  );
}
