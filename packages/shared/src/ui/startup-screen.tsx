"use client";
// packages/shared/src/ui/startup-screen.tsx
// The branded opening screen for staff apps (Admin and POS). It covers the
// moments while the session and staff access are checked, names each step,
// and fades away once the workspace is ready. If loading stalls, it says so
// and offers a retry instead of spinning forever.
import { useEffect, useState } from "react";
import { BrandArtwork } from "../brand";

export function StartupScreen({
  app,
  steps,
  step,
  leaving = false,
  timeoutMs = 12_000,
  footer,
}: {
  /** Shown under the wordmark, for example "Back office". */
  app: string;
  /** What is happening, in order. */
  steps: string[];
  /** Index of the current step. */
  step: number;
  /** True while the screen fades out over the ready app. */
  leaving?: boolean;
  timeoutMs?: number;
  footer?: string;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (leaving) return;
    const timer = setTimeout(() => setSlow(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [leaving, timeoutMs, step]);
  const current = Math.max(0, Math.min(step, steps.length - 1));
  const label = steps[current];
  return (
    <div
      className={`jss${leaving ? " is-leaving" : ""}`}
      role={leaving ? undefined : "status"}
      aria-live="polite"
      aria-label={leaving ? undefined : label}
      aria-hidden={leaving || undefined}
    >
      <div className="jss-glow" aria-hidden="true" />
      <div className="jss-content">
        <div className="jss-mark" aria-hidden="true">
          <svg className="jss-steam" viewBox="0 0 60 36" width="60" height="36">
            <path d="M18 34c-6-8 6-12 0-20s4-10 0-14" />
            <path d="M30 34c-6-8 6-12 0-20s4-10 0-14" />
            <path d="M42 34c-6-8 6-12 0-20s4-10 0-14" />
          </svg>
          <span className="jss-symbol">
            <BrandArtwork variant="symbol" tone="cream" />
          </span>
          <span className="jss-ring" />
        </div>
        <div className="jss-brand" aria-hidden="true">
          <BrandArtwork variant="wordmark" tone="cream" className="jss-wordmark" />
          <span className="jss-app">{app}</span>
        </div>
        <div className="jss-progress" aria-hidden="true">
          <span
            className="jss-progress-fill"
            style={{ width: `${((current + 1) / (steps.length + 1)) * 100}%` }}
          />
          <span className="jss-progress-sheen" />
        </div>
        <p className="jss-step" key={label}>
          {slow ? "This is taking longer than usual." : label}
        </p>
        <ol className="jss-dots" aria-hidden="true">
          {steps.map((name, index) => (
            <li
              key={name}
              className={
                index < current ? "is-done" : index === current ? "is-current" : ""
              }
            />
          ))}
        </ol>
        {slow && !leaving && (
          <div className="jss-slow">
            <p>Check your Wi-Fi or mobile data. Your saved work is safe.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        )}
      </div>
      {footer && (
        <p className="jss-footer" aria-hidden="true">
          {footer}
        </p>
      )}
    </div>
  );
}
