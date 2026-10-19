"use client";
import { Suspense } from "react";
import InventoryWorkspace from "../../../components/InventoryWorkspace";
import { PageSkeleton } from "../../../components/AdminSkeletons";
export default function InventoryPage() {
  return (
    <Suspense
      fallback={
        <PageSkeleton
          label="Loading inventory…"
          metrics={4}
          tabs={5}
          actions={2}
          columns={["title", "number", "number", "badge", "action"]}
        />
      }
    >
      <InventoryWorkspace />
    </Suspense>
  );
}
