"use client";
// apps/customer/components/DeliveryMapPreviewCanvas.tsx
// Read-only MapLibre view of a pinned delivery destination, with the café
// shown too when its location is known. Loaded on demand by
// DeliveryMapPreview so MapLibre never weighs down the first paint.
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./delivery-map.css";

type Point = { lat: number; lng: number };

function markerElement(src: string, className: string, label: string) {
  const element = document.createElement("div");
  const image = document.createElement("img");
  image.src = src;
  image.alt = "";
  element.append(image);
  element.className = className;
  element.setAttribute("aria-hidden", "true");
  element.title = label;
  return element;
}

export default function DeliveryMapPreviewCanvas({
  destination,
  origin,
  onReady,
  onFail,
}: {
  destination: Point;
  origin?: Point | null;
  onReady: () => void;
  onFail: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onFail });
  const originLat = origin?.lat;
  const originLng = origin?.lng;
  useEffect(() => {
    callbacks.current = { onReady, onFail };
  }, [onReady, onFail]);

  useEffect(() => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (ok) callbacks.current.onReady();
      else callbacks.current.onFail();
    };
    const timer = setTimeout(() => finish(false), 12_000);
    let map: maplibregl.Map;
    try {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new maplibregl.Map({
        container: container.current!,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [destination.lng, destination.lat],
        zoom: 15,
        interactive: false,
        attributionControl: { compact: true },
      });
    } catch {
      clearTimeout(timer);
      queueMicrotask(() => finish(false));
      return;
    }
    const markers = [
      new maplibregl.Marker({
        element: markerElement(
          "/brand/jayds-pin.svg",
          "jayds-map-pin is-static",
          "Your delivery pin",
        ),
        anchor: "bottom",
      })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map),
    ];
    if (originLat !== undefined && originLng !== undefined) {
      markers.push(
        new maplibregl.Marker({
          element: markerElement(
            "/brand/icon-mascot.svg",
            "jayds-map-origin",
            "Jayds Café",
          ),
          anchor: "center",
        })
          .setLngLat([originLng, originLat])
          .addTo(map),
      );
      map.fitBounds(
        [
          [
            Math.min(originLng, destination.lng),
            Math.min(originLat, destination.lat),
          ],
          [
            Math.max(originLng, destination.lng),
            Math.max(originLat, destination.lat),
          ],
        ],
        { padding: { top: 70, bottom: 40, left: 48, right: 48 }, maxZoom: 16, animate: false },
      );
    }
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current!);
    map.on("load", () => {
      clearTimeout(timer);
      finish(true);
    });
    // Before the first load an error means no map; afterwards a missing tile
    // only leaves a gap, which the visible map already shows.
    map.on("error", () => {
      if (!settled) {
        clearTimeout(timer);
        finish(false);
      }
    });
    return () => {
      clearTimeout(timer);
      resize.disconnect();
      for (const marker of markers) marker.remove();
      map.remove();
    };
  }, [destination.lat, destination.lng, originLat, originLng]);

  return <div ref={container} className="delivery-preview-canvas" />;
}
