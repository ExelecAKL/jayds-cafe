// apps/customer/components/DeliveryMapPickerLazy.tsx
// Wrapper that handles dynamic loading of the map picker (SSR-safe)

"use client";

import dynamic from "next/dynamic";

const DeliveryMapPicker = dynamic(() => import("./DeliveryMapPicker"), {
  ssr: false,
});

interface Props {
  lat: number;
  lng: number;
  initialAddress?: string;
  onLocationChange: (lat: number, lng: number, address: string) => void;
  onClose: () => void;
}

export default function DeliveryMapPickerLazy(props: Props) {
  return <DeliveryMapPicker {...props} />;
}
