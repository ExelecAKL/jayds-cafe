"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import QRCode from "qrcode";
import AppShell, {
  EmptyState,
  InlineNotice,
} from "../../../components/AppShell";
import Icon, { type IconName } from "../../../components/Icon";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { useCustomerToast } from "../../../context/CustomerToast";

function AccountLink({
  href,
  label,
  description,
  icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: IconName;
}) {
  return (
    <Link href={href} className="account-row">
      <Icon name={icon} />
      <span className="flex-1">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <Icon name="chevronRight" size={18} />
    </Link>
  );
}
export default function AccountPage() {
  const { user, profile, initialized, loading, signOut } = useAuth();
  const router = useRouter();
  const notify = useCustomerToast();
  const logoutBusy = useRef(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [qr, setQr] = useState(""),
    [signingOut, setSigningOut] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setQr("");
    });
    if (profile?.account_qr_hash)
      void QRCode.toDataURL(`account:${profile.account_qr_hash}`, {
        width: 220,
        margin: 2,
        color: { dark: "#402817", light: "#ffffff" },
      })
        .then((url) => {
          if (active) setQr(url);
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [profile?.account_qr_hash]);
  const logout = async () => {
    if (logoutBusy.current || !logoutOpen || !user) return;
    logoutBusy.current = true;
    setSigningOut(true);
    setError("");
    try {
      await signOut();
      notify("You’re signed out.");
      router.replace("/menu");
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
      logoutBusy.current = false;
    }
  };
  return (
    <AppShell
      title={user ? "Your little Jayds corner." : "Make yourself at home."}
      mobileTitle="Account"
      eyebrow="Your account"
    >
      {!initialized || loading ? (
        <div className="space-y-4">
          <div className="skeleton h-40" />
          <div className="skeleton h-64" />
        </div>
      ) : (
        <>
          {error && !logoutOpen && (
            <InlineNotice tone="error">{error}</InlineNotice>
          )}
          <div className="account-grid">
            <div className="space-y-5">
              {user ? (
                <section className="account-member rounded-3xl border border-border bg-bg-card p-6">
                  <div className="flex items-center gap-4">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#402817] font-display text-2xl text-white">
                      {(profile?.full_name?.trim() || user.email || "JC")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display text-2xl font-semibold">
                        {profile?.full_name || "Jayds member"}
                      </h2>
                      <p className="mt-1 break-all text-sm text-text-secondary">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <Link href="/rewards" className="wallet-strip mt-5">
                    <span className="wallet-icon">
                      <Icon name="star" />
                    </span>
                    <div className="flex-1">
                      <strong className="text-base">
                        {(profile?.points ?? 0).toLocaleString()} points
                      </strong>
                      <p className="mt-1 text-xs text-text-secondary">
                        {profile?.loyalty_tier || "Member"} · View your rewards
                      </p>
                    </div>
                    <Icon name="chevronRight" size={18} />
                  </Link>
                </section>
              ) : (
                <EmptyState
                  icon="user"
                  title="Good coffee. More rewards."
                  description="Save your favorites, keep your order history, and make every coffee run a little more rewarding."
                  action={
                    <div className="flex flex-col gap-3">
                      <Link href="/login" className="btn-primary">
                        Sign in
                      </Link>
                      <Link href="/register" className="btn-secondary">
                        Create an account
                      </Link>
                    </div>
                  }
                />
              )}
              {user && qr && (
                <details className="account-qr rounded-3xl border border-border bg-bg-card px-5 py-2">
                  <summary className="min-h-12 cursor-pointer content-center font-semibold">
                    Your account QR
                  </summary>
                  <div className="mt-3 text-center">
                    <img
                      src={qr}
                      alt="Jayds account QR for the cashier"
                      width={220}
                      height={220}
                      className="mx-auto rounded-xl"
                    />
                    <p className="mt-3 text-xs text-text-secondary">
                      Show at the counter to link a POS order to your account.
                      Keep this code private.
                    </p>
                  </div>
                </details>
              )}
            </div>
            <div className="space-y-5">
              <section>
                <h2 className="eyebrow !mb-3">Your coffee routine</h2>
                <div className="account-links">
                  <AccountLink
                    href="/orders"
                    label="My orders"
                    description="Track, collect, or order again"
                    icon="orders"
                  />
                  <AccountLink
                    href="/favorites"
                    label="Favorites"
                    description="Your saved coffee and treats"
                    icon="heart"
                  />
                  <AccountLink
                    href="/rewards"
                    label="Rewards & vouchers"
                    description="Points, perks, and available offers"
                    icon="wallet"
                  />
                  {user && (
                    <AccountLink
                      href="/profile/addresses"
                      label="Saved addresses"
                      description="Your delivery destinations"
                      icon="pin"
                    />
                  )}
                </div>
              </section>
              <section>
                <h2 className="eyebrow !mb-3">Settings & support</h2>
                <div className="account-links">
                  {user && (
                    <AccountLink
                      href="/profile/edit"
                      label="Personal details"
                      description="Name, phone, and password"
                      icon="user"
                    />
                  )}
                  <AccountLink
                    href="/notifications"
                    label="Notifications"
                    description="Order alerts and device preferences"
                    icon="bell"
                  />
                  <AccountLink
                    href="/help"
                    label="Help & requests"
                    description="Order support and privacy requests"
                    icon="help"
                  />
                  <AccountLink
                    href="/privacy"
                    label="Privacy notice"
                    description="How Jayds handles your information"
                    icon="shield"
                  />
                  <AccountLink
                    href="/terms"
                    label="Terms of use"
                    description="Ordering and payment terms"
                    icon="orders"
                  />
                  {user && (
                    <button
                      type="button"
                      disabled={signingOut}
                      className="account-row"
                      onClick={() => {
                        setError("");
                        setLogoutOpen(true);
                      }}
                    >
                      <Icon name="logout" />
                      <span>
                        <strong>
                          {signingOut ? "Signing out…" : "Sign out"}
                        </strong>
                        <small>Sign out of your account on this device</small>
                      </span>
                    </button>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
      <ConfirmDialog
        open={logoutOpen && !!user}
        title="Are you sure you want to sign out?"
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        busy={signingOut}
        onConfirm={() => void logout()}
        onCancel={() => setLogoutOpen(false)}
      >
        <p>You’ll need to sign in again to access your account.</p>
        {error && <InlineNotice tone="error">{error}</InlineNotice>}
      </ConfirmDialog>
    </AppShell>
  );
}
