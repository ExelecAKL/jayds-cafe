"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { PosDialog, PosIcon } from "./PosPrimitives";
export function QRScanner({
  onScan,
  onClose,
  onManualEntry,
  title = "Scan QR code",
}: {
  onScan: (data: string) => void;
  onClose: () => void;
  onManualEntry?: () => void;
  title?: string;
}) {
  const containerId = "qr-reader-" + useId().replaceAll(":", ""),
    handler = useRef(onScan);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!window.isSecureContext) {
      void Promise.resolve().then(() =>
        setError(
          "Camera scanning needs HTTPS or localhost. On this laptop, open the POS at http://localhost:4001, or enter the code instead.",
        ),
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      void Promise.resolve().then(() =>
        setError("This browser cannot open a camera. Enter the code instead."),
      );
      return;
    }
    handler.current = onScan;
  }, [onScan]);
  useEffect(() => {
    const scanner = new Html5Qrcode(containerId);
    let active = true,
      running = false,
      scanned = false;
    const stop = async () => {
      if (!running) return;
      running = false;
      try {
        await scanner.stop();
      } catch {}
    };
    void scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (value) => {
          if (!active || scanned) return;
          scanned = true;
          void stop();
          handler.current(value);
        },
        () => {},
      )
      .then(() => {
        running = true;
        if (!active) void stop();
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            /NotAllowed|Permission|denied/i.test(String(failure))
              ? "Camera permission was denied. Allow camera access in the browser, or enter the code instead."
              : /NotFound|DevicesNotFound/i.test(String(failure))
                ? "No camera was found. Connect a webcam, or enter the code instead."
                : "The camera could not start. Check that another app is not using it, or enter the code instead.",
          );
      });
    return () => {
      active = false;
      void stop();
    };
  }, [containerId]);
  return (
    <PosDialog title={title} onClose={onClose}>
      <div
        className="pos-dialog-body"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          id={containerId}
          style={{
            width: 320,
            maxWidth: "100%",
            height: 320,
            borderRadius: 12,
            overflow: "hidden",
            background: "#eee4d8",
          }}
        />
        <p className="pos-muted">Point the camera at the customer’s QR code.</p>
        {error && (
          <p className="pos-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="pos-dialog-footer">
        {onManualEntry && (
          <button className="pos-button" onClick={onManualEntry}>
            <PosIcon name="left" />
            Enter code instead
          </button>
        )}
        <button className="pos-button" onClick={onClose}>
          Close
        </button>
      </footer>
    </PosDialog>
  );
}
