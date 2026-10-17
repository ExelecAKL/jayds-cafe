"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import type { Availability } from "../inventory/types";
import { createUuid } from "../utils/uuid";
import { withRequestDeadline } from "../utils/request";

export function useAvailability(
  itemId: string | undefined,
  variants: unknown[],
  quantity = 1,
) {
  const signature = JSON.stringify(variants);
  const key = `${itemId}:${quantity}:${signature}`;
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const [result, setResult] = useState<{
    key: string;
    availability: Availability | null;
    checking: boolean;
  }>({ key: "", availability: null, checking: false });
  useEffect(() => {
    if (!itemId) return;
    let active = true;
    let latestRequest = 0;
    const check = async () => {
      const request = ++latestRequest;
      if (!navigator.onLine) {
        if (active) {
          setResult({
            key,
            availability: {
              available: false,
              max_quantity: 0,
              reason: "Connect to confirm availability",
            },
            checking: false,
          });
        }
        return;
      }
      setResult((previous) => ({
        key,
        availability: previous.key === key ? previous.availability : null,
        checking: true,
      }));
      try {
        const { data, error } = await withRequestDeadline((signal) =>
          supabase
            .rpc("get_configuration_availability", {
              p_item: itemId,
              p_variants: JSON.parse(signature),
              p_quantity: quantity,
            })
            .abortSignal(signal),
        );
        if (error) throw error;
        if (active && request === latestRequest)
          setResult({
            key,
            availability: data as Availability,
            checking: false,
          });
      } catch {
        if (active && request === latestRequest)
          setResult({
            key,
            availability: {
              available: false,
              max_quantity: 0,
              reason: "Availability could not be verified",
            },
            checking: false,
          });
      }
    };
    const timer = setTimeout(() => void check(), 120);
    const channel = supabase
      .channel(`availability-${itemId}-${createUuid()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "catalog_state" },
        () => void check(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void check();
      });
    const interval = setInterval(() => void check(), 30_000);
    const refresh = () => void check();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      void supabase.removeChannel(channel);
    };
  }, [itemId, signature, quantity, key, attempt]);
  // A prior configuration cannot authorize a newly selected size or quantity,
  // including during the debounce before its first request starts.
  return result.key === key
    ? { availability: result.availability, checking: result.checking, retry }
    : { availability: null, checking: !!itemId, retry };
}
