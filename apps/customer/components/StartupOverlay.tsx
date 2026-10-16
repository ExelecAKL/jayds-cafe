"use client";
import Image from "next/image";
import { useStartupLoading } from "../context/StartupLoadingContext";
import BrandLoader from "./BrandLoader";
export default function StartupOverlay() {
  const { logoPhaseDone, isFadingOut, isOverlayVisible, startupTimedOut } =
    useStartupLoading();
  if (!isOverlayVisible) return null;
  return (
    <div
      className={`startup-overlay ${isFadingOut ? "is-leaving" : ""}`}
      aria-hidden={isFadingOut || undefined}
    >
      <div
        className={`startup-logo-scene ${logoPhaseDone ? "is-hidden" : ""}`}
        aria-hidden={logoPhaseDone}
      >
        <BrandLoader indicator={false} />
      </div>
      <div
        className={`startup-welcome-scene ${logoPhaseDone ? "is-visible" : ""}`}
        aria-hidden={!logoPhaseDone}
      >
        <Image
          src="/startup/welcome-loading-banner.png"
          width={1080}
          height={1920}
          unoptimized
          priority
          alt="Jayds Café. Order now."
        />
        <div className="startup-welcome-caption">
          <span
            className="brand-loading-dots"
            role="status"
            aria-label="Loading Jayds Café"
          >
            <i />
            <i />
            <i />
          </span>
          <p>Welcome to your little cup of happy.</p>
          {startupTimedOut && (
            <div className="startup-retry">
              <p role="alert">Loading is taking longer than expected.</p>
              <button
                className="btn-secondary"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
