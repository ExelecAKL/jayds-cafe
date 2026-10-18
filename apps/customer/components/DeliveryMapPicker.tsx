"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { coordinates, withinCoverage } from "../lib/location";
import {
  useDeliveryAddress,
  type DeliveryPoint,
} from "../hooks/useDeliveryAddress";
import { InlineNotice } from "./AppShell";
import Icon from "./Icon";
import { keepDialogFocus } from "./dialogFocus";
import "./delivery-map.css";
interface Props {
  lat: number;
  lng: number;
  initialAddress?: string;
  onLocationChange: (lat: number, lng: number, address: string) => void;
  onClose: () => void;
}
export default function DeliveryMapPicker({
  lat,
  lng,
  initialAddress = "",
  onLocationChange,
  onClose,
}: Props) {
  const selection = useDeliveryAddress(lat, lng, initialAddress);
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    marker = useRef<maplibregl.Marker | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [manualOpen, setManualOpen] = useState(false),
    [locating, setLocating] = useState(false);
  const [coordinateDraft, setCoordinateDraft] = useState<{
    source: typeof selection.position;
    lat: string;
    lng: string;
  } | null>(null);
  const latitudeInput =
    coordinateDraft?.source === selection.position
      ? coordinateDraft.lat
      : String(selection.position.lat);
  const longitudeInput =
    coordinateDraft?.source === selection.position
      ? coordinateDraft.lng
      : String(selection.position.lng);
  const [details, setDetails] = useState("");
  const alive = useRef(true);
  const [branch, setBranch] = useState({
    latitude: 14.346621,
    longitude: 120.981057,
    delivery_radius_km: 8,
  });
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/branch", { signal: controller.signal })
      .then((r) => r.json())
      .then((b) => {
        if (!controller.signal.aborted && coordinates(b.latitude, b.longitude))
          setBranch(b);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    marker.current?.setLngLat([selection.position.lng, selection.position.lat]);
  }, [selection.position]);
  useEffect(() => {
    dialog.current?.showModal();
    alive.current = true;
    let instance: maplibregl.Map;
    try {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      instance = new maplibregl.Map({
        container: container.current!,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [selection.position.lng, selection.position.lat],
        zoom: 15,
      });
    } catch {
      queueMicrotask(() => {
        setMapStatus("failed");
        setManualOpen(true);
      });
      return () => {
        alive.current = false;
      };
    }
    map.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current!);
    const loadingTimer = setTimeout(() => {
      if (alive.current) {
        setMapStatus("failed");
        setManualOpen(true);
      }
    }, 15000);
    instance.on("load", () => {
      clearTimeout(loadingTimer);
      if (alive.current) setMapStatus("ready");
    });
    instance.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
    );
    const pinElement = document.createElement("div"),
      artwork = document.createElement("img");
    artwork.src = "/brand/jayds-pin.svg";
    artwork.alt = "";
    artwork.width = 42;
    artwork.height = 56;
    pinElement.append(artwork);
    pinElement.setAttribute("aria-label", "Delivery destination pin");
    pinElement.className = "jayds-map-pin";
    const pin = new maplibregl.Marker({
      element: pinElement,
      anchor: "bottom",
      draggable: true,
    })
      .setLngLat([selection.position.lng, selection.position.lat])
      .addTo(instance);
    marker.current = pin;
    pin.on("dragend", () => selection.selectPoint(pin.getLngLat()));
    instance.on("click", (event) => selection.selectPoint(event.lngLat));
    instance.on("error", () => {
      if (alive.current) {
        setMapStatus("failed");
        setManualOpen(true);
      }
    });
    return () => {
      alive.current = false;
      clearTimeout(loadingTimer);
      observer.disconnect();
      pin.remove();
      instance.remove();
      map.current = null;
      marker.current = null;
    };
    // The picker mounts per open destination and uses stable selection callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function pan(point: { lat: number; lng: number }) {
    const options = {
      center: [point.lng, point.lat] as [number, number],
      zoom: 16,
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      map.current?.jumpTo(options);
    else map.current?.flyTo(options);
  }
  function choose(point: DeliveryPoint) {
    selection.chooseResult(point);
    pan(point);
  }
  function locate() {
    if (!window.isSecureContext || !navigator.geolocation) {
      selection.setError(
        "GPS needs a secure connection. Search for your address or place the pin instead.",
      );
      return;
    }
    const version = selection.pauseLookup();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!alive.current) return;
        setLocating(false);
        if (version !== selection.generation.current) return;
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        selection.selectPoint(point);
        pan(point);
      },
      () => {
        if (!alive.current) return;
        setLocating(false);
        if (version === selection.generation.current)
          selection.setError(
            "Location access was unavailable. Search or place the pin instead.",
          );
      },
      { timeout: 10000, maximumAge: 30000 },
    );
  }
  const chosenPoint = coordinates(
    latitudeInput.trim() ? Number(latitudeInput) : NaN,
    longitudeInput.trim() ? Number(longitudeInput) : NaN,
  );
  const covered =
    !!chosenPoint && withinCoverage(chosenPoint.lat, chosenPoint.lng, branch);
  const pinCurrent =
    !!chosenPoint &&
    chosenPoint.lat === selection.position.lat &&
    chosenPoint.lng === selection.position.lng;
  const completeAddress = [details.trim(), selection.address.trim()]
    .filter(Boolean)
    .join(", ");
  function adjustCoordinates() {
    if (chosenPoint && !pinCurrent) {
      selection.selectPoint(chosenPoint);
      pan(chosenPoint);
    }
  }
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      onKeyDown={keepDialogFocus}
      aria-labelledby="delivery-map-title"
      onCancel={onClose}
      className="delivery-map-dialog w-[min(94vw,760px)] max-h-[94dvh] rounded-3xl border border-border bg-bg-card p-0 shadow-xl backdrop:bg-black/50"
    >
      <div className="delivery-map-heading">
        <div>
          <h2 id="delivery-map-title" className="text-xl font-semibold">
            Delivery address
          </h2>
          <p className="text-sm text-text-secondary">
            Type an address or place the pin.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="icon-button"
          aria-label="Close map"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="delivery-map-search">
        <label className="block text-sm font-medium" htmlFor="map-search">
          Complete delivery address
          <FieldRequirement required={true} />
        </label>
        <input
          id="map-search"
          className="input-field w-full"
          value={selection.address}
          onChange={(e) => selection.editAddress(e.target.value)}
          placeholder="Street, barangay, city or landmark"
          maxLength={200}
          autoComplete="street-address"
          aria-autocomplete="list"
        />
        {selection.busy && (
          <p role="status" className="text-sm text-text-secondary">
            Finding the matching address…
          </p>
        )}
        {selection.results.length > 0 && (
          <div className="delivery-map-results">
            <p className="text-sm font-medium">
              Choose a match to move the pin
            </p>
            {selection.results.map((point, index) => (
              <button
                type="button"
                key={index}
                className="block min-h-12 w-full border-b p-3 text-left text-sm"
                onClick={() => choose(point)}
              >
                {point.address}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="delivery-map-viewport">
        <div ref={container} className="delivery-map-canvas" />
        <button
          type="button"
          className="delivery-map-locate"
          disabled={locating}
          onClick={locate}
        >
          <Icon name="pin" size={18} />
          {locating ? "Locating…" : "Use my location"}
        </button>
        {mapStatus !== "ready" && (
          <p className="delivery-map-status" role="status">
            {mapStatus === "loading"
              ? "Loading map…"
              : "Map unavailable. Search for an address or use manual coordinates below."}
          </p>
        )}
      </div>
      <div className="delivery-map-details">
        <label className="block text-sm font-medium">
          House/unit or delivery landmark
          <FieldRequirement required={false} />
          <input
            className="input-field mt-1 w-full"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={200}
            placeholder="Unit, floor, gate or nearby landmark"
          />
        </label>
        <details
          open={manualOpen}
          onToggle={(event) => setManualOpen(event.currentTarget.open)}
        >
          <summary>Adjust coordinates manually</summary>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              Latitude
              <FieldRequirement required={true} />
              <input
                className="input-field w-full"
                type="number"
                step="any"
                value={latitudeInput}
                onChange={(e) => {
                  selection.pauseLookup();
                  setCoordinateDraft({
                    source: selection.position,
                    lat: e.target.value,
                    lng: longitudeInput,
                  });
                }}
                onBlur={adjustCoordinates}
              />
            </label>
            <label className="text-xs">
              Longitude
              <FieldRequirement required={true} />
              <input
                className="input-field w-full"
                type="number"
                step="any"
                value={longitudeInput}
                onChange={(e) => {
                  selection.pauseLookup();
                  setCoordinateDraft({
                    source: selection.position,
                    lat: latitudeInput,
                    lng: e.target.value,
                  });
                }}
                onBlur={adjustCoordinates}
              />
            </label>
          </div>
        </details>
        {selection.error && (
          <InlineNotice tone="warning">{selection.error}</InlineNotice>
        )}
        {!selection.matched && selection.address.trim() && !selection.busy && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={selection.manualConfirmed}
              onChange={(e) => selection.setManualConfirmed(e.target.checked)}
            />
            <span>I checked that the pin matches this address</span>
          </label>
        )}
        <p
          className={`text-sm ${covered ? "text-emerald-800" : "text-red-800"}`}
        >
          {!chosenPoint
            ? "Enter valid coordinates or choose a point on the map."
            : covered
              ? "Within delivery coverage"
              : `Outside the café’s ${branch.delivery_radius_km} km delivery coverage. Pickup remains available.`}
        </p>
        {completeAddress.length > 500 && (
          <InlineNotice tone="warning">
            Keep the complete address within 500 characters.
          </InlineNotice>
        )}
        <button
          type="button"
          className="btn-primary min-h-12 w-full"
          disabled={
            !covered ||
            !pinCurrent ||
            !selection.confirmed ||
            locating ||
            completeAddress.length > 500
          }
          onClick={() => {
            if (
              chosenPoint &&
              covered &&
              pinCurrent &&
              selection.confirmed &&
              completeAddress.length <= 500
            )
              onLocationChange(
                chosenPoint.lat,
                chosenPoint.lng,
                completeAddress,
              );
          }}
        >
          Use this destination
        </button>
      </div>
    </dialog>
  );
}
