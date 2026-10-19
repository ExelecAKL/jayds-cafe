// apps/admin/app/(admin)/loyalty/page.tsx
// Loyalty Management  -  tier overview, customer table, points adjustment

"use client";

import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import type { LoyaltyTier, Profile } from "@cafeos/shared/types";
import { PaginatedTable } from "../../../components/PaginatedTable";
import { useActionConfirm } from "@cafeos/shared/ui/action-confirm";
import { Drawer, Feedback, PageHeader, Icon, LoadingRows } from "../../../components/Operations";
import { notifyAdmin } from "../../../components/AdminToasts";

export default function LoyaltyPage() {
  const confirm = useActionConfirm();
  const [adjustError, setAdjustError] = useState("");
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [customers, setCustomers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [tierCounts, setTierCounts] = useState<Record<string, number>>({});
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const maskEmail = (email: string | null) => {
    if (!email) return "No email provided";
    const [local, domain] = email.split("@");
    if (!domain) return email;
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local.substring(0, 2)}***@${domain}`;
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Points adjustment modal
  const [adjustTarget, setAdjustTarget] = useState<Profile | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [{ data: tierData }, { data: customerData }] = await Promise.all([
      supabase.from("loyalty_tiers").select("*").order("min_points"),
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "customer")
        .order("points", { ascending: false })
        .limit(200),
    ]);

    if (tierData) setTiers(tierData as unknown as LoyaltyTier[]);
    if (customerData) {
      setCustomers(customerData as unknown as Profile[]);
      const counts: Record<string, number> = {};
      for (const c of customerData as unknown as Profile[]) {
        const tier = c.loyalty_tier || "Bronze";
        counts[tier] = (counts[tier] || 0) + 1;
      }
      setTierCounts(counts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const handleAdjust = async () => {
    if (adjustSaving || !adjustTarget || !adjustAmount) return;
    const amount = Number(adjustAmount);
    if (!Number.isSafeInteger(amount) || amount === 0) {
      setAdjustError("Enter a non-zero whole number of points.");
      return;
    }
    setAdjustSaving(true);
    setAdjustError("");
    try {
      const newPoints = Math.max(0, adjustTarget.points + amount);
      if (!Number.isSafeInteger(newPoints)) {
        setAdjustError("The resulting points balance is too large.");
        return;
      }
      if (
        !(await confirm({
          title: "Change this customer's points?",
          description:
            "Check the customer and resulting balance before saving this correction.",
          details: [
            adjustTarget.full_name || adjustTarget.email,
            `Points: ${adjustTarget.points} → ${newPoints}`,
            ...(adjustReason.trim() ? [`Reason: ${adjustReason.trim()}`] : []),
            ...(adjustTarget.points + amount < 0
              ? ["The balance will stop at zero."]
              : []),
          ],
          confirmLabel: "Save points balance",
          danger: amount < 0,
        }))
      )
        return;

      const { error } = await supabase
        .from("profiles")
        .update({ points: newPoints })
        .eq("id", adjustTarget.id);

      if (error) {
        setAdjustError("Could not save points. " + error.message);
        return;
      }

      notifyAdmin(
        `${adjustTarget.full_name || "Customer"} now has ${newPoints.toLocaleString()} points.`,
        "success",
      );
      setAdjustTarget(null);
      setAdjustAmount("");
      setAdjustReason("");
      void fetchData();
    } finally {
      setAdjustSaving(false);
    }
  };

  const filtered = search
    ? customers.filter(
        (c) =>
          (c.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
          c.email.toLowerCase().includes(search.toLowerCase()),
      )
    : customers;




  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingRows label="Loading customer points" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="CUSTOMER RELATIONSHIPS" title="Customer points" description="Track membership and review point balances." />

      {/* Tier Overview Cards */}
      <div className="tier-overview mb-8">
        {tiers.map((tier) => (
          <div
            key={tier.id}
            className="rounded-2xl p-5 shadow-sm border"

          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl"><Icon name="star" size={24} /></span>
              <div>
                <h3 className="font-bold text-ink">{tier.name}</h3>
                <p className="text-xs text-muted">
                  {tier.min_points}+ points
                </p>
              </div>
            </div>
            <p className="text-3xl font-bold" >
              {tierCounts[tier.name] || 0}
            </p>
            <p className="text-xs text-muted mt-1">members</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full max-w-md px-4 py-2.5 border border-subtle rounded-xl text-sm focus:ring-2 focus:ring-accent focus:border-warning-border"
        />
      </div>

      {/* Customer Loyalty Table */}
      <div className="bg-surface rounded-2xl shadow-sm border border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <PaginatedTable
            aria-label="Loyalty customers"
            resetKey={search}
            className="w-full text-sm"
          >
            <thead>
              <tr className="border-b border-subtle bg-raised">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">
                  Customer
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted uppercase">
                  Tier
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                  Points
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                  Total Spent
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                  Orders
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                  Last Order
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-raised">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">
                      {c.full_name || "Unnamed"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted font-mono">
                        {revealedIds.has(c.id) ? c.email : maskEmail(c.email)}
                      </p>
                      {c.email && (
                        <button
                          onClick={() => toggleReveal(c.id)}
                          className="text-xs bg-raised hover:bg-raised text-muted px-1.5 py-0.5 rounded transition-colors"
                          title="Reveal/Hide Sensitive Data"
                        >
                          {revealedIds.has(c.id) ? "Hide" : "Reveal"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"

                    >
                      <Icon name="star" size={14} /> {c.loyalty_tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-ink">
                    {c.points.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">
                    ₱{(c.total_spent || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">
                    {c.total_orders}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted">
                    {c.last_order_at
                      ? new Date(c.last_order_at).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                        })
                      : " - "}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setAdjustTarget(c)}
                      className="text-xs px-3 py-1.5 bg-warning-soft text-warning hover:bg-warning-soft rounded-lg font-medium transition-colors"
                    >
                      Adjust Points
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-muted"
                  >
                    No customers found
                  </td>
                </tr>
              )}
            </tbody>
          </PaginatedTable>
        </div>
      </div>

      {/* Points Adjustment Modal */}
      {adjustTarget && (
        <Drawer
          title="Adjust points"
          onClose={() => setAdjustTarget(null)}
          busy={adjustSaving}
        >
          <div>
            <p className="text-sm text-muted mb-4">
              {adjustTarget.full_name || adjustTarget.email}  -  Current:{" "}
              {adjustTarget.points.toLocaleString()} pts
            </p>

            <label
              htmlFor="points-adjustment"
              className="block text-sm font-medium text-ink mb-1"
            >
              Amount (positive=add, negative=deduct)
              <FieldRequirement required={true} />
            </label>
            <input
              id="points-adjustment"
              type="number"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              className="w-full px-4 py-2.5 border border-subtle rounded-xl mb-3 text-sm focus:ring-2 focus:ring-accent focus:border-warning-border"
              placeholder="e.g. 50 or -20"
            />

            <label
              htmlFor="points-review-note"
              className="block text-sm font-medium text-ink mb-1"
            >
              Review note
              <FieldRequirement required={false} />
            </label>
            <input
              id="points-review-note"
              type="text"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              className="w-full px-4 py-2.5 border border-subtle rounded-xl mb-4 text-sm focus:ring-2 focus:ring-accent focus:border-warning-border"
              placeholder="e.g. Customer service adjustment"
            />
            <p className="text-sm text-muted mb-4">
              This note appears in your confirmation for review. It is not saved
              to the customer’s history.
            </p>
            <Feedback error={adjustError} />

            <div className="flex gap-3">
              <button
                onClick={() => setAdjustTarget(null)}
                disabled={adjustSaving}
                className="flex-1 py-2.5 text-sm font-medium text-muted bg-raised rounded-xl hover:bg-raised transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjust}
                disabled={!adjustAmount || adjustSaving}
                className="flex-1 py-2.5 text-sm font-medium text-on-action bg-warning rounded-xl hover:bg-warning disabled:opacity-50 transition-colors"
              >
                {adjustSaving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
