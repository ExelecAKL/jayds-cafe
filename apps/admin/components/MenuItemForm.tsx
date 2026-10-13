"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { notifyAdmin } from "./AdminToasts";
import { useActionConfirm } from "@cafeos/shared/ui/action-confirm";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import type {
  MenuItem,
  Category,
  ItemVariant,
  MenuItemIngredient,
} from "@cafeos/shared/types";
import { Drawer, Feedback, useOperations, quantity } from "./Operations";

type Option = {
  variant_group: string;
  label: string;
  price_modifier: number;
  is_default: boolean;
  sort_order: number;
};
type Recipe = {
  ingredient_id: string;
  quantity_used: number;
  size_multipliers: Record<string, number>;
};
export function MenuItemForm({
  categories,
  item,
  onClose,
}: {
  categories: Category[];
  item: MenuItem | null;
  onClose: () => void;
}) {
  const ops = useOperations();
  const confirm = useActionConfirm();
  const [tab, setTab] = useState("Product");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!item);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: item?.name ?? "",
    description: item?.description ?? "",
    price: String(item?.price ?? ""),
    category_id: item?.category_id ?? "",
    image_url: item?.image_url ?? "",
    prep_time_minutes: String(item?.prep_time_minutes ?? 10),
    manually_available: item?.manually_available ?? item?.is_available ?? true,
    is_featured: item?.is_featured ?? false,
    tags: (item?.tags ?? ["coffee"]).join(", "),
  });
  const [options, setOptions] = useState<Option[]>(
    (item?.variants ?? []).map((v) => ({
      variant_group: v.variant_group,
      label: v.label,
      price_modifier: v.price_modifier,
      is_default: v.is_default,
      sort_order: v.sort_order,
    })),
  );
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [library, setLibrary] = useState<Option[]>([]);
  useEffect(() => {
    let alive = true;
    async function load() {
      const optionsResult = await supabase
        .from("item_variants")
        .select("*")
        .order("sort_order");
      if (!alive) return;
      if (optionsResult.error) {
        setError(optionsResult.error.message);
        setLoading(false);
        return;
      }
      const unique = new Map<string, Option>();
      (optionsResult.data as ItemVariant[]).forEach((v) =>
        unique.set(v.variant_group + ":" + v.label, {
          variant_group: v.variant_group,
          label: v.label,
          price_modifier: v.price_modifier,
          is_default: false,
          sort_order: v.sort_order,
        }),
      );
      setLibrary([...unique.values()]);
      if (item) {
        const [product, recipe] = await Promise.all([
          supabase.from("menu_items").select("*").eq("id", item.id).single(),
          supabase
            .from("menu_item_ingredients")
            .select("*")
            .eq("menu_item_id", item.id),
        ]);
        if (!alive) return;
        if (product.error || recipe.error)
          setError(
            product.error?.message ??
              recipe.error?.message ??
              "Could not load recipe",
          );
        else {
          setForm((previous) => ({
            ...previous,
            manually_available:
              product.data.manually_available ?? product.data.is_available,
          }));
          setRecipes(
            (recipe.data as MenuItemIngredient[]).map((r) => ({
              ingredient_id: r.ingredient_id,
              quantity_used: r.quantity_used,
              size_multipliers: r.size_multipliers ?? {},
            })),
          );
        }
      }
      setLoading(false);
    }
    void load();
    return () => {
      alive = false;
    };
  }, [item]);
  const sizes = options
    .filter((v) => v.variant_group === "size")
    .map((v) => v.label);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (
        !form.name.trim() ||
        !form.category_id ||
        !Number.isFinite(Number(form.price)) ||
        Number(form.price) < 0
      )
        throw new Error("Enter a product name, category, and valid price.");
      if (
        recipes.some(
          (r) =>
            !r.ingredient_id ||
            !Number.isFinite(r.quantity_used) ||
            r.quantity_used <= 0 ||
            Object.values(r.size_multipliers).some(
              (v) => !Number.isFinite(v) || v <= 0,
            ),
        )
      )
        throw new Error(
          "Every stock requirement needs an item, positive quantity, and positive size multipliers.",
        );
      if (new Set(recipes.map((r) => r.ingredient_id)).size !== recipes.length)
        throw new Error("Combine duplicate stock requirements into one line.");
      if (
        options.some(
          (v) =>
            !v.label.trim() ||
            !Number.isFinite(v.price_modifier) ||
            v.price_modifier < 0,
        )
      )
        throw new Error("Options need a label and a valid additional price.");
      if (
        !(await confirm({
          title: item ? "Save these product changes?" : "Publish this product?",
          description:
            "The saved price, options, and availability will be used by the POS and customer menu for future orders.",
          details: [
            form.name.trim(),
            `Base price: ₱${Number(form.price).toFixed(2)}`,
            `Availability: ${form.manually_available ? "Available when stock allows" : "Unavailable"}`,
          ],
          confirmLabel: "Save product",
        }))
      )
        return;
      await ops.run("inv_save_menu", {
        p_id: item?.id ?? null,
        p_item: {
          ...form,
          name: form.name.trim(),
          price: Number(form.price),
          prep_time_minutes: Number(form.prep_time_minutes),
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
        p_recipes: recipes,
        p_variants: options,
      });
      notifyAdmin("Product saved.", "success");
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={item ? "Edit " + item.name : "New menu product"}
      description="Catalog details, options, and stock requirements save together."
      onClose={onClose}
      busy={busy}
      wide
    >
      <Feedback error={error} />
      {loading ? (
        <p role="status">Loading stock requirements…</p>
      ) : (
        <form className="ops-form" onSubmit={save}>
          <div className="ops-tabs">
            {[
              "Product",
              "Pricing & options",
              "Stock requirements",
              "Availability",
            ].map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={tab === name}
                className={tab === name ? "active" : ""}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {tab === "Product" && (
            <>
              <label>
                Product name
                <FieldRequirement required={true} />
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Description
                <FieldRequirement required={false} />
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <div className="ops-form-grid">
                <label>
                  Category
                  <FieldRequirement required={true} />
                  <select
                    required
                    value={form.category_id}
                    onChange={(e) =>
                      setForm({ ...form, category_id: e.target.value })
                    }
                  >
                    <option value="">Choose category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.status !== "active" ? " (inactive)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Preparation time (minutes)
                  <FieldRequirement required={false} />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.prep_time_minutes}
                    onChange={(e) =>
                      setForm({ ...form, prep_time_minutes: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Image URL
                <FieldRequirement required={false} />
                <input
                  type="url"
                  value={form.image_url}
                  onChange={(e) =>
                    setForm({ ...form, image_url: e.target.value })
                  }
                />
              </label>
              <label>
                Product tags
                <FieldRequirement required={false} />
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                />
                <small>
                  Keep coffee, non-coffee, or food to control ordering
                  customizations.
                </small>
              </label>
              <label className="ops-check-label">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) =>
                    setForm({ ...form, is_featured: e.target.checked })
                  }
                />
                Featured product
                <FieldRequirement required={false} />
              </label>
            </>
          )}
          {tab === "Pricing & options" && (
            <>
              <label>
                Base price (PHP)
                <FieldRequirement required={true} />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
              </label>
              <h3 className="ops-section-title">Customizations</h3>
              <p className="ops-description">
                Size and substitution groups allow one choice. Add-ons allow
                multiple choices.
              </p>
              {options.map((option, index) => (
                <div className="ops-option-row" key={index}>
                  <label>
                    Option group
                    <FieldRequirement required={true} />
                    <select
                      aria-label="Option group"
                      value={option.variant_group}
                      onChange={(e) =>
                        setOptions(
                          options.map((v, i) =>
                            i === index
                              ? { ...v, variant_group: e.target.value }
                              : v,
                          ),
                        )
                      }
                    >
                      {[
                        ...new Set([
                          "size",
                          "temperature",
                          "milk_sub",
                          "sugar_level",
                          "add_on",
                          ...options.map((v) => v.variant_group),
                        ]),
                      ].map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Option label
                    <FieldRequirement required={true} />
                    <input
                      aria-label="Option label"
                      value={option.label}
                      onChange={(e) =>
                        setOptions(
                          options.map((v, i) =>
                            i === index ? { ...v, label: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Additional price
                    <FieldRequirement required={false} />
                    <input
                      aria-label="Additional price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={option.price_modifier}
                      onChange={(e) =>
                        setOptions(
                          options.map((v, i) =>
                            i === index
                              ? { ...v, price_modifier: Number(e.target.value) }
                              : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="ops-check-label">
                    <input
                      type="checkbox"
                      checked={option.is_default}
                      onChange={(e) =>
                        setOptions(
                          options.map((v, i) =>
                            i === index
                              ? { ...v, is_default: e.target.checked }
                              : v.variant_group === option.variant_group &&
                                  option.variant_group !== "add_on"
                                ? { ...v, is_default: false }
                                : v,
                          ),
                        )
                      }
                    />
                    Default
                    <FieldRequirement required={false} />
                  </label>
                  <button
                    type="button"
                    className="ops-button"
                    onClick={() =>
                      setOptions(options.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="ops-toolbar">
                <button
                  className="ops-button"
                  type="button"
                  onClick={() =>
                    setOptions([
                      ...options,
                      {
                        variant_group: "size",
                        label: "",
                        price_modifier: 0,
                        is_default: false,
                        sort_order: options.length,
                      },
                    ])
                  }
                >
                  Add option
                </button>
                <label>
                  Add existing option
                  <FieldRequirement required={false} />
                  <select
                    aria-label="Add existing option"
                    value=""
                    onChange={(e) => {
                      const v = library[Number(e.target.value)];
                      if (
                        v &&
                        !options.some(
                          (o) =>
                            o.label === v.label &&
                            o.variant_group === v.variant_group,
                        )
                      )
                        setOptions([...options, v]);
                    }}
                  >
                    <option value="">Add from option library</option>
                    {library.map((v, i) => (
                      <option key={i} value={i}>
                        {v.variant_group} · {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
          {tab === "Stock requirements" && (
            <>
              <p className="ops-description">
                Include ingredients, cups, lids, and finished goods. Quantities
                use each stock item’s base unit. Configure substitution and
                add-on requirements in Inventory → Recipes.
              </p>
              {recipes.map((recipe, index) => {
                const stock = ops.stock.find(
                  (s) => s.id === recipe.ingredient_id,
                );
                return (
                  <div className="ops-recipe-line" key={index}>
                    <div className="ops-form-grid">
                      <label>
                        Stock item
                        <FieldRequirement required={true} />
                        <select
                          value={recipe.ingredient_id}
                          onChange={(e) =>
                            setRecipes(
                              recipes.map((r, i) =>
                                i === index
                                  ? { ...r, ingredient_id: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        >
                          <option value="">Choose item</option>
                          {ops.stock.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} · {s.unit}
                              {!s.is_active ? " (inactive)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Base quantity {stock ? "(" + stock.unit + ")" : ""}
                        <FieldRequirement required={true} />
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={recipe.quantity_used}
                          onChange={(e) =>
                            setRecipes(
                              recipes.map((r, i) =>
                                i === index
                                  ? {
                                      ...r,
                                      quantity_used: Number(e.target.value),
                                    }
                                  : r,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="ops-form-grid">
                      {[
                        ...new Set([
                          ...sizes,
                          ...Object.keys(recipe.size_multipliers),
                        ]),
                      ].map((size) => (
                        <label key={size}>
                          {size} multiplier
                          <FieldRequirement required={false} />
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={recipe.size_multipliers[size] ?? 1}
                            onChange={(e) =>
                              setRecipes(
                                recipes.map((r, i) =>
                                  i === index
                                    ? {
                                        ...r,
                                        size_multipliers: {
                                          ...r.size_multipliers,
                                          [size]: Number(e.target.value),
                                        },
                                      }
                                    : r,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <small>
                      Estimated base cost:{" "}
                      {quantity(
                        recipe.quantity_used * (stock?.cost_per_unit ?? 0),
                      )}{" "}
                      PHP
                    </small>
                    <button
                      type="button"
                      className="ops-button"
                      onClick={() =>
                        setRecipes(recipes.filter((_, i) => i !== index))
                      }
                    >
                      Remove requirement
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="ops-button"
                onClick={() =>
                  setRecipes([
                    ...recipes,
                    {
                      ingredient_id: "",
                      quantity_used: 1,
                      size_multipliers: {},
                    },
                  ])
                }
              >
                Add stock requirement
              </button>
              {!recipes.length && (
                <p className="ops-feedback warning">
                  Add a recipe or a finished-good requirement before stock
                  enforcement is activated.
                </p>
              )}
            </>
          )}
          {tab === "Availability" && (
            <>
              <label className="ops-check-label">
                <input
                  type="checkbox"
                  checked={form.manually_available}
                  onChange={(e) =>
                    setForm({ ...form, manually_available: e.target.checked })
                  }
                />
                Manually enable ordering
                <FieldRequirement required={false} />
              </label>
              <div className="ops-form-summary">
                <p>
                  {form.manually_available
                    ? "Customers can order configurations that have sufficient eligible stock."
                    : "Ordering is disabled until an administrator enables this product."}
                </p>
                <p>
                  Sold-out published products stay visible. Archived products
                  and inactive categories are excluded from the ordering
                  catalog.
                </p>
                {item?.status === "archived" && (
                  <p>
                    This product is archived. Restore it in Catalog to publish
                    it.
                  </p>
                )}
              </div>
            </>
          )}
          <div className="ops-form-actions">
            <button
              type="button"
              className="ops-button"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="ops-button primary"
              disabled={busy || !!ops.error}
            >
              {busy ? "Saving…" : "Save product"}
            </button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
