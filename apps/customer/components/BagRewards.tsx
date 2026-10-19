"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useCart } from "../context/CartContext";
import { customerHeaders } from "../context/CustomerFeatures";
import { InlineNotice } from "./AppShell";
import Icon from "./Icon";
import { supabase } from "@cafeos/shared/supabase/client";
import type { Voucher } from "@cafeos/shared/types";
import { useCustomerToast } from "../context/CustomerToast";
import { Skeleton, SkeletonStatus } from "./Skeletons";

export default function BagRewards() {
  const cart = useCart(),
    { user, profile } = useAuth();
  const notify = useCustomerToast();
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select(
          "id,code,description,discount_type,discount_value,min_order_amount,max_uses,uses_count,valid_from,valid_until,is_active,application_mode,max_discount_amount",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (!active) return;
      const now = Date.now();
      setLoadError(!!error);
      setVouchers(
        error
          ? []
          : ((data ?? []) as Voucher[]).filter(
              (voucher) =>
                (!voucher.valid_from ||
                  Date.parse(voucher.valid_from) <= now) &&
                (!voucher.valid_until ||
                  Date.parse(voucher.valid_until) >= now) &&
                (voucher.max_uses == null ||
                  voucher.uses_count < voucher.max_uses),
            ),
      );
      setLoading(false);
    })().catch(() => {
      if (active) {
        setLoadError(true);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [reload]);
  const maxPoints = Math.min(profile?.points ?? 0, Math.floor(cart.total * 10));
  async function apply(selectedCode = code) {
    const requestedCode = selectedCode.trim();
    if (busy || !requestedCode) return;
    setBusy(requestedCode);
    setError("");
    try {
      const response = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: await customerHeaders(user?.id ?? null),
        body: JSON.stringify({
          code: requestedCode,
          subtotal: cart.subtotal,
          itemIds: cart.items.map((i) => i.menu_item_id),
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error)
        throw new Error(result.error || "Voucher unavailable.");
      await customerHeaders(user?.id ?? null);
      cart.applyVoucher(result);
      setCode("");
      notify(`${requestedCode} applied to your bag.`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Voucher could not apply.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="surface-card bag-rewards">
      <div className="section-heading">
        <h2 className="section-title">A little extra for you</h2>
        <Icon name="wallet" size={22} />
      </div>
      <div
        className="bag-voucher-choices"
        role="group"
        aria-label="Choose a voucher"
        aria-busy={loading}
      >
        <p className="voucher-choice-intro">Choose a voucher</p>
        {loading ? (
          <SkeletonStatus label="Loading offers…" className="grid gap-2">
            {[0, 1].map((index) => (
              <span className="voucher-choice-skeleton" key={index}>
                <span className="jsk-stack">
                  <Skeleton width={index ? 96 : 120} height={14} />
                  <Skeleton width={index ? 150 : 180} height={11} />
                </span>
                <Skeleton shape="pill" width={72} height={40} />
              </span>
            ))}
          </SkeletonStatus>
        ) : loadError ? (
          <div className="voucher-choice-note" role="status">
            Offers could not load.{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setLoading(true);
                setLoadError(false);
                setReload((value) => value + 1);
              }}
            >
              Retry
            </button>
          </div>
        ) : vouchers.length ? (
          vouchers.slice(0, 3).map((voucher) => (
            <article className="bag-voucher-choice" key={voucher.id}>
              <div>
                <strong>
                  {voucher.discount_type === "percentage"
                    ? `${Number(voucher.discount_value)}% off`
                    : `₱${Number(voucher.discount_value).toFixed(2)} off`}
                </strong>
                <span>
                  {voucher.code} · Min. ₱
                  {Number(voucher.min_order_amount).toFixed(2)}
                </span>
                {voucher.application_mode === "selected_items" && (
                  <small>Selected products</small>
                )}
                {voucher.max_discount_amount && (
                  <small>
                    Up to ₱{Number(voucher.max_discount_amount).toFixed(2)} off
                  </small>
                )}
              </div>
              <button
                type="button"
                className="btn-secondary voucher-choice-apply"
                aria-label={`${cart.voucher?.code === voucher.code ? "Applied" : "Apply"} voucher ${voucher.code}`}
                disabled={!!busy || cart.voucher?.code === voucher.code}
                onClick={() => void apply(voucher.code)}
              >
                {busy === voucher.code
                  ? "Checking…"
                  : cart.voucher?.code === voucher.code
                    ? "Applied"
                    : "Apply"}
              </button>
            </article>
          ))
        ) : (
          <p className="voucher-choice-note">
            No published offers right now. You can still enter a code below.
          </p>
        )}
        <Link className="text-link" href="/vouchers">
          Browse all vouchers <Icon name="arrowRight" size={17} />
        </Link>
      </div>
      <details className="voucher-code-fallback">
        <summary>
          Enter a voucher code <Icon name="chevronRight" size={18} />
        </summary>
        <label htmlFor="bag-voucher" className="sr-only">
          Voucher code
        </label>
        <div className="voucher-entry">
          <input
            id="bag-voucher"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={64}
            placeholder="Enter code"
            autoCapitalize="characters"
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={!code.trim() || !!busy}
            onClick={() => void apply()}
          >
            {busy ? "Checking…" : "Apply code"}
          </button>
        </div>
      </details>
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {cart.voucher && (
        <div className="applied-voucher" role="status">
          <span>
            <Icon name="check" size={18} /> {cart.voucher.code} applied
          </span>
          <button
            type="button"
            aria-label="Remove voucher"
            onClick={cart.removeVoucher}
          >
            Remove
          </button>
        </div>
      )}
      {user && (
        <label className="bag-points">
          Use rewards points{" "}
          <small>{profile?.points ?? 0} available · 10 points = ₱1</small>
          <input
            type="number"
            min={0}
            max={maxPoints}
            step={1}
            value={Math.min(cart.pointsToRedeem, maxPoints) || ""}
            placeholder="0"
            onChange={(e) =>
              cart.setPointsToRedeem(
                Math.min(maxPoints, Number(e.target.value)),
              )
            }
          />
          <small>Use up to {maxPoints} points on this bag.</small>
        </label>
      )}
    </section>
  );
}
