"use client";
import { supabase } from "@cafeos/shared/supabase/client";
import { appPath } from "@cafeos/shared/utils/app-path";
async function headers() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Your session expired. Sign in again.");
  return { Authorization: `Bearer ${data.session.access_token}` };
}
export async function uploadFinanceDocument(file: File) {
  if (
    !file.size ||
    file.size > 5 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error(
      "Choose a JPG, PNG or still WebP invoice photo under 5 MB.",
    );
  const response = await fetch(appPath("/api/finance/documents"), {
    method: "POST",
    headers: await headers(),
    body: file,
    signal: AbortSignal.timeout(35000),
  });
  const value = await response.json();
  if (!response.ok || typeof value.id !== "string")
    throw new Error(
      value.error || "Invoice photo could not upload. Try again.",
    );
  return value.id as string;
}
export async function downloadFinanceDocument(id: string) {
  const response = await fetch(
    appPath("/api/finance/documents?id=" + encodeURIComponent(id)),
    {
      headers: await headers(),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new Error(
      (await response.json()).error || "Invoice photo could not load.",
    );
  const url = URL.createObjectURL(await response.blob()),
    link = document.createElement("a");
  link.href = url;
  link.download = "invoice-photo.webp";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
