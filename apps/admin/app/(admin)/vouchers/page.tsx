// apps/admin/app/(admin)/vouchers/page.tsx
// Admin voucher management — create, deploy, view claims

"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useActionConfirm } from "@cafeos/shared/ui/action-confirm";
import { Feedback, Drawer, PageHeader } from "../../../components/Operations";

import { withRequestDeadline } from "@cafeos/shared/utils/request";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@cafeos/shared/supabase/client";

interface Voucher {
  id: string;
  code: string;
  description: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  target_tier: string | null;
  frequency_limit: number | null;
  deployed_at: string | null;
  applicable_item_ids: string[] | null;
  application_mode: "whole_order" | "selected_items";
  max_discount_amount: number | null;
  created_at: string;
}

interface MenuItem {
  id: string;
  name: string;
}

export default function VouchersPage() {
  const confirm = useActionConfirm();
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const defaultForm = {
    code: "",
    description: "",
    discount_type: "percentage" as "percentage" | "fixed",
    discount_value: 10,
    min_order_amount: 0,
    max_uses: "",
    valid_until: "",
    target_tier: "",
    frequency_limit: "",
    application_mode: "whole_order" as "whole_order" | "selected_items",
    applicable_item_ids: [] as string[],
    max_discount_amount: "",
  };

  const [formData, setFormData] = useState(defaultForm);

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await withRequestDeadline((signal) =>
        supabase
          .from("vouchers")
          .select("*")
          .order("created_at", { ascending: false })
          .abortSignal(signal),
      );
      if (error) throw error;
      setVouchers((data ?? []) as Voucher[]);
    } catch {
      setActionError("Vouchers could not load. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMenuItems = useCallback(async () => {
    const { data } = await supabase
      .from("menu_items")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    if (data) setMenuItems(data);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchVouchers);
    void Promise.resolve().then(fetchMenuItems);
  }, [fetchVouchers, fetchMenuItems]);

  const filteredVouchers = vouchers.filter(
    (v) =>
      v.code.toLowerCase().includes(search.toLowerCase()) ||
      (v.description || "").toLowerCase().includes(search.toLowerCase()),
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setActionError("");
    setSaving(true);
    try {
      const payload = {
        code: formData.code.trim().toUpperCase(),
        description: formData.description,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
        min_order_amount: formData.min_order_amount,
        max_uses: formData.max_uses ? Number(formData.max_uses) : null,
        valid_until: formData.valid_until || null,
        target_tier: formData.target_tier || null,
        frequency_limit: formData.frequency_limit
          ? Number(formData.frequency_limit)
          : null,
        application_mode: formData.application_mode,
        applicable_item_ids:
          formData.applicable_item_ids.length > 0
            ? formData.applicable_item_ids
            : null,
        max_discount_amount: formData.max_discount_amount
          ? Number(formData.max_discount_amount)
          : null,
      };

      if (
        !payload.code ||
        !Number.isFinite(payload.discount_value) ||
        payload.discount_value <= 0 ||
        (payload.discount_type === "percentage" &&
          payload.discount_value > 100) ||
        !Number.isFinite(payload.min_order_amount) ||
        payload.min_order_amount < 0 ||
        [payload.max_uses, payload.frequency_limit].some(
          (value) =>
            value !== null && (!Number.isSafeInteger(value) || value < 1),
        ) ||
        (payload.max_discount_amount !== null &&
          (!Number.isFinite(payload.max_discount_amount) ||
            payload.max_discount_amount <= 0))
      ) {
        setActionError(
          "Enter a positive discount, a percentage up to 100%, and valid spending or usage limits.",
        );
        return;
      }
      if (
        payload.application_mode === "selected_items" &&
        !payload.applicable_item_ids?.length
      ) {
        setActionError(
          "Choose at least one product for a Selected Items voucher.",
        );
        return;
      }

      let count = 0;
      if (editingId) {
        const { count: editCount } = await supabase
          .from("vouchers")
          .select("*", { count: "exact", head: true })
          .ilike("code", payload.code)
          .neq("id", editingId);
        count = editCount || 0;
      } else {
        const { count: addCount } = await supabase
          .from("vouchers")
          .select("*", { count: "exact", head: true })
          .ilike("code", payload.code);
        count = addCount || 0;
      }

      if (count > 0) {
        setActionError(`A voucher with code "${payload.code}" already exists.`);
        return;
      }

      if (
        !(await confirm({
          title: editingId
            ? "Save these voucher changes?"
            : "Create this active voucher?",
          description:
            "Check the discount and limits before making this code available to eligible customers.",
          details: [
            payload.code,
            `Discount: ${payload.discount_type === "percentage" ? payload.discount_value + "%" : "₱" + payload.discount_value}`,
            `Minimum order: ₱${payload.min_order_amount}`,
            `Maximum uses: ${payload.max_uses ?? "Unlimited"}`,
            `Expiry: ${payload.valid_until ?? "No expiry"}`,
          ],
          confirmLabel: editingId ? "Save voucher changes" : "Create voucher",
        }))
      )
        return;
      if (editingId) {
        const { error } = await supabase
          .from("vouchers")
          .update(payload)
          .eq("id", editingId);
        if (error) {
          setActionError("Could not update voucher. " + error.message);
          return;
        }
      } else {
        const { error } = await supabase.from("vouchers").insert({
          ...payload,
          valid_from: new Date().toISOString(),
          is_active: true,
        });
        if (error) {
          setActionError("Could not create voucher. " + error.message);
          return;
        }
      }

      setShowForm(false);
      setEditingId(null);
      setFormData(defaultForm);
      void fetchVouchers();
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (v: Voucher) => {
    setFormData({
      code: v.code,
      description: v.description || "",
      discount_type: v.discount_type,
      discount_value: v.discount_value,
      min_order_amount: v.min_order_amount || 0,
      max_uses: v.max_uses ? String(v.max_uses) : "",
      valid_until: v.valid_until
        ? new Date(v.valid_until).toISOString().split("T")[0]
        : "",
      target_tier: v.target_tier || "",
      frequency_limit: v.frequency_limit ? String(v.frequency_limit) : "",
      application_mode: v.application_mode || "whole_order",
      applicable_item_ids: v.applicable_item_ids || [],
      max_discount_amount: v.max_discount_amount
        ? String(v.max_discount_amount)
        : "",
    });
    setEditingId(v.id);
    setShowForm(true);
  };

  const toggleActive = async (id: string, current: boolean) => {
    if (
      !(await confirm({
        title: current ? "Pause this voucher?" : "Enable this voucher?",
        description: current
          ? "Customers will not be able to apply this code to new orders while it is paused."
          : "Customers can use this code when its dates, minimum spend, and usage limits allow it.",
        details: [vouchers.find((v) => v.id === id)?.code || "Voucher"],
        confirmLabel: current ? "Pause voucher" : "Enable voucher",
      }))
    )
      return;
    const { error } = await supabase
      .from("vouchers")
      .update({ is_active: !current })
      .eq("id", id);
    if (error) {
      setActionError("Could not change voucher status. " + error.message);
      return;
    }
    setActionError("");
    void fetchVouchers();
  };

  return (
    <div>
      {!showForm && <Feedback error={actionError} />}
      <PageHeader
        eyebrow="CUSTOMER OFFERS"
        title="Vouchers"
        description="Create offers and control when customers can use them."
      >
        <button
          className="ops-button"
          disabled={loading}
          onClick={() => void fetchVouchers()}
        >
          Refresh
        </button>
        <button
          className="ops-button primary"
          onClick={() => {
            setEditingId(null);
            setFormData(defaultForm);
            setShowForm(true);
          }}
        >
          + Create Voucher
        </button>
      </PageHeader>
      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search vouchers..."
        className="w-full mb-4 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
        </div>
      ) : filteredVouchers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No vouchers found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVouchers.map((v) => (
            <div
              key={v.id}
              className={`bg-white rounded-2xl p-5 shadow-sm border ${v.is_active ? "border-gray-100" : "border-red-100 opacity-60"}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-lg font-bold text-gray-900 font-mono">
                    {v.code}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {v.description}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${v.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                >
                  {v.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {v.applicable_item_ids && v.applicable_item_ids.length > 0 && (
                <div className="mb-3 px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-[10px] text-amber-800 font-semibold uppercase tracking-wider mb-0.5">
                    Item Restrictions
                  </p>
                  <p className="text-xs text-amber-900">
                    {v.application_mode === "selected_items"
                      ? "Discount applies ONLY to selected items."
                      : "Must buy selected items to get order discount."}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
                <div>
                  <span className="text-gray-400">Discount</span>
                  <p className="font-semibold text-gray-900">
                    {v.discount_type === "percentage"
                      ? `${v.discount_value}%`
                      : `₱${v.discount_value}`}
                    {v.discount_type === "percentage" &&
                      v.max_discount_amount && (
                        <span className="text-[10px] text-gray-500 ml-1">
                          (up to ₱{v.max_discount_amount})
                        </span>
                      )}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400">Uses</span>
                  <p className="font-semibold text-gray-900">
                    {v.uses_count}
                    {v.max_uses ? ` / ${v.max_uses}` : " / ∞"}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400">Min Order</span>
                  <p className="font-semibold text-gray-900">
                    ₱{v.min_order_amount}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400">Expires</span>
                  <p className="font-semibold text-gray-900">
                    {v.valid_until
                      ? new Date(v.valid_until).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                        })
                      : "Never"}
                  </p>
                </div>
                {v.target_tier && (
                  <div>
                    <span className="text-gray-400">Tier</span>
                    <p className="font-semibold text-gray-900 capitalize">
                      {v.target_tier}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(v)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleActive(v.id, v.is_active)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                    v.is_active
                      ? "bg-red-50 text-red-600 hover:bg-red-100"
                      : "bg-green-50 text-green-600 hover:bg-green-100"
                  }`}
                >
                  {v.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <Drawer
          title={editingId ? "Edit Voucher" : "Create Voucher"}
          onClose={() => setShowForm(false)}
          busy={saving}
        >
          <form
            onSubmit={handleSave}
            className="ops-form"
            onInvalidCapture={(event) => {
              const details = (event.target as HTMLElement).closest("details");
              if (details) details.open = true;
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Feedback error={actionError} />

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Code
                <FieldRequirement required={true} />
              </label>
              <input
                aria-label="Voucher code"
                required
                value={formData.code}
                onChange={(e) =>
                  setFormData({ ...formData, code: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono uppercase"
                placeholder="JAYDS10"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Description
                <FieldRequirement required={true} />
              </label>
              <input
                aria-label="Voucher description"
                required
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                placeholder="10% off your next order"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Discount Type
                  <FieldRequirement required={true} />
                </label>
                <select
                  aria-label="Discount type"
                  value={formData.discount_type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      discount_type: e.target.value as "percentage" | "fixed",
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed (₱)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Discount Value
                  <FieldRequirement required={true} />
                </label>
                <input
                  aria-label="Discount value"
                  required
                  type="number"
                  min={0.01}
                  step="0.01"
                  max={
                    formData.discount_type === "percentage" ? 100 : undefined
                  }
                  value={formData.discount_value}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      discount_value: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Min Order (₱)
                  <FieldRequirement required={false} />
                </label>
                <input
                  aria-label="Minimum order amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.min_order_amount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      min_order_amount: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Max Uses
                  <FieldRequirement required={false} />
                </label>
                <input
                  aria-label="Maximum uses"
                  type="number"
                  min={1}
                  value={formData.max_uses}
                  onChange={(e) =>
                    setFormData({ ...formData, max_uses: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  placeholder="Unlimited"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Target Tier
                  <FieldRequirement required={false} />
                </label>
                <select
                  aria-label="Target tier"
                  value={formData.target_tier}
                  onChange={(e) =>
                    setFormData({ ...formData, target_tier: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                >
                  <option value="">All Members</option>
                  <option value="bronze">Bronze</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Valid Until
                  <FieldRequirement required={false} />
                </label>
                <input
                  aria-label="Valid until"
                  type="date"
                  value={formData.valid_until}
                  onChange={(e) =>
                    setFormData({ ...formData, valid_until: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                />
              </div>
            </div>

            <details
              className="ops-disclosure"
              open={
                formData.application_mode === "selected_items" ||
                formData.applicable_item_ids.length > 0 ||
                !!formData.max_discount_amount
              }
            >
              <summary>Product rules & discount limit</summary>

              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Application Mode
                  <FieldRequirement required={true} />
                </label>
                <select
                  aria-label="Application mode"
                  value={formData.application_mode}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      application_mode: e.target.value as
                        "whole_order" | "selected_items",
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                >
                  <option value="whole_order">
                    Apply discount to Whole Order
                  </option>
                  <option value="selected_items">
                    Apply discount ONLY to Selected Items
                  </option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  If Whole Order and items are selected below, the cart must
                  contain at least one selected item to trigger the discount.
                </p>
              </div>

              {formData.discount_type === "percentage" && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Maximum Discount Cap (₱)
                    <FieldRequirement required={false} />
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.max_discount_amount}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        max_discount_amount: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    placeholder="e.g. 50 (Caps the percentage discount)"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Restricted Items
                  <FieldRequirement required={false} />
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                  {menuItems.map((item) => {
                    const isSelected = formData.applicable_item_ids.includes(
                      item.id,
                    );
                    return (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 text-sm p-1 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                applicable_item_ids: [
                                  ...formData.applicable_item_ids,
                                  item.id,
                                ],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                applicable_item_ids:
                                  formData.applicable_item_ids.filter(
                                    (id) => id !== item.id,
                                  ),
                              });
                            }
                          }}
                          className="rounded text-amber-500 focus:ring-amber-500"
                        />
                        <span className="text-gray-700">{item.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </details>

            <button
              type="submit"
              disabled={saving}
              className="ops-button primary ops-sticky-actions"
            >
              {saving
                ? "Saving…"
                : editingId
                  ? "Save Changes"
                  : "Create Voucher"}
            </button>
          </form>
        </Drawer>
      )}
    </div>
  );
}
