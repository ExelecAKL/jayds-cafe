// apps/customer/app/(shop)/menu/[id]/page.tsx
// Backward-compatible redirect to the browse detail route

import { redirect } from "next/navigation";

export default async function LegacyMenuItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/menu/browse/${id}`);
}
