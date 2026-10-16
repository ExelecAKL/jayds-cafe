"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { notifyAdmin } from "./AdminToasts";
import { stockReason } from "../lib/stock-copy";
import { useActionConfirm } from "@cafeos/shared/ui/action-confirm";
import { createUuid } from "@cafeos/shared/utils/uuid";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@cafeos/shared/supabase/client";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useMenu } from "@cafeos/shared/hooks/useMenu";
import type {
  MenuItem,
  MenuItemIngredient,
  VariantIngredient,
  ItemVariant,
} from "@cafeos/shared/types";
import type { StockKind } from "@cafeos/shared/inventory/types";
import {
  Badge,
  businessDate,
  Drawer,
  Empty,
  Feedback,
  Icon,
  PageHeader,
  peso,
  quantity,
  useOperations,
  type OperationalStock,
} from "./Operations";
import { MenuItemForm } from "./MenuItemForm";
import InventoryReadiness from "./InventoryReadiness";
import { PaginatedTable } from "./PaginatedTable";
import {
  StockRecordDrawer,
  StockForecastDrawer,
  ReplenishmentReview,
} from "./StockInsights";

type Tab =
  "stock" | "recipes" | "movements" | "waste" | "stocktakes" | "forecasts";
const tabs: { key: Tab; label: string }[] = [
  { key: "stock", label: "Stock items" },
  { key: "recipes", label: "Recipes" },
  { key: "movements", label: "Movements" },
  { key: "waste", label: "Waste" },
  { key: "stocktakes", label: "Physical counts" },
  { key: "forecasts", label: "Stock planning" },
];
function StockForm({
  item,
  onClose,
}: {
  item: OperationalStock | null;
  onClose: () => void;
}) {
  const ops = useOperations();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: item?.name ?? "",
    sku: item?.sku ?? "",
    unit: item?.unit ?? "g",
    stock_kind: item?.stock_kind ?? "ingredient",
    cost_per_unit: String(item?.cost_per_unit ?? 0),
    min_stock_alert: String(item?.min_stock_alert ?? 0),
    max_stock: item?.max_stock == null ? "" : String(item.max_stock),
    supplier_id: item?.supplier_id ?? "",
    pack_size: String(item?.pack_size ?? 1),
    min_purchase_packs: String(item?.min_purchase_packs ?? 1),
    lead_time_days: String(item?.lead_time_days ?? 3),
    safety_days: String(item?.safety_days ?? 2),
    review_days: String(item?.review_days ?? 7),
    is_active: item?.is_active ?? true,
  });
  const field = (key: keyof typeof form) => ({
    value: String(form[key]),
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) => setForm((previous) => ({ ...previous, [key]: event.target.value })),
  });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const numeric = [
        "cost_per_unit",
        "min_stock_alert",
        "pack_size",
        "min_purchase_packs",
        "lead_time_days",
        "safety_days",
        "review_days",
      ] as const;
      if (
        numeric.some(
          (key) => !Number.isFinite(Number(form[key])) || Number(form[key]) < 0,
        ) ||
        Number(form.pack_size) <= 0 ||
        Number(form.review_days) < 1 ||
        Number(form.min_purchase_packs) < 1
      )
        throw new Error("Enter valid stock and replenishment settings.");
      const payload = {
        ...form,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        stock_kind: form.stock_kind as StockKind,
        supplier_id: form.supplier_id || null,
        supplier:
          ops.suppliers.find((s) => s.id === form.supplier_id)?.name ?? null,
        cost_per_unit: Number(form.cost_per_unit),
        min_stock_alert: Number(form.min_stock_alert),
        max_stock: form.max_stock === "" ? null : Number(form.max_stock),
        pack_size: Number(form.pack_size),
        min_purchase_packs: Number(form.min_purchase_packs),
        lead_time_days: Number(form.lead_time_days),
        safety_days: Number(form.safety_days),
        review_days: Number(form.review_days),
      };
      const result = item
        ? await supabase.from("ingredients").update(payload).eq("id", item.id)
        : await supabase.from("ingredients").insert(payload);
      if (result.error) throw new Error(result.error.message);
      await ops.refresh();
      notifyAdmin("Stock item saved.", "success");
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={item ? "Edit stock item" : "Add stock item"}
      description="Use the smallest unit consumed by your recipes."
      onClose={onClose}
      busy={busy}
    >
      <Feedback error={error} />
      <form className="ops-form" onSubmit={save}>
        <label>
          Item name
          <FieldRequirement required={true} />
          <input required {...field("name")} />
        </label>
        <div className="ops-form-grid">
          <label>
            Item code (SKU)
            <FieldRequirement required={false} />
            <input {...field("sku")} />
          </label>
          <label>
            Stock type
            <FieldRequirement required={true} />
            <select {...field("stock_kind")}>
              <option value="ingredient">Ingredient</option>
              <option value="packaging">Packaging</option>
              <option value="finished_good">Finished good</option>
            </select>
          </label>
          <label>
            Base unit
            <FieldRequirement required={true} />
            <select
              {...field("unit")}
              disabled={!!item && Number(item.current_stock) > 0}
            >
              <option value="g">Grams (g)</option>
              <option value="ml">Milliliters (ml)</option>
              <option value="pcs">Pieces (pcs)</option>
              {item && !["g", "ml", "pcs"].includes(item.unit) && (
                <option>{item.unit}</option>
              )}
            </select>
          </label>
          <label>
            Estimated cost / base unit
            <FieldRequirement required={true} />
            <input
              type="number"
              min="0"
              step="any"
              required
              {...field("cost_per_unit")}
            />
          </label>
          <label>
            Minimum stock alert
            <FieldRequirement required={true} />
            <input
              type="number"
              min="0"
              step="any"
              required
              {...field("min_stock_alert")}
            />
          </label>
          <label>
            Maximum stock
            <FieldRequirement required={false} />
            <input type="number" min="0" step="any" {...field("max_stock")} />
          </label>
        </div>
        <h3 className="ops-section-title">Supplier & stock planning</h3>
        <label>
          Preferred supplier
          <FieldRequirement required={false} />
          <select {...field("supplier_id")}>
            <option value="">No supplier assigned</option>
            {ops.suppliers
              .filter((s) => s.is_active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <div className="ops-form-grid">
          <label>
            Base units per purchasing pack
            <FieldRequirement required={true} />
            <input
              type="number"
              min="0.001"
              step="any"
              required
              {...field("pack_size")}
            />
            <small>Example: a 1-liter bottle = 1,000 ml.</small>
          </label>
          <label>
            Minimum packs
            <FieldRequirement required={true} />
            <input
              type="number"
              min="1"
              step="1"
              required
              {...field("min_purchase_packs")}
            />
          </label>
          <label>
            Supplier delivery time (days)
            <FieldRequirement required={true} />
            <input
              type="number"
              min="0"
              step="1"
              required
              {...field("lead_time_days")}
            />
          </label>
          <label>
            Extra stock buffer (days)
            <FieldRequirement required={true} />
            <input
              type="number"
              min="0"
              step="1"
              required
              {...field("safety_days")}
            />
          </label>
          <label>
            Days between stock reviews
            <FieldRequirement required={true} />
            <input
              type="number"
              min="1"
              step="1"
              required
              {...field("review_days")}
            />
          </label>
        </div>
        <label className="ops-check-label">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) =>
              setForm((previous) => ({
                ...previous,
                is_active: e.target.checked,
              }))
            }
          />
          Active stock item
          <FieldRequirement required={false} />
        </label>
        <div className="ops-form-actions">
          <button
            type="button"
            className="ops-button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="ops-button primary" disabled={busy}>
            {busy ? "Saving…" : "Save item"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
function MovementForm({
  kind,
  initial,
  onClose,
}: {
  kind: "receipt" | "waste" | "count";
  initial?: OperationalStock;
  onClose: () => void;
}) {
  const ops = useOperations();
  const confirm = useActionConfirm();
  const { user } = useAuth();
  const [id, setId] = useState(initial?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cost, setCost] = useState(String(initial?.cost_per_unit ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key] = useState(() => createUuid());
  const [countSnapshot, setCountSnapshot] = useState(
    initial
      ? { version: initial.stock_version, expected: initial.current_stock }
      : null,
  );
  const [countId, setCountId] = useState<string | null>(null);
  const item = ops.stock.find((row) => row.id === id);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (
        !item ||
        !Number.isFinite(Number(amount)) ||
        Number(amount) < (kind === "count" ? 0 : Number.MIN_VALUE) ||
        !reason.trim()
      )
        throw new Error(
          "Select an item and enter a valid quantity and reason.",
        );
      const nextStock =
        kind === "count"
          ? Number(amount)
          : Number(item.current_stock) +
            (kind === "waste" ? -1 : 1) * Number(amount);
      if (
        !(await confirm({
          title:
            kind === "count"
              ? "Save this physical count?"
              : kind === "waste"
                ? "Record this waste?"
                : "Add this delivery to stock?",
          description:
            kind === "count"
              ? "This replaces the recorded stock with the quantity you counted. Check the actual stock before continuing."
              : "This records a physical stock movement and updates availability for the POS and customer menu.",
          details: [
            item.name,
            `Quantity: ${quantity(Number(amount))} ${item.unit}`,
            `On hand: ${quantity(Number(item.current_stock))} → ${quantity(nextStock)} ${item.unit}`,
            `Reason: ${reason.trim()}`,
          ],
          confirmLabel:
            kind === "count"
              ? "Save physical count"
              : kind === "waste"
                ? "Record waste"
                : "Receive stock",
          danger:
            kind === "waste" ||
            (kind === "count" && nextStock < Number(item.current_stock)),
        }))
      )
        return;
      if (kind === "count") {
        if (!countSnapshot)
          throw new Error(
            "Select the item again to record its counting baseline.",
          );
        let saved = countId;
        if (!saved) {
          const { data, error } = await supabase
            .from("stocktakes")
            .insert({
              ingredient_id: id,
              expected: countSnapshot.expected,
              counted: Number(amount),
              version: countSnapshot.version,
              reason: reason.trim(),
              actor_id: user?.id,
              state: "draft",
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          saved = data.id;
          setCountId(saved);
        }
        await ops.run("inv_post_stocktake", { p_id: saved });
      } else
        await ops.run("inv_post_movement", {
          p_item: id,
          p_quantity: Number(amount),
          p_kind: kind,
          p_reason: reason.trim(),
          p_cost: Number(cost),
          p_batch: batch || null,
          p_expiry: expiry || null,
          p_key: key,
        });
      notifyAdmin("Stock movement posted.", "success");
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Posting failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={
        kind === "receipt"
          ? "Receive stock"
          : kind === "waste"
            ? "Record waste"
            : "Post physical count"
      }
      description={
        kind === "count"
          ? "Post the actual quantity counted. A changed baseline requires recounting."
          : "Physical movements are posted once to the stock ledger."
      }
      onClose={onClose}
      busy={busy}
    >
      <Feedback error={error} />
      {kind === "count" && countId && error && item && (
        <button
          className="ops-button"
          onClick={() => {
            setCountId(null);
            setCountSnapshot({
              version: item.stock_version,
              expected: item.current_stock,
            });
            setAmount("");
            setError("");
          }}
        >
          Start recount against current stock
        </button>
      )}
      <form className="ops-form" onSubmit={save}>
        <label>
          Stock item
          <FieldRequirement required={true} />
          <select
            required
            value={id}
            disabled={!!countId}
            onChange={(e) => {
              setId(e.target.value);
              const next = ops.stock.find((row) => row.id === e.target.value);
              setCost(String(next?.cost_per_unit ?? 0));
              setCountSnapshot(
                next
                  ? {
                      version: next.stock_version,
                      expected: next.current_stock,
                    }
                  : null,
              );
            }}
          >
            <option value="">Choose an item</option>
            {ops.stock.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {row.unit}
              </option>
            ))}
          </select>
        </label>
        {item && (
          <div className="ops-form-summary">
            On hand:{" "}
            <strong>
              {quantity(item.current_stock)} {item.unit}
            </strong>{" "}
            · Reserved: {quantity(item.reserved_stock)} · Available:{" "}
            {quantity(item.available_stock)}
            {kind === "count" && (
              <p>
                Counting baseline: {quantity(countSnapshot?.expected ?? 0)}{" "}
                {item.unit}
              </p>
            )}
          </div>
        )}
        <label>
          {kind === "count" ? "Actual count" : "Quantity"}
          {item ? ` (${item.unit})` : ""}
          <FieldRequirement required={true} />
          <input
            type="number"
            min={kind === "count" ? 0 : 0.001}
            step="any"
            required
            value={amount}
            disabled={!!countId}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {kind === "receipt" && (
          <>
            <div className="ops-form-grid">
              <label>
                Unit cost
                <FieldRequirement required={true} />
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </label>
              <label>
                Batch / lot code
                <FieldRequirement required={false} />
                <input
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                />
              </label>
            </div>
            <label>
              Expiry date
              <FieldRequirement required={false} />
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </label>
          </>
        )}
        <label>
          {kind === "receipt" ? "Delivery reference / notes" : "Reason"}
          <FieldRequirement required={true} />
          <textarea
            required
            value={reason}
            disabled={!!countId}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              kind === "waste"
                ? "Spillage, spoilage, damaged packaging…"
                : "Record what was physically verified."
            }
          />
        </label>
        <div className="ops-form-actions">
          <button
            type="button"
            className="ops-button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="ops-button primary" disabled={busy}>
            {busy
              ? "Posting…"
              : kind === "count"
                ? "Post count"
                : "Post movement"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
function OptionRecipeEditor({ onClose }: { onClose: () => void }) {
  const ops = useOperations();
  const [options, setOptions] = useState<
    { variant_group: string; label: string }[]
  >([]);
  const [selected, setSelected] = useState("");
  const [lines, setLines] = useState<
    Pick<
      VariantIngredient,
      | "ingredient_id"
      | "quantity_used"
      | "replaces_ingredient_id"
      | "size_multipliers"
    >[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void supabase
      .from("item_variants")
      .select("variant_group,label")
      .order("variant_group")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else
          setOptions(
            (data ?? []).filter(
              (row, index, all) =>
                all.findIndex(
                  (candidate) =>
                    candidate.variant_group === row.variant_group &&
                    candidate.label === row.label,
                ) === index,
            ),
          );
      });
  }, []);
  const choose = async (key: string) => {
    setSelected(key);
    setBusy(true);
    setError("");
    const option = options[Number(key)];
    const { data, error } = await supabase
      .from("variant_ingredients")
      .select(
        "ingredient_id,quantity_used,replaces_ingredient_id,size_multipliers",
      )
      .eq("variant_group", option.variant_group)
      .eq("variant_label", option.label);
    if (error) setError(error.message);
    else setLines(data ?? []);
    setBusy(false);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const option = options[Number(selected)];
      if (!option) throw new Error("Choose an option.");
      await ops.run("inv_save_variant_recipes", {
        p_group: option.variant_group,
        p_label: option.label,
        p_lines: lines,
      });
      notifyAdmin("Requirements saved.", "success");
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title="Option stock requirements"
      description="A shared option mapping applies to every product offering this same option."
      onClose={onClose}
      wide
      busy={busy}
    >
      <Feedback error={error} />
      <form className="ops-form" onSubmit={save}>
        <label>
          Customization
          <FieldRequirement required={true} />
          <select
            value={selected}
            onChange={(event) => {
              if (event.target.value !== "") void choose(event.target.value);
            }}
          >
            <option value="">Choose an option</option>
            {options.map((option, index) => (
              <option
                key={`${option.variant_group}:${option.label}`}
                value={index}
              >
                {option.variant_group.replaceAll("_", " ")} · {option.label}
              </option>
            ))}
          </select>
        </label>
        {lines.map((line, index) => (
          <div className="ops-form-grid ops-option-row" key={index}>
            <label>
              Stock item
              <FieldRequirement required={true} />
              <select
                required
                value={line.ingredient_id}
                onChange={(event) =>
                  setLines((previous) =>
                    previous.map((row, i) =>
                      i === index
                        ? { ...row, ingredient_id: event.target.value }
                        : row,
                    ),
                  )
                }
              >
                <option value="">Choose stock</option>
                {ops.stock.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.unit})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity per item
              <FieldRequirement required={true} />
              <input
                type="number"
                min="0"
                step="any"
                required
                value={line.quantity_used}
                onChange={(event) =>
                  setLines((previous) =>
                    previous.map((row, i) =>
                      i === index
                        ? { ...row, quantity_used: Number(event.target.value) }
                        : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              Replaces
              <FieldRequirement required={false} />
              <select
                value={line.replaces_ingredient_id ?? ""}
                onChange={(event) =>
                  setLines((previous) =>
                    previous.map((row, i) =>
                      i === index
                        ? {
                            ...row,
                            replaces_ingredient_id: event.target.value || null,
                          }
                        : row,
                    ),
                  )
                }
              >
                <option value="">Add to base recipe</option>
                {ops.stock.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ops-button danger small"
              onClick={() =>
                setLines((previous) => previous.filter((_, i) => i !== index))
              }
            >
              Remove
            </button>
            <div className="ops-form-grid" style={{ gridColumn: "1 / -1" }}>
              {options
                .filter((o) => o.variant_group === "size")
                .map((o) => (
                  <label key={o.label}>
                    {o.label} multiplier
                    <FieldRequirement required={false} />
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      placeholder="Inherit"
                      value={line.size_multipliers?.[o.label] ?? ""}
                      onChange={(e) =>
                        setLines((previous) =>
                          previous.map((row, i) => {
                            if (i !== index) return row;
                            const sizes = { ...row.size_multipliers };
                            if (e.target.value === "") delete sizes[o.label];
                            else sizes[o.label] = Number(e.target.value);
                            return { ...row, size_multipliers: sizes };
                          }),
                        )
                      }
                    />
                  </label>
                ))}
            </div>
          </div>
        ))}
        {selected !== "" && (
          <button
            type="button"
            className="ops-button"
            onClick={() =>
              setLines((previous) => [
                ...previous,
                {
                  ingredient_id: "",
                  quantity_used: 1,
                  replaces_ingredient_id: null,
                  size_multipliers: {},
                },
              ])
            }
          >
            <Icon name="plus" />
            Add requirement
          </button>
        )}
        <div className="ops-form-actions">
          <button type="button" className="ops-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="ops-button primary"
            disabled={busy || selected === ""}
          >
            Save requirements
          </button>
        </div>
      </form>
    </Drawer>
  );
}
export default function InventoryWorkspace() {
  const confirm = useActionConfirm();
  const params = useSearchParams();
  const ops = useOperations();
  const { menuItems, categories } = useMenu({ includeUnavailable: true });
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "stock");
  const [filter, setFilter] = useState(params.get("filter") ?? "all");
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stockForm, setStockForm] = useState<{
    item: OperationalStock | null;
  } | null>(null);
  const [movement, setMovement] = useState<{
    kind: "receipt" | "waste" | "count";
    item?: OperationalStock;
  } | null>(null);
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null);
  const [recipeRows, setRecipeRows] = useState<MenuItemIngredient[]>([]);
  const [optionRecipes, setOptionRecipes] = useState<VariantIngredient[]>([]);
  const [itemOptions, setItemOptions] = useState<ItemVariant[]>([]);
  const [optionEditor, setOptionEditor] = useState(false);
  const [horizon, setHorizon] = useState(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activate, setActivate] = useState(params.get("setup") === "1");
  const [record, setRecord] = useState<{
    kind: "movement" | "stocktake";
    id: string;
  } | null>(null);
  const [forecastId, setForecastId] = useState<string | null>(null);
  const [reviewPurchases, setReviewPurchases] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = params.get("tab");
      if (next && tabs.some((entry) => entry.key === next)) setTab(next as Tab);
      setFilter(params.get("filter") ?? "all");
      if (params.get("setup") === "1") setActivate(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [params]);
  useEffect(() => {
    void supabase
      .from("menu_item_ingredients")
      .select("*")
      .then(({ data, error }) => {
        if (!error) setRecipeRows(data ?? []);
      });
    void supabase
      .from("variant_ingredients")
      .select("*")
      .then(({ data, error }) => {
        if (!error) setOptionRecipes(data ?? []);
      });
    void supabase
      .from("item_variants")
      .select("*")
      .then(({ data, error }) => {
        if (!error) setItemOptions(data ?? []);
      });
  }, [ops.lastUpdated]);
  const forecasts = useMemo(
    () =>
      new Map(
        ops.forecasts
          .filter((row) => row.horizon === horizon)
          .map((row) => [row.ingredient_id, row]),
      ),
    [ops.forecasts, horizon],
  );
  const isExcess = (item: OperationalStock) =>
    (item.max_stock != null &&
      Number(item.current_stock) > Number(item.max_stock)) ||
    ((forecasts.get(item.id)?.history_days ?? 0) >= 14 &&
      Number(forecasts.get(item.id)?.excess_quantity ?? 0) > 0);
  const status = (item: OperationalStock) =>
    Number(item.available_stock) <= 0
      ? "out"
      : Number(item.available_stock) <= Number(item.min_stock_alert)
        ? "low"
        : isExcess(item)
          ? "overstock"
          : "healthy";
  const selected = ops.stock.find((item) => item.id === selectedId);
  const matches = (id: string) => {
    const item = ops.stock.find((row) => row.id === id);
    return (
      !search ||
      (!!item &&
        `${item.name} ${item.sku ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()))
    );
  };
  const filtered = ops.stock.filter(
    (item) =>
      matches(item.id) &&
      (filter === "all" ||
        (filter === "low" && ["low", "out"].includes(status(item))) ||
        (filter === "out" && status(item) === "out") ||
        (filter === "overstock" && isExcess(item)) ||
        (filter === "expiry" && Number(item.expiring_stock) > 0) ||
        filter === item.stock_kind),
  );
  const changeTab = (next: Tab) => {
    setTab(next);

    setSearch("");
    setFilter("all");
    setError("");
    setSuccess("");
  };
  const refreshForecasts = async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await ops.run("inv_refresh_forecasts");
      setSuccess("Forecasts refreshed.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <PageHeader
        eyebrow="Stock control"
        title="Stock & recipes"
        description="Know what is on hand, what is committed, and what to replenish."
      >
        {(tab === "stock" || tab === "movements") && (
          <>
            <button
              className="ops-button"
              disabled={!!ops.error}
              onClick={() => setMovement({ kind: "receipt" })}
            >
              <Icon name="stock" />
              Receive stock
            </button>
            <button
              className="ops-button primary"
              disabled={!!ops.error}
              onClick={() => setStockForm({ item: null })}
            >
              <Icon name="plus" />
              Add item
            </button>
          </>
        )}
      </PageHeader>
      <Feedback error={ops.error || error} success={success} />
      {ops.settings &&
        (tab === "stock" || !ops.settings.enforcement_enabled) && (
          <div className="ops-notice">
            <Icon name="shield" />
            <p>
              {ops.settings.enforcement_enabled
                ? "Stock checks are on"
                : "Stock checks are off · complete setup before activation"}
            </p>
            <button
              className="ops-button small"
              onClick={() => setActivate(true)}
            >
              {ops.settings.enforcement_enabled
                ? "Manage enforcement"
                : "Activate enforcement"}
            </button>
          </div>
        )}
      {tab === "stock" && (
        <>
          <div className="ops-metrics">
            {[
              {
                label: "Stock items",
                value: ops.stock.length,
                note: "Ingredients, packaging & finished goods",
              },
              {
                label: "Low / out of stock",
                value: ops.stock.filter((item) =>
                  ["low", "out"].includes(status(item)),
                ).length,
                note: "Based on sellable quantities",
              },
              {
                label: "Overstock",
                value: ops.stock.filter(isExcess).length,
                note: "Configured limits or forecast coverage",
              },
              {
                label: "Stock value",
                value: peso(
                  ops.stock.reduce(
                    (sum, item) => sum + Number(item.stock_value),
                    0,
                  ),
                ),
                note: "Physical recorded stock",
              },
            ].map((metric) => (
              <div className="ops-metric" key={metric.label}>
                <div className="ops-metric-label">
                  {metric.label}
                  <Icon name="stock" />
                </div>
                <div className="ops-metric-value">
                  {ops.error || ops.loading ? "—" : metric.value}
                </div>
                <small>{metric.note}</small>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="ops-tabs" role="tablist" aria-label="Inventory sections">
        {tabs.map((entry) => (
          <button
            role="tab"
            aria-selected={tab === entry.key}
            className={tab === entry.key ? "active" : ""}
            key={entry.key}
            onClick={() => changeTab(entry.key)}
          >
            {entry.label}
            {entry.key === "stock" && <small>{ops.stock.length}</small>}
          </button>
        ))}
      </div>
      <div className="ops-toolbar">
        <label className="ops-search">
          <Icon name="search" size={16} />
          <input
            aria-label="Search stock"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Search by stock name or SKU…"
          />
        </label>
        {(tab === "stock" || tab === "forecasts") && (
          <select
            aria-label="Stock filter"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          >
            <option value="all">All stock</option>
            <option value="low">Low / out of stock</option>
            <option value="out">Out of stock</option>
            <option value="overstock">Overstock</option>
            <option value="expiry">Expiring batches</option>
            <option value="ingredient">Ingredients</option>
            <option value="packaging">Packaging</option>
            <option value="finished_good">Finished goods</option>
          </select>
        )}
        <span className="spacer" />
        {tab === "waste" && (
          <button
            className="ops-button primary"
            disabled={!!ops.error}
            onClick={() => setMovement({ kind: "waste" })}
          >
            Record waste
          </button>
        )}
        {tab === "stocktakes" && (
          <button
            className="ops-button primary"
            disabled={!!ops.error}
            onClick={() => setMovement({ kind: "count" })}
          >
            New physical count
          </button>
        )}
        {tab === "recipes" && (
          <button
            className="ops-button"
            disabled={!!ops.error}
            onClick={() => setOptionEditor(true)}
          >
            Option requirements
          </button>
        )}
        {tab === "forecasts" && (
          <>
            <select
              aria-label="Forecast horizon"
              value={horizon}
              onChange={(event) => setHorizon(Number(event.target.value))}
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
            <button
              className="ops-button"
              disabled={busy || !!ops.error}
              onClick={() => void refreshForecasts()}
            >
              <Icon name="refresh" />
              {busy ? "Refreshing…" : "Refresh forecasts"}
            </button>
            <button
              className="ops-button primary"
              disabled={busy || !!ops.error}
              onClick={() => setReviewPurchases(true)}
            >
              Review purchase suggestions
            </button>
          </>
        )}
      </div>
      <section className="ops-panel">
        {ops.loading ? (
          <Empty
            title="Loading inventory…"
            description="Retrieving recorded stock and movements."
          />
        ) : tab === "stock" ? (
          <>
            <div className="ops-table-wrap">
              <PaginatedTable
                aria-label="Stock items"
                resetKey={JSON.stringify([tab, search, filter, horizon])}
                className="ops-table"
              >
                <thead>
                  <tr>
                    <th>Stock item</th>
                    <th className="number">Available</th>
                    <th className="number">Incoming</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      className="ops-click-row"
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <td>
                        <button
                          className="item-name"
                          onClick={() => setSelectedId(item.id)}
                        >
                          {item.name}
                        </button>
                        <small>
                          {item.stock_kind.replaceAll("_", " ")} · {item.unit}
                          {!item.is_active && " · Inactive"}
                        </small>
                      </td>
                      <td className="number">
                        <strong>{quantity(item.available_stock)}</strong>
                        <small>
                          {quantity(item.current_stock)} on hand ·{" "}
                          {quantity(item.reserved_stock)} reserved
                        </small>
                      </td>
                      <td className="number">
                        {quantity(item.incoming_stock)}
                      </td>
                      <td>
                        <Badge
                          tone={
                            status(item) === "out"
                              ? "danger"
                              : status(item) === "healthy"
                                ? "success"
                                : "warning"
                          }
                        >
                          {status(item)}
                        </Badge>
                      </td>
                      <td>
                        <Icon name="arrow" size={14} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </PaginatedTable>
            </div>
            {!filtered.length && (
              <Empty
                title="No stock items match"
                description="Add your ingredients, packaging, and finished goods to start recording stock."
              />
            )}
          </>
        ) : tab === "recipes" ? (
          <div className="ops-table-wrap">
            <PaginatedTable
              aria-label="Recipe requirements"
              resetKey={JSON.stringify([tab, search, filter, horizon])}
              className="ops-table"
            >
              <thead>
                <tr>
                  <th>Menu product</th>
                  <th>Requirements</th>
                  <th className="number">Estimated base cost</th>
                  <th>Recipe readiness</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {menuItems
                  .filter(
                    (item) =>
                      (!search ||
                        item.name
                          .toLowerCase()
                          .includes(search.toLowerCase())) &&
                      (filter !== "missing_recipe" ||
                        (item.status === "active" &&
                          item.manually_available &&
                          !recipeRows.some(
                            (row) => row.menu_item_id === item.id,
                          ))),
                  )
                  .map((item) => {
                    const rows = recipeRows.filter(
                      (row) => row.menu_item_id === item.id,
                    );
                    return (
                      <tr key={item.id}>
                        <td className="item-name">
                          {item.name}
                          <small>
                            {item.category?.name ?? "Uncategorized"} ·{" "}
                            {item.status}
                          </small>
                        </td>
                        <td>{rows.length} stock items</td>
                        <td className="number">
                          {peso(
                            rows.reduce(
                              (sum, row) =>
                                sum +
                                Number(row.quantity_used) *
                                  Number(
                                    ops.stock.find(
                                      (stock) => stock.id === row.ingredient_id,
                                    )?.cost_per_unit ?? 0,
                                  ),
                              0,
                            ),
                          )}
                        </td>
                        <td>
                          <Badge tone={rows.length ? "success" : "warning"}>
                            {rows.length ? "Mapped" : "Setup required"}
                          </Badge>
                        </td>
                        <td>
                          <button
                            className="ops-button small"
                            onClick={() => setRecipeItem(item)}
                          >
                            Edit recipe
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </PaginatedTable>
          </div>
        ) : tab === "movements" || tab === "waste" ? (
          <>
            <div className="ops-table-wrap">
              <PaginatedTable
                aria-label="Stock movements"
                resetKey={JSON.stringify([tab, search, filter, horizon])}
                className="ops-table"
              >
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Stock item</th>
                    <th>Movement</th>
                    <th className="number">Change</th>
                    <th className="number">Balance after</th>
                    <th>Reason / reference</th>
                    <th>
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ops.movements
                    .filter(
                      (row) =>
                        matches(row.ingredient_id) &&
                        (tab !== "waste" ||
                          row.movement_type === "waste" ||
                          row.movement_type === "disposition"),
                    )
                    .map((row) => (
                      <tr
                        key={row.id}
                        className="ops-click-row"
                        onClick={() =>
                          setRecord({ kind: "movement", id: row.id })
                        }
                      >
                        <td>
                          {businessDate(row.created_at)}
                          <small>
                            {new Date(row.created_at).toLocaleTimeString(
                              "en-PH",
                              {
                                timeZone: "Asia/Manila",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </small>
                        </td>
                        <td className="item-name">
                          {
                            ops.stock.find(
                              (item) => item.id === row.ingredient_id,
                            )?.name
                          }
                        </td>
                        <td>
                          <Badge
                            tone={row.quantity < 0 ? "warning" : "success"}
                          >
                            {row.movement_type}
                          </Badge>
                        </td>
                        <td className="number">
                          {Number(row.quantity) > 0 ? "+" : ""}
                          {quantity(row.quantity)}
                        </td>
                        <td className="number">
                          {quantity(row.balance_after)}
                        </td>
                        <td style={{ whiteSpace: "normal", maxWidth: 250 }}>
                          {stockReason(row.reason)}
                          {row.order_id && <small>Connected to an order</small>}
                        </td>
                        <td>
                          <button
                            className="ops-button small"
                            aria-label={`View movement details for ${ops.stock.find((item) => item.id === row.ingredient_id)?.name ?? "stock item"}`}
                            onClick={() =>
                              setRecord({ kind: "movement", id: row.id })
                            }
                          >
                            View details
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </PaginatedTable>
            </div>
            {!ops.movements.some(
              (row) =>
                tab !== "waste" ||
                ["waste", "disposition"].includes(row.movement_type),
            ) && (
              <Empty
                title="No movements recorded"
                description="Confirmed physical movements will appear here with their reasons and references."
              />
            )}
            <p className="ops-chart-caption" style={{ paddingTop: 14 }}>
              Showing the latest 150 recorded movements. Historical inventory
              logs remain preserved.
            </p>
          </>
        ) : tab === "stocktakes" ? (
          <>
            <div className="ops-table-wrap">
              <PaginatedTable
                aria-label="Physical counts"
                resetKey={JSON.stringify([tab, search, filter, horizon])}
                className="ops-table"
              >
                <thead>
                  <tr>
                    <th>Stock item</th>
                    <th>Date</th>
                    <th className="number">Expected</th>
                    <th className="number">Counted</th>
                    <th className="number">Difference</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ops.counts
                    .filter((row) => matches(row.ingredient_id))
                    .map((row) => (
                      <tr
                        key={row.id}
                        className="ops-click-row"
                        onClick={() =>
                          setRecord({ kind: "stocktake", id: row.id })
                        }
                      >
                        <td className="item-name">
                          {
                            ops.stock.find(
                              (item) => item.id === row.ingredient_id,
                            )?.name
                          }
                        </td>
                        <td>{businessDate(row.created_at)}</td>
                        <td className="number">{quantity(row.expected)}</td>
                        <td className="number">{quantity(row.counted)}</td>
                        <td className="number">
                          {quantity(Number(row.counted) - Number(row.expected))}
                        </td>
                        <td>
                          <Badge
                            tone={
                              row.state === "posted" ? "success" : "warning"
                            }
                          >
                            {row.state}
                          </Badge>
                        </td>
                        <td>{stockReason(row.reason)}</td>
                        <td>
                          <button
                            className="ops-button small"
                            aria-label={`View count details for ${ops.stock.find((item) => item.id === row.ingredient_id)?.name ?? "stock item"}`}
                            onClick={() =>
                              setRecord({ kind: "stocktake", id: row.id })
                            }
                          >
                            View details
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </PaginatedTable>
            </div>
            {!ops.counts.length && (
              <Empty
                title="Start with a physical count"
                description="Count the branch’s actual stock before activating strict order reservations."
              />
            )}
          </>
        ) : (
          <>
            <div className="ops-panel-header">
              <div>
                <h2>What needs replenishing?</h2>
                <p>Choose an item to see its usage and projected stock.</p>
              </div>
              <Badge tone="brand">{horizon}-day outlook</Badge>
            </div>
            <div className="ops-table-wrap">
              <PaginatedTable
                aria-label="Demand forecasts"
                resetKey={JSON.stringify([tab, search, filter, horizon])}
                className="ops-table ops-planning-table"
              >
                <thead>
                  <tr>
                    <th>Stock item</th>
                    <th className="number">Available</th>
                    <th className="number">Coverage</th>
                    <th className="number">Suggested purchase</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const f = forecasts.get(item.id);
                    const stale =
                      !f ||
                      new Date(ops.lastUpdated ?? f.calculated_at).getTime() -
                        new Date(f.calculated_at).getTime() >
                        36 * 60 * 60 * 1000;
                    const reason = stale
                      ? "Refresh forecast"
                      : f.history_days < 14
                        ? "More history needed"
                        : !item.supplier_id
                          ? "Choose a supplier"
                          : Number(f.expiry_risk_quantity) > 0
                            ? "Check expiring batches"
                            : Number(f.reorder_quantity) > 0
                              ? "Review purchase"
                              : Number(f.excess_quantity) > 0
                                ? "Use existing stock"
                                : "Stock looks sufficient";
                    return (
                      <tr
                        key={item.id}
                        className="ops-click-row"
                        onClick={() => setForecastId(item.id)}
                      >
                        <td className="item-name">
                          <button
                            className="ops-text-button"
                            aria-label={`View forecast for ${item.name}`}
                            onClick={() => setForecastId(item.id)}
                          >
                            {item.name} <span aria-hidden="true">→</span>
                          </button>
                          <small>
                            {item.unit}
                            <span className="ops-mobile-coverage">
                              {" "}
                              ·{" "}
                              {f?.coverage_days == null
                                ? "Coverage unknown"
                                : `${quantity(f.coverage_days)} days coverage`}
                            </span>
                          </small>
                          <Badge
                            tone={
                              reason === "Stock looks sufficient"
                                ? "success"
                                : "warning"
                            }
                          >
                            {reason}
                          </Badge>
                        </td>
                        <td className="number">
                          {quantity(item.available_stock)}
                          {Number(item.incoming_stock) > 0 && (
                            <small>
                              +{quantity(item.incoming_stock)} incoming
                            </small>
                          )}
                        </td>
                        <td className="number">
                          {f?.coverage_days == null
                            ? "—"
                            : `${quantity(f.coverage_days)} days`}
                        </td>
                        <td className="number">
                          {f && !stale && f.history_days >= 14 ? (
                            <>
                              <strong>
                                {quantity(f.reorder_quantity)} {item.unit}
                              </strong>
                              <small>
                                {peso(
                                  Number(f.reorder_quantity) *
                                    Number(item.cost_per_unit),
                                )}{" "}
                                estimate
                              </small>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </PaginatedTable>
            </div>
            <p className="ops-chart-caption">
              Forecasts refresh daily at 2 AM. Review suggestions before
              creating purchase drafts.
            </p>
          </>
        )}
      </section>
      {record && (
        <StockRecordDrawer
          key={record.id}
          {...record}
          onClose={() => setRecord(null)}
        />
      )}
      {forecastId && (
        <StockForecastDrawer
          id={forecastId}
          horizon={horizon}
          onClose={() => setForecastId(null)}
        />
      )}
      {reviewPurchases && (
        <ReplenishmentReview onClose={() => setReviewPurchases(false)} />
      )}
      {selected && (
        <Drawer
          title={selected.name}
          description={`${selected.stock_kind.replaceAll("_", " ")} · ${selected.unit}`}
          onClose={() => setSelectedId(null)}
          wide
        >
          <div className="ops-detail-grid">
            {[
              { label: "On hand", value: selected.current_stock },
              { label: "Reserved", value: selected.reserved_stock },
              { label: "Available to sell", value: selected.available_stock },
              { label: "Incoming", value: selected.incoming_stock },
            ].map((detail) => (
              <div key={detail.label}>
                <small>{detail.label}</small>
                <strong>
                  {quantity(detail.value)}{" "}
                  <span style={{ fontSize: 13 }}>{selected.unit}</span>
                </strong>
              </div>
            ))}
          </div>
          <div className="ops-toolbar">
            <button
              className="ops-button primary"
              onClick={() => {
                setSelectedId(null);
                setMovement({ kind: "receipt", item: selected });
              }}
            >
              Receive
            </button>
            <button
              className="ops-button"
              onClick={() => {
                setSelectedId(null);
                setMovement({ kind: "waste", item: selected });
              }}
            >
              Record waste
            </button>
            <button
              className="ops-button"
              onClick={() => {
                setSelectedId(null);
                setMovement({ kind: "count", item: selected });
              }}
            >
              Count stock
            </button>
            <button
              className="ops-button"
              onClick={() => {
                setSelectedId(null);
                setStockForm({ item: selected });
              }}
            >
              Edit settings
            </button>
          </div>
          <h3 className="ops-section-title">
            Receipt batches · earliest expiry first
          </h3>
          <div className="ops-panel ops-table-wrap">
            <PaginatedTable
              aria-label="Stock batches"
              resetKey={selected.id}
              className="ops-table"
            >
              <thead>
                <tr>
                  <th>Batch</th>
                  <th className="number">Quantity</th>
                  <th className="number">Reserved</th>
                  <th>Expiry</th>
                  <th className="number">Unit cost</th>
                </tr>
              </thead>
              <tbody>
                {ops.batches
                  .filter((row) => row.ingredient_id === selected.id)
                  .map((row) => (
                    <tr key={row.id}>
                      <td>{row.batch_code}</td>
                      <td className="number">{quantity(row.quantity)}</td>
                      <td className="number">{quantity(row.reserved)}</td>
                      <td>{row.expires_on ?? "Unknown / none"}</td>
                      <td className="number">{peso(row.unit_cost)}</td>
                    </tr>
                  ))}
              </tbody>
            </PaginatedTable>
          </div>
          <h3 className="ops-section-title">Used by menu products</h3>
          <div className="ops-toolbar">
            {menuItems
              .filter(
                (item) =>
                  recipeRows.some(
                    (row) =>
                      row.ingredient_id === selected.id &&
                      row.menu_item_id === item.id,
                  ) ||
                  itemOptions.some(
                    (option) =>
                      option.menu_item_id === item.id &&
                      optionRecipes.some(
                        (row) =>
                          (row.ingredient_id === selected.id ||
                            row.replaces_ingredient_id === selected.id) &&
                          row.variant_group === option.variant_group &&
                          row.variant_label === option.label,
                      ),
                  ),
              )
              .map((item) => (
                <Badge key={item.id}>{item.name}</Badge>
              ))}
          </div>
          <h3 className="ops-section-title">Recent movements</h3>
          <div className="ops-panel">
            {ops.movements
              .filter((row) => row.ingredient_id === selected.id)
              .slice(0, 8)
              .map((row) => (
                <div className="ops-action-row" key={row.id}>
                  <div>
                    <strong>{stockReason(row.reason)}</strong>
                    <p>
                      {businessDate(row.created_at)} · {row.movement_type}
                    </p>
                  </div>
                  <b>{quantity(row.quantity)}</b>
                </div>
              ))}
          </div>
        </Drawer>
      )}
      {stockForm && (
        <StockForm item={stockForm.item} onClose={() => setStockForm(null)} />
      )}
      {movement && (
        <MovementForm
          kind={movement.kind}
          initial={movement.item}
          onClose={() => setMovement(null)}
        />
      )}
      {recipeItem && (
        <MenuItemForm
          item={recipeItem}
          categories={categories}
          onClose={() => {
            setRecipeItem(null);
            void ops.refresh();
          }}
        />
      )}
      {optionEditor && (
        <OptionRecipeEditor onClose={() => setOptionEditor(false)} />
      )}
      {activate && (
        <Drawer
          title="Stock enforcement"
          description="Protect orders with atomic inventory reservations."
          onClose={() => setActivate(false)}
          busy={busy}
        >
          <Feedback error={error} />
          <div className="ops-form">
            <div className="ops-form-summary">
              Inventory checks stop POS and mobile orders when required stock
              runs out. Complete the checks below to switch them on. Historical
              completed orders will not be deducted again.
            </div>
            <InventoryReadiness />
            <p className="ops-muted" style={{ fontSize: 13 }}>
              Current state:{" "}
              {ops.settings?.enforcement_enabled
                ? "Enforcement active"
                : "Reconciliation mode"}
            </p>
            <button
              className="ops-button primary"
              disabled={
                busy ||
                !!ops.error ||
                (!ops.settings?.enforcement_enabled && !ops.readiness?.ready)
              }
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  if (
                    !(await confirm({
                      title: ops.settings?.enforcement_enabled
                        ? "Turn off stock protection?"
                        : "Turn on stock protection?",
                      description: ops.settings?.enforcement_enabled
                        ? "Orders will no longer be blocked when required stock is unavailable. Use this only while correcting stock records, and turn protection back on when finished."
                        : "The server will verify opening counts and recipes. Orders will be blocked when their required stock is unavailable.",
                      confirmLabel: ops.settings?.enforcement_enabled
                        ? "Turn off stock protection"
                        : "Activate inventory checks",
                      danger: !!ops.settings?.enforcement_enabled,
                    }))
                  )
                    return;
                  await ops.run("inv_activate", {
                    p_enabled: !ops.settings?.enforcement_enabled,
                  });
                  setActivate(false);
                  setSuccess("Stock enforcement updated.");
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "Activation failed",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? "Checking readiness…"
                : ops.settings?.enforcement_enabled
                  ? "Return to reconciliation mode"
                  : "Activate inventory checks"}
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}
