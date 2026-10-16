"use client";
import { Suspense } from "react";
import { PurchasingWorkspace } from "../../../components/PurchasingWorkspace";
import { LoadingRows } from "../../../components/Operations";
export default function PurchasingPage() {
  return (
    <Suspense fallback={<LoadingRows label="Loading purchasing…" />}>
      <PurchasingWorkspace />
    </Suspense>
  );
}
