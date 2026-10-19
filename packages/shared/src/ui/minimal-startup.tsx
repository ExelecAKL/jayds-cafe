"use client";
// packages/shared/src/ui/minimal-startup.tsx
// A quiet opening screen for the cashier terminal: a line-drawn cup that
// fills a little more with each step, steam rising, and one line of status.
// Nothing else competes for attention; the motion carries the waiting.
import { useEffect, useId, useState } from "react";

// How full the cup is at each step, as the liquid's top edge in SVG units
// (the cup interior spans y 23 to 50).
const LEVELS = [43, 35, 27];

export function MinimalStartupScreen({
  steps,
  step,
  leaving = false,
  caption = "Jayds Café",
  timeoutMs = 12_000,
}: {
  steps: string[];
  step: number;
  leaving?: boolean;
  caption?: string;
  timeoutMs?: number;
}) {
  const clip = useId().replace(/:/g, "");
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (leaving) return;
    const timer = setTimeout(() => setSlow(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [leaving, timeoutMs]);
  const current = Math.max(0, Math.min(step, steps.length - 1));
  // Leaving means ready: the cup is full.
  const level = leaving ? 24 : LEVELS[Math.min(current, LEVELS.length - 1)];
  const label = slow && !leaving ? "Still connecting…" : steps[current];

  return (
    <div
      className={`jms${leaving ? " is-leaving" : ""}`}
      role={leaving ? undefined : "status"}
      aria-live="polite"
      aria-label={leaving ? undefined : label}
      aria-hidden={leaving || undefined}
    >
      <div className="jms-stage">
        <svg
          className="jms-cup"
          viewBox="0 0 64 64"
          width="96"
          height="96"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={clip}>
              <path d="M15 23h30v15a13 13 0 0 1-13 13h-4a13 13 0 0 1-13-13z" />
            </clipPath>
          </defs>
          <g className="jms-steam">
            <path d="M25 17c-2.5-3 2.5-5 0-8.5" />
            <path d="M32 17c-2.5-3 2.5-5 0-8.5" />
            <path d="M39 17c-2.5-3 2.5-5 0-8.5" />
          </g>
          <g clipPath={`url(#${clip})`}>
            <g
              className="jms-liquid"
              style={{ transform: `translateY(${level}px)` }}
            >
              <path
                className="jms-wave jms-wave-back"
                d="M0 0q4-2.4 8 0t8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0V40H0z"
              />
              <path
                className="jms-wave jms-wave-front"
                d="M0 0q4-2.4 8 0t8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0V40H0z"
              />
            </g>
          </g>
          <path
            className="jms-line jms-body"
            pathLength="1"
            d="M15 23h30v15a13 13 0 0 1-13 13h-4a13 13 0 0 1-13-13z"
          />
          <path
            className="jms-line jms-handle"
            pathLength="1"
            d="M45 27h3.5a5.5 5.5 0 0 1 0 11H45"
          />
          <path className="jms-line jms-saucer" pathLength="1" d="M11 56h38" />
        </svg>
        <p className="jms-label" key={label}>
          {label}
        </p>
        {slow && !leaving && (
          <button
            type="button"
            className="jms-retry"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        )}
      </div>
      <p className="jms-caption" aria-hidden="true">
        {caption}
      </p>
    </div>
  );
}
