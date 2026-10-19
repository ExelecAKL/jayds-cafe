"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { BrandArtwork } from "@cafeos/shared/brand";
import { MinimalStartupScreen } from "@cafeos/shared/ui/minimal-startup";

const SPLASH_MINIMUM = 650;
// Long enough to see the cup top up before the screen fades.
const SPLASH_EXIT = 660;

export default function PosProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter(),
    pathname = usePathname(),
    { initialized, user, profile, profileLoading, signOut } = useAuth();
  const approved =
    profile &&
    ["staff", "admin"].includes(profile.role) &&
    profile.is_approved === true;
  useEffect(() => {
    if (!initialized) return;
    if (!user) router.replace("/login");
    else if (profile && !["staff", "admin"].includes(profile.role))
      router.replace("/login");
    else if (profile && profile.is_approved !== true)
      router.replace("/pending-approval");
  }, [initialized, user, profile, router]);

  const destination = pathname.includes("dashboard")
    ? "Opening orders…"
    : pathname.includes("void")
      ? "Opening cancellations…"
      : "Opening the register…";
  const steps = [
    "Checking your session…",
    "Verifying staff access…",
    destination,
  ];
  // Still checking: no session answer yet, or the staff profile is loading.
  const checking =
    !initialized || !user || (!profile && profileLoading !== false);
  const ready = !checking && !!approved;
  const openedAt = useRef(0);
  const [splash, setSplash] = useState<"show" | "leaving" | "gone">("show");
  useEffect(() => {
    if (!openedAt.current) openedAt.current = Date.now();
  }, []);
  useEffect(() => {
    if (!ready || splash !== "show") return;
    const wait = Math.max(0, SPLASH_MINIMUM - (Date.now() - openedAt.current));
    const timer = setTimeout(() => setSplash("leaving"), wait);
    return () => clearTimeout(timer);
  }, [ready, splash]);
  useEffect(() => {
    if (splash !== "leaving") return;
    const timer = setTimeout(() => setSplash("gone"), SPLASH_EXIT);
    return () => clearTimeout(timer);
  }, [splash]);

  if (checking)
    return (
      <MinimalStartupScreen
        steps={steps}
        step={!initialized || !user ? 0 : 1}
        caption="Jayds Café · Staff"
      />
    );
  if (!approved)
    return (
      <div className="pos-auth">
        <div className="pos-auth-card jm-reveal">
          <BrandArtwork variant="lockup" className="pos-auth-logo" />
          <h1 className="sr-only">Jayds Café staff access</h1>
          <p className="pos-notice">
            {profile
              ? "Approved staff access is required."
              : "Your staff profile could not be verified. Your saved draft remains on this terminal."}
          </p>
          <div className="pos-auth-actions">
            <button
              className="pos-button pos-primary"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
            <button
              className="pos-button"
              onClick={() =>
                void signOut().then(() => router.replace("/login"))
              }
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  return (
    <>
      {children}
      {splash !== "gone" && (
        <MinimalStartupScreen
          steps={steps}
          step={2}
          leaving={splash === "leaving"}
          caption="Jayds Café · Staff"
        />
      )}
    </>
  );
}
