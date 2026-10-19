"use client";
import { useSyncExternalStore } from "react";

const eventName = "jayds-theme-change";
const storageKey = "jayds-admin-theme";
function subscribe(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey);
    } catch {
      /* Storage may be unavailable. */
    }
    const theme =
      saved === "dark" || saved === "light"
        ? saved
        : media.matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = theme;
    callback();
  };
  window.addEventListener(eventName, callback);
  window.addEventListener("storage", sync);
  media.addEventListener("change", sync);
  return () => {
    window.removeEventListener(eventName, callback);
    window.removeEventListener("storage", sync);
    media.removeEventListener("change", sync);
  };
}
export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme ?? "light",
    () => "light",
  );
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="ops-icon-button ui-theme-toggle"
      aria-label="Dark mode"
      aria-pressed={dark}
      title={dark ? "Use light mode" : "Use dark mode"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(storageKey, next);
        } catch {
          /* The theme still works for this session. */
        }
        window.dispatchEvent(new Event(eventName));
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
          </>
        ) : (
          <path d="M20.5 14.2A9 9 0 0 1 9.8 3.5a9 9 0 1 0 10.7 10.7Z" />
        )}
      </svg>
    </button>
  );
}
