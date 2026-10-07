// apps/pos/components/QRDisplay.tsx
// QR code display component using qrcode library

"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QRDisplayProps {
  data: string;
  size?: number;
  label?: string;
  sublabel?: string;
}

export function QRDisplay({
  data,
  size = 200,
  label,
  sublabel,
}: QRDisplayProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(data, {
      width: size,
      margin: 2,
      color: { dark: "#1e293b", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then(setQrUrl)
      .catch((err) => console.error("QR generation failed:", err));
  }, [data, size]);

  if (!qrUrl) {
    return (
      <div
        className="bg-gray-100 rounded-2xl flex items-center justify-center animate-pulse"
        style={{ width: size, height: size }}
      >
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white p-3 rounded-2xl shadow-lg">
        <img
          src={qrUrl}
          alt="QR Code"
          width={size}
          height={size}
          className="rounded-xl"
        />
      </div>
      {label && <p className="text-sm font-semibold text-center">{label}</p>}
      {sublabel && (
        <p className="text-xs text-gray-500 text-center">{sublabel}</p>
      )}
    </div>
  );
}
