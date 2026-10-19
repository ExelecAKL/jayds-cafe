"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@cafeos/shared/supabase/client";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import type { Voucher } from "@cafeos/shared/types";
import { useCart } from "../../../context/CartContext";
import { useCustomerToast } from "../../../context/CustomerToast";
import { customerHeaders } from "../../../context/CustomerFeatures";
import AppShell, {
  EmptyState,
  InlineNotice,
  WalletTabs,
} from "../../../components/AppShell";
import { VoucherGridSkeleton } from "../../../components/Skeletons";
import Icon from "../../../components/Icon";
export default function VouchersPage() {
  const { user } = useAuth();
  const [vouchers, setVouchers] = useState<Voucher[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState("");
  const { items, subtotal, applyVoucher, voucher: applied } = useCart();
  const notify = useCustomerToast();
  useEffect(() => {
    let active = true;
    void supabase
      .from("vouchers")
      .select(
        "id,code,description,discount_type,discount_value,min_order_amount,max_uses,uses_count,valid_from,valid_until,is_active,applicable_item_ids,application_mode,max_discount_amount,created_at",
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        const now = Date.now();
        if (fetchError)
          setError("Vouchers could not load. Please try again later.");
        else
          setVouchers(
            ((data ?? []) as Voucher[]).filter(
              (v) =>
                (!v.valid_from || Date.parse(v.valid_from) <= now) &&
                (!v.valid_until || Date.parse(v.valid_until) >= now) &&
                (v.max_uses === null || v.uses_count < v.max_uses),
            ),
          );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const applySelectedVoucher = async (voucher: Voucher) => {
    setFeedback("");
    setError("");
    if (!items.length) {
      setFeedback("Add something to your bag first, then choose a voucher.");
      return;
    }
    setBusy(voucher.id);
    try {
      const r = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: await customerHeaders(user?.id ?? null),
        body: JSON.stringify({
          code: voucher.code,
          subtotal,
          itemIds: items.map((i) => i.menu_item_id),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Voucher is not eligible.");
      applyVoucher(data);
      notify(`${voucher.code} applied. Final eligibility is confirmed at checkout.`, {
        icon: "wallet",
        action: { label: "Review bag", href: "/cart" },
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Voucher could not be checked.",
      );
    } finally {
      setBusy("");
    }
  };
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      notify(`${code} copied.`, { icon: "check" });
    } catch {
      setFeedback(`Copy this code: ${code}`);
    }
  };
  return (
    <AppShell
      title="Good things in your wallet."
      eyebrow="Jayds wallet"
      backHref="/account"
      cart
    >
      <WalletTabs active="vouchers" />
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {feedback && (
        <InlineNotice tone="success">
          {feedback}
          {items.length > 0 && (
            <Link href="/cart" className="text-link ml-3">
              Review bag
              <Icon name="arrowRight" size={16} />
            </Link>
          )}
        </InlineNotice>
      )}
      <p className="mb-5 text-sm text-text-secondary">
        Published offers for your next order. Minimum spend, eligible products,
        and remaining uses are checked again when you submit.
      </p>
      {loading ? (
        <VoucherGridSkeleton />
      ) : vouchers.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {vouchers.map((v) => (
            <article
              key={v.id}
              className="rounded-3xl border border-border bg-bg-card p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Jayds offer</p>
                  <h2 className="font-display text-3xl font-semibold">
                    {v.discount_type === "percentage"
                      ? `${Number(v.discount_value)}% off`
                      : `₱${Number(v.discount_value).toFixed(2)} off`}
                  </h2>
                </div>
                <span className="empty-icon !mb-0 !h-12 !w-12 !rounded-2xl">
                  <Icon name="wallet" />
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                {v.description || "An offer from Jayds Café."}
              </p>
              <div className="my-4 flex flex-wrap gap-2 text-xs text-text-secondary">
                <span className="rounded-lg bg-bg-primary px-3 py-2">
                  Min. ₱{Number(v.min_order_amount).toFixed(2)}
                </span>
                {v.application_mode === "selected_items" && (
                  <span className="rounded-lg bg-bg-primary px-3 py-2">
                    Selected products
                  </span>
                )}
                {v.max_discount_amount && (
                  <span className="rounded-lg bg-bg-primary px-3 py-2">
                    Up to ₱{Number(v.max_discount_amount).toFixed(2)}
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary">
                {v.valid_until
                  ? `Valid until ${new Date(v.valid_until).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" })}`
                  : "While the offer remains active"}
              </p>
              <div className="mt-5 flex items-center justify-between gap-2 border-t border-dashed border-border pt-4">
                <button
                  type="button"
                  onClick={() => void copy(v.code)}
                  className="min-h-12 px-1 font-mono text-sm font-semibold"
                  aria-label={`Copy code ${v.code}`}
                >
                  {v.code}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void applySelectedVoucher(v)}
                  className="btn-primary"
                >
                  {busy === v.id
                    ? "Checking…"
                    : applied?.code === v.code
                      ? "Applied"
                      : "Use voucher"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="wallet"
          title="More good things soon."
          description="There are no active published offers at the moment. Your loyalty balance is still available in Rewards."
          action={
            <Link href="/rewards" className="btn-secondary">
              View rewards
            </Link>
          }
        />
      )}
    </AppShell>
  );
}
