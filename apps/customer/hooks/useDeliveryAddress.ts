"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { coordinates } from "../lib/location";
export interface DeliveryPoint {
  lat: number;
  lng: number;
  address: string;
}
type Lookup =
  | { kind: "reverse"; lat: number; lng: number }
  | { kind: "search"; query: string };
export function useDeliveryAddress(
  lat: number,
  lng: number,
  initialAddress = "",
) {
  const [position, setPosition] = useState(
    coordinates(lat, lng) ?? { lat: 14.346621, lng: 120.981057 },
  );
  const [address, setAddress] = useState(initialAddress),
    [matched, setMatched] = useState(
      !!coordinates(lat, lng) && !!initialAddress.trim(),
    );
  const [manualConfirmed, setManualConfirmed] = useState(false),
    [lookup, setLookup] = useState<Lookup | null>(null);
  const [results, setResults] = useState<DeliveryPoint[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<AbortController | null>(null),
    generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current++;
    request.current?.abort();
    setResults([]);
    setError("");
    setManualConfirmed(false);
  }, []);
  const editAddress = useCallback(
    (value: string) => {
      invalidate();
      setAddress(value);
      setMatched(false);
      const search =
        value.trim().length >= 3
          ? { kind: "search" as const, query: value.trim() }
          : null;
      setLookup(search);
      setBusy(!!search);
    },
    [invalidate],
  );
  const selectPoint = useCallback(
    (point: { lat: number; lng: number }) => {
      if (!coordinates(point.lat, point.lng)) return;
      invalidate();
      setPosition({ lat: point.lat, lng: point.lng });
      setAddress("");
      setMatched(false);
      setBusy(true);
      setLookup({ kind: "reverse", lat: point.lat, lng: point.lng });
    },
    [invalidate],
  );
  const chooseResult = useCallback(
    (point: DeliveryPoint) => {
      if (!coordinates(point.lat, point.lng) || !point.address.trim()) return;
      invalidate();
      setPosition({ lat: point.lat, lng: point.lng });
      setAddress(point.address);
      setMatched(true);
      setLookup(null);
      setBusy(false);
    },
    [invalidate],
  );
  const pauseLookup = useCallback(() => {
    invalidate();
    setLookup(null);
    setBusy(false);
    return generation.current;
  }, [invalidate]);
  useEffect(() => {
    if (!lookup) return;
    const controller = new AbortController();
    request.current = controller;
    const version = generation.current;
    const timer = setTimeout(() => {
      const params =
        lookup.kind === "reverse"
          ? new URLSearchParams({
              lat: String(lookup.lat),
              lng: String(lookup.lng),
            })
          : new URLSearchParams({ q: lookup.query });
      const signal =
        typeof AbortSignal.any === "function"
          ? AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])
          : controller.signal;
      void fetch(`/api/location?${params}`, { signal, cache: "no-store" })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error("Location lookup unavailable");
          if (controller.signal.aborted || version !== generation.current)
            return;
          const points: DeliveryPoint[] = Array.isArray(data.results)
            ? data.results
                .filter(
                  (p: DeliveryPoint) =>
                    coordinates(p.lat, p.lng) &&
                    typeof p.address === "string" &&
                    p.address.trim(),
                )
                .slice(0, 5)
            : [];
          if (lookup.kind === "reverse") {
            if (!points[0]) throw new Error("No address found");
            // Reverse lookup names the pin; its nearby result must never move the exact chosen coordinates.
            setAddress(points[0].address);
            setMatched(true);
          } else {
            setResults(points);
            if (!points.length)
              setError(
                "No address match found. Check the pin and confirm the address below.",
              );
          }
        })
        .catch(() => {
          if (controller.signal.aborted || version !== generation.current)
            return;
          setError(
            lookup.kind === "reverse"
              ? "We couldn’t find an address for this pin. Enter it and check that the pin matches."
              : "Address search is unavailable. Place the pin, enter the address and confirm they match.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted && version === generation.current)
            setBusy(false);
        });
    }, 650);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [lookup]);
  useEffect(
    () => () => {
      generation.current++;
      request.current?.abort();
    },
    [],
  );
  return {
    position,
    address,
    results,
    busy,
    error,
    matched,
    manualConfirmed,
    generation,
    confirmed: !!address.trim() && (matched || manualConfirmed) && !busy,
    editAddress,
    selectPoint,
    chooseResult,
    pauseLookup,
    setManualConfirmed,
    setError,
  };
}
