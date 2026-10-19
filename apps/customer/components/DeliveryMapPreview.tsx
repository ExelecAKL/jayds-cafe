"use client";
// apps/customer/components/DeliveryMapPreview.tsx
// A small, read-only map of the pinned destination. MapLibre loads only once
// the preview scrolls near the screen; until then a map-shaped skeleton holds
// the space. If the map cannot load, the saved pin and address still stand.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@cafeos/shared/ui/skeleton";
import {
  prefersLightData,
  useNetworkQuality,
} from "@cafeos/shared/ui/connection-status";
import { distanceKm } from "../lib/location";
import Icon from "./Icon";

const Canvas = dynamic(() => import("./DeliveryMapPreviewCanvas"), {
  ssr: false,
});

type Point = { lat: number; lng: number };

export default function DeliveryMapPreview({
  destination,
  origin,
  originName = "Jayds Café",
  onAdjust,
  className = "",
}: {
  destination: Point;
  origin?: Point | null;
  originName?: string;
  /** Pointer shortcut to the picker; keyboard users keep the "Change pin" button. */
  onAdjust?: () => void;
  className?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const key = `${destination.lat},${destination.lng}`;
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setState("loading");
  }
  useEffect(() => {
    const element = frame.current;
    if (!element || near) return;
    if (!("IntersectionObserver" in window)) {
      queueMicrotask(() => setNear(true));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  const ready = useCallback(() => setState("ready"), []);
  const failed = useCallback(() => setState("failed"), []);
  // On Data Saver or a weak mobile signal, map tiles wait for a tap.
  const quality = useNetworkQuality();
  const [lightData, setLightData] = useState(false);
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setLightData(prefersLightData()));
  }, []);
  // Once tiles start loading, a dip in signal does not tear the map down.
  const [committed, setCommitted] = useState(false);
  const deferred =
    !wanted &&
    !committed &&
    state === "loading" &&
    (lightData || quality !== "ok");
  useEffect(() => {
    if (near && !deferred) queueMicrotask(() => setCommitted(true));
  }, [near, deferred]);
  const distance = origin ? distanceKm(origin, destination) : null;
  const distanceText =
    distance === null || !Number.isFinite(distance)
      ? ""
      : distance < 1
        ? `${Math.round(distance * 1000)} m`
        : `${distance.toFixed(1)} km`;

  if (deferred)
    return (
      <div
        ref={frame}
        className={`delivery-preview is-deferred ${className}`}
        data-state="deferred"
      >
        <div className="delivery-preview-fallback">
          <Icon name="pin" size={24} />
          <span>
            {quality === "offline"
              ? "Map unavailable offline. Your pin is saved."
              : "Map paused to save mobile data. Your pin is saved."}
          </span>
          {quality !== "offline" && (
            <button
              type="button"
              className="delivery-preview-load"
              onClick={() => setWanted(true)}
            >
              Show map
            </button>
          )}
        </div>
        {distanceText && (
          <span className="delivery-preview-chip">
            <Icon name="truck" size={15} />
            {distanceText} from {originName}
          </span>
        )}
      </div>
    );

  return (
    <div
      ref={frame}
      className={`delivery-preview ${onAdjust ? "is-adjustable" : ""} ${className}`}
      data-state={state}
      onClick={onAdjust}
      role="img"
      aria-label={
        distanceText
          ? `Map of your delivery pin, ${distanceText} from ${originName}`
          : "Map of your delivery pin"
      }
    >
      {near && state !== "failed" && (
        <Canvas
          key={key}
          destination={destination}
          origin={origin}
          onReady={ready}
          onFail={failed}
        />
      )}
      {state === "loading" && (
        <Skeleton shape="block" radius={0} height="100%" className="delivery-preview-skeleton" />
      )}
      {state === "failed" && (
        <div className="delivery-preview-fallback">
          <Icon name="pin" size={26} />
          <span>Map preview is unavailable. Your pin is still saved.</span>
        </div>
      )}
      {distanceText && (
        <span className="delivery-preview-chip">
          <Icon name="truck" size={15} />
          {distanceText} from {originName}
        </span>
      )}
      {onAdjust && state === "ready" && (
        <span className="delivery-preview-hint">
          <Icon name="pin" size={14} /> Tap to move pin
        </span>
      )}
    </div>
  );
}
