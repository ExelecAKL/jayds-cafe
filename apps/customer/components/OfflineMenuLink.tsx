"use client";
import Link from "next/link";
import { useSyncExternalStore, type ComponentPropsWithoutRef } from "react";

type Props = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
  prefetch?: boolean;
};

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
const getOnline = () => navigator.onLine;
const getServerOnline = () => true;

// Public menu documents are saved by the worker. Offline client transitions
// need a Flight response, which we deliberately never cache with private data.
// Use the saved document directly instead of starting a failed router transition.
export default function OfflineMenuLink({ href, prefetch, ...props }: Props) {
  const online = useSyncExternalStore(subscribe, getOnline, getServerOnline);
  if (
    !online &&
    navigator.serviceWorker?.controller &&
    /^\/menu(?:\/browse(?:\/[a-f0-9-]{36})?)?\/?$/.test(href)
  )
    return <a {...props} href={href} />;
  return <Link {...props} href={href} prefetch={online ? prefetch : false} />;
}
