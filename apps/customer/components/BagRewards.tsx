"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useCart } from "../context/CartContext";
import { customerHeaders } from "../context/CustomerFeatures";
import { InlineNotice } from "./AppShell";
import Icon from "./Icon";

export default function BagRewards() {
  const cart = useCart(),
    { user, profile } = useAuth();
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const maxPoints = Math.min(profile?.points ?? 0, Math.floor(cart.total * 10));
  async function apply() {
    if (busy || !code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: await customerHeaders(user?.id ?? null),
        body: JSON.stringify({
          code: code.trim(),
          subtotal: cart.subtotal,
          itemIds: cart.items.map((i) => i.menu_item_id),
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error)
        throw new Error(result.error || "Voucher unavailable.");
      cart.applyVoucher(result);
      setCode("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Voucher could not apply.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="surface-card bag-rewards">
      <div className="section-heading">
        <h2 className="section-title">A little extra for you</h2>
        <Icon name="wallet" size={22} />
      </div>
      <Link className="voucher-discovery" href="/vouchers">
        <span>
          <strong>Browse vouchers</strong>
          <small>Find an offer for this order</small>
        </span>
        <Icon name="chevronRight" size={20} />
      </Link>
      <label htmlFor="bag-voucher" className="block text-sm font-semibold">
        Have a voucher code?
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
          disabled={!code.trim() || busy}
          onClick={apply}
        >
          {busy ? "Checking…" : "Apply"}
        </button>
      </div>
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
