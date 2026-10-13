"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { coordinates, withinCoverage } from "../lib/location";
import Icon from "./Icon";
import "./delivery-map.css";
interface Props {
  lat: number;
  lng: number;
  onLocationChange: (lat: number, lng: number, address: string) => void;
  onClose: () => void;
}
export default function DeliveryMapPicker({
  lat,
  lng,
  onLocationChange,
  onClose,
}: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    marker = useRef<maplibregl.Marker | null>(null),
    dialog = useRef<HTMLDialogElement>(null),
    request = useRef<AbortController | null>(null);
  const [position, setPosition] = useState(
      coordinates(lat, lng) ?? { lat: 14.346621, lng: 120.981057 },
    ),
    [address, setAddress] = useState(""),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<
      { lat: number; lng: number; address: string }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [manualOpen, setManualOpen] = useState(false);
  const [latitudeInput, setLatitudeInput] = useState(String(position.lat));
  const [longitudeInput, setLongitudeInput] = useState(String(position.lng));
  const alive = useRef(true);
  const [branch, setBranch] = useState({
    latitude: 14.346621,
    longitude: 120.981057,
    delivery_radius_km: 8,
  });
  useEffect(() => {
    void fetch("/api/branch")
      .then((r) => r.json())
      .then((b) => {
        if (coordinates(b.latitude, b.longitude)) setBranch(b);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    dialog.current?.showModal();
    alive.current = true;
    let instance: maplibregl.Map;
    try {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      instance = new maplibregl.Map({
        container: container.current!,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [position.lng, position.lat],
        zoom: 15,
      });
    } catch {
      queueMicrotask(() => {
        setMapStatus("failed");
        setManualOpen(true);
        setError(
          "This device cannot display the map. Search for your address or enter coordinates below.",
        );
      });
      return () => {
        request.current?.abort();
        alive.current = false;
      };
    }
    map.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current!);
    const loadingTimer = setTimeout(() => {
      if (alive.current) setMapStatus("failed");
    }, 15000);
    instance.on("load", () => {
      clearTimeout(loadingTimer);
      setMapStatus("ready");
    });
    instance.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
    );
    const pinElement = document.createElement("div");
    const pinArtwork = document.createElement("img");
    pinArtwork.src = "/brand/jayds-pin.svg";
    pinArtwork.alt = "";
    pinArtwork.width = 42;
    pinArtwork.height = 56;
    pinElement.append(pinArtwork);
    pinElement.setAttribute("aria-label", "Delivery destination pin");
    pinElement.className = "jayds-map-pin";
    const pin = new maplibregl.Marker({
      element: pinElement,
      anchor: "bottom",
      draggable: true,
    })
      .setLngLat([position.lng, position.lat])
      .addTo(instance);
    marker.current = pin;
    const select = (p: { lat: number; lng: number }) => {
      pin.setLngLat([p.lng, p.lat]);
      setPosition({ lat: p.lat, lng: p.lng });
      setLatitudeInput(String(p.lat));
      setLongitudeInput(String(p.lng));
      setAddress("");
      setError("");
    };
    pin.on("dragend", () => select(pin.getLngLat()));
    instance.on("click", (e) => select(e.lngLat));
    instance.on("error", () => {
      setMapStatus("failed");
      setManualOpen(true);
    });
    return () => {
      request.current?.abort();
      alive.current = false;
      clearTimeout(loadingTimer);
      observer.disconnect();
      pin.remove();
      instance.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (query.trim().length < 3) {
      request.current?.abort();
      queueMicrotask(() => {
        setResults([]);
        setBusy(false);
      });
      return;
    }
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    const timer = setTimeout(() => {
      setBusy(true);
      void fetch(`/api/location?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          if (!controller.signal.aborted) {
            setResults(d.results ?? []);
            setError("");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 650);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const move = (p: { lat: number; lng: number }) => {
    setPosition(p);
    setLatitudeInput(String(p.lat));
    setLongitudeInput(String(p.lng));
    marker.current?.setLngLat([p.lng, p.lat]);
    map.current?.flyTo({ center: [p.lng, p.lat], zoom: 16 });
  };
  const locate = () => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setError(
        "GPS needs a secure connection on this device. Search for your address or place the pin instead.",
      );
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!alive.current) return;
        move({ lat: p.coords.latitude, lng: p.coords.longitude });
        setAddress("");
        setBusy(false);
        setError("Enter or search the exact delivery address for this pin.");
      },
      () => {
        if (!alive.current) return;
        setBusy(false);
        setError(
          "Location access was unavailable. Search or place the pin instead.",
        );
      },
      { timeout: 10000, maximumAge: 30000 },
    );
  };
  const chosenPoint = coordinates(
    latitudeInput.trim() ? Number(latitudeInput) : NaN,
    longitudeInput.trim() ? Number(longitudeInput) : NaN,
  );
  const covered =
    !!chosenPoint && withinCoverage(chosenPoint.lat, chosenPoint.lng, branch);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="delivery-map-title"
      onCancel={onClose}
      className="delivery-map-dialog w-[min(94vw,760px)] max-h-[94dvh] rounded-3xl border border-border bg-bg-card p-0 shadow-xl backdrop:bg-black/50"
    >
      <div className="delivery-map-heading">
        <div>
          <h2 id="delivery-map-title" className="text-xl font-semibold">
            Delivery address
          </h2>
          <p className="text-sm text-text-muted">
            Search, tap the map, or drag the pin.
          </p>
        </div>
        <button
          onClick={onClose}
          className="icon-button"
          aria-label="Close map"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="delivery-map-search">
        <label className="block text-sm font-medium" htmlFor="map-search">
          Search address
          <FieldRequirement required={false} />
        </label>
        <input
          id="map-search"
          className="input-field w-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Street, building or landmark"
        />
        <div className="delivery-map-results">
          {(query.trim().length >= 3 ? results : []).map((p, i) => (
            <button
              key={i}
              className="block min-h-12 w-full border-b p-3 text-left text-sm"
              onClick={() => {
                request.current?.abort();
                move(p);
                setAddress(p.address);
                setResults([]);
                setBusy(false);
              }}
            >
              {p.address}
            </button>
          ))}
        </div>
        {busy && (
          <p role="status" className="text-sm text-text-secondary">
            Finding your location…
          </p>
        )}
      </div>
      <div className="delivery-map-viewport">
        <div ref={container} className="delivery-map-canvas" />
        <button
          className="delivery-map-locate"
          disabled={busy}
          onClick={locate}
        >
          <Icon name="pin" size={18} /> Use my location
        </button>
        {mapStatus !== "ready" && (
          <p className="delivery-map-status" role="status">
            {mapStatus === "loading"
              ? "Loading map…"
              : "Map unavailable. Search for the address or use manual coordinates below."}
          </p>
        )}
      </div>
      <div className="delivery-map-details">
        <label className="block text-sm font-medium">
          Complete delivery address
          <FieldRequirement required={true} />
          <input
            className="input-field mt-1 w-full"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="House/unit, street, barangay and city"
            maxLength={500}
            autoComplete="street-address"
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
                onChange={(e) => setLatitudeInput(e.target.value)}
                onBlur={() => {
                  if (chosenPoint) move(chosenPoint);
                }}
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
                onChange={(e) => setLongitudeInput(e.target.value)}
                onBlur={() => {
                  if (chosenPoint) move(chosenPoint);
                }}
              />
            </label>
          </div>
        </details>
        {error && (
          <p role="status" className="text-sm text-text-muted">
            {error}
          </p>
        )}
        <p
          className={`text-sm ${covered ? "text-emerald-700" : "text-red-700"}`}
        >
          {!chosenPoint
            ? "Enter valid latitude and longitude, or choose a point on the map."
            : covered
              ? "Within delivery coverage"
              : `Outside the café’s ${branch.delivery_radius_km} km delivery coverage. Pickup remains available.`}
        </p>
        <button
          className="btn-primary min-h-12 w-full"
          disabled={!address.trim() || !covered}
          onClick={() => {
            if (chosenPoint && covered)
              onLocationChange(
                chosenPoint.lat,
                chosenPoint.lng,
                address.trim(),
              );
          }}
        >
          Use this destination
        </button>
      </div>
    </dialog>
  );
}
