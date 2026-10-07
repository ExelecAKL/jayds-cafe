"use client";
import { useParams, useRouter } from "next/navigation";
import { PosShell } from "../../../../components/PosShell";
import { OrderPayment } from "../../../../components/OrderPayment";
export default function PaymentPage() {
  const params = useParams<{ id: string }>(),
    router = useRouter();
  return (
    <PosShell title="Order payment">
      <OrderPayment
        id={params.id}
        onClose={() => router.replace("/dashboard")}
      />
    </PosShell>
  );
}
