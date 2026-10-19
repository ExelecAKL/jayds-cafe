// apps/pos/components/QRDisplay.tsx
// QR code display component using qrcode library

"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Skeleton, SkeletonStatus } from "@cafeos/shared/ui/skeleton";

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
      <SkeletonStatus label="Preparing QR code" className="flex flex-col items-center gap-3">
        <Skeleton shape="block" width={size + 24} height={size + 24} radius={16} />
        {label && <Skeleton width={Math.min(size, 160)} height={14} />}
      </SkeletonStatus>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 jm-reveal">
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
