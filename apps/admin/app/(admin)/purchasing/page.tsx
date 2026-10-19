"use client";
import { Suspense } from "react";
import { PurchasingWorkspace } from "../../../components/PurchasingWorkspace";
import { PageSkeleton } from "../../../components/AdminSkeletons";
export default function PurchasingPage() {
  return (
    <Suspense
      fallback={
        <PageSkeleton
          label="Loading purchasing…"
          tabs={3}
          actions={2}
          columns={["title", "text", "badge", "number", "action"]}
        />
      }
    >
      <PurchasingWorkspace />
    </Suspense>
  );
}
