"use client";
import { Suspense } from "react";
import InventoryWorkspace from "../../../components/InventoryWorkspace";
import { LoadingRows } from "../../../components/Operations";
export default function InventoryPage() {
  return (
    <Suspense fallback={<LoadingRows label="Loading inventory…" />}>
      <InventoryWorkspace />
    </Suspense>
  );
}
