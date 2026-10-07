"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { supabase } from "@cafeos/shared/supabase/client";
import type { LoyaltyTier } from "@cafeos/shared/types";
import AppShell, {
  EmptyState,
  InlineNotice,
  WalletTabs,
} from "../../../components/AppShell";
import Icon from "../../../components/Icon";
function perks(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}
export default function RewardsPage() {
  const { user, profile, initialized } = useAuth();
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void supabase
      .from("loyalty_tiers")
      .select("id,name,min_points,color,perks,badge_emoji,created_at")
      .order("min_points")
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError)
          setError("Rewards could not load. Please try again later.");
        else setTiers((data as LoyaltyTier[]) ?? []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const points = profile?.points ?? 0;
  const current = tiers.find((t) => t.name === profile?.loyalty_tier);
  const next = tiers.find((t) => t.min_points > points);
  const start = current?.min_points ?? 0;
  const progress = next
    ? Math.max(
        0,
        Math.min(
          100,
          (100 * (points - start)) / Math.max(1, next.min_points - start),
        ),
      )
    : 100;
  return (
    <AppShell
      title="Your coffee gives back."
      eyebrow="Jayds wallet"
      backHref="/account"
    >
      <WalletTabs active="rewards" />
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {!initialized || loading ? (
        <div className="space-y-4">
          <div className="skeleton h-56" />
          <div className="skeleton h-48" />
        </div>
      ) : !user ? (
        <EmptyState
          icon="star"
          title="A rewarding little routine."
          description="Sign in to see your points, current tier, and the café’s loyalty benefits."
          action={
            <Link href="/login" className="btn-primary">
              Sign in to Jayds
            </Link>
          }
        />
      ) : (
        <>
          <section className="overflow-hidden rounded-3xl bg-[#402817] p-6 text-[#fff7ed] sm:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-[#dfc6aa]">
                  {profile?.loyalty_tier || "Jayds"} member
                </p>
                <p className="mt-3 font-display text-5xl font-semibold tracking-tight">
                  {points.toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-[#dfc6aa]">Available points</p>
              </div>
              <Icon name="star" size={35} />
            </div>
            {next && (
              <div className="mt-7">
                <div className="mb-3 flex justify-between gap-3 text-xs text-[#ead8c4]">
                  <span>
                    {Math.max(0, next.min_points - points).toLocaleString()}{" "}
                    points to {next.name}
                  </span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Progress to ${next.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress)}
                  className="h-2 overflow-hidden rounded-full bg-white/15"
                >
                  <div
                    className="h-full rounded-full bg-[#edc79b]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
            <p className="mt-5 text-xs leading-relaxed text-[#dfc6aa]">
              Points shown are your current balance. Order benefits are final
              only after the server confirms the qualifying transaction.
            </p>
          </section>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {current && (
              <section className="rounded-3xl border border-border bg-bg-card p-6">
                <h2 className="section-title">Your {current.name} perks</h2>
                <div className="mt-4 space-y-3">
                  {perks(current.perks).map((perk, i) => (
                    <p className="flex gap-3 text-sm" key={i}>
                      <Icon
                        name="check"
                        size={18}
                        className="shrink-0 text-accent"
                      />
                      {perk}
                    </p>
                  ))}
                </div>
              </section>
            )}
            <section className="rounded-3xl border border-border bg-bg-card p-6">
              <h2 className="section-title">Make the most of Jayds</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                Apply eligible points and voucher codes while reviewing your
                order. Your account QR also links qualifying café purchases to
                this account.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-6">
                <Link href="/vouchers" className="text-link">
                  View vouchers
                  <Icon name="arrowRight" size={16} />
                </Link>
                <Link href="/account" className="text-link">
                  Account QR
                </Link>
              </div>
            </section>
          </div>
          {tiers.length > 0 && (
            <section className="mt-7">
              <h2 className="section-title mb-4">
                A little more with every tier
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tiers.map((tier) => (
                  <article
                    key={tier.id}
                    className="rounded-2xl border border-border bg-bg-card p-5"
                  >
                    <div className="flex justify-between">
                      <h3 className="font-display text-xl font-semibold">
                        {tier.name}
                      </h3>
                      <Icon name="star" size={20} />
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      From {Number(tier.min_points).toLocaleString()} points
                    </p>
                    <div className="mt-4 space-y-2">
                      {perks(tier.perks).map((perk, i) => (
                        <p
                          className="text-sm leading-relaxed text-text-secondary"
                          key={i}
                        >
                          {perk}
                        </p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
