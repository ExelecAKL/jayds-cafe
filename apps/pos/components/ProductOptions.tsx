"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useMemo, useState } from "react";
import { resolveMenuDefaults } from "@cafeos/shared/menu/options";
import type { ItemVariant, MenuItem } from "@cafeos/shared/types";
import type { RegisterLine, RegisterOption } from "@cafeos/shared/pos/types";
import { pesos } from "@cafeos/shared/pos/draft";
import { useAvailability } from "@cafeos/shared/hooks/useAvailability";
import { useOnline } from "../lib/client";
import { PosDialog, PosIcon } from "./PosPrimitives";
const labels: Record<string, string> = {
  temperature: "Temperature",
  size: "Size",
  sugar_level: "Sugar",
  milk_sub: "Milk",
  add_on: "Add-ons",
  flavor: "Flavor",
  notes: "Item notes",
};
const order = [
  "temperature",
  "size",
  "sugar_level",
  "milk_sub",
  "flavor",
  "add_on",
];
function applicable(item: MenuItem) {
  return (item.variants ?? []).filter(
    (v) => !v.applicable_items || v.applicable_items.includes(item.id),
  );
}
export function productDefaults(item: MenuItem): RegisterOption[] {
  const chosen = resolveMenuDefaults(applicable(item));
  return chosen.map((v) => ({
    variant_group: v.variant_group,
    label: v.label,
    price_modifier: v.price_modifier,
  }));
}
export function ProductOptions({
  item,
  line,
  onClose,
  onSave,
}: {
  item: MenuItem;
  line?: RegisterLine;
  onClose: () => void;
  onSave: (options: RegisterOption[], notes: string, quantity: number) => void;
}) {
  const grouped = useMemo(
    () => Object.groupBy(applicable(item), (v) => v.variant_group),
    [item],
  );
  const groups = [
    ...Object.keys(grouped).sort(
      (a, b) =>
        (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) -
        (order.indexOf(b) < 0 ? 99 : order.indexOf(b)),
    ),
    "notes",
  ];
  const [selected, setSelected] = useState<RegisterOption[]>(() =>
    line
      ? resolveMenuDefaults(applicable(item), line.variants)
      : productDefaults(item),
  );
  const [group, setGroup] = useState(groups[0]),
    [page, setPage] = useState(0),
    [notes, setNotes] = useState(line?.notes ?? ""),
    [quantity, setQuantity] = useState(line?.quantity ?? 1);
  const online = useOnline();
  const { availability, checking } = useAvailability(
    item.id,
    selected,
    quantity,
  );
  const temperature = selected.find(
    (v) => v.variant_group === "temperature",
  )?.label;
  const choices = (grouped[group] ?? [])
    .filter(
      (v) =>
        group !== "size" ||
        (temperature === "Hot"
          ? v.label.includes("12oz")
          : temperature === "Iced"
            ? !v.label.includes("12oz")
            : true),
    )
    .sort((a, b) => a.sort_order - b.sort_order);
  const change = (variant: ItemVariant) => {
    setSelected((previous) => {
      const option = {
        variant_group: variant.variant_group,
        label: variant.label,
        price_modifier: variant.price_modifier,
      };
      let next =
        variant.variant_group === "add_on"
          ? previous.some(
              (v) => v.variant_group === "add_on" && v.label === variant.label,
            )
            ? previous.filter(
                (v) =>
                  v.variant_group !== "add_on" || v.label !== variant.label,
              )
            : [...previous, option]
          : [
              ...previous.filter(
                (v) => v.variant_group !== variant.variant_group,
              ),
              option,
            ];
      if (variant.variant_group === "temperature")
        next = resolveMenuDefaults(applicable(item), next);
      return next;
    });
  };
  const price = item.price + selected.reduce((n, v) => n + v.price_modifier, 0);
  const requiredComplete = Object.keys(grouped).every(
    (key) => key === "add_on" || selected.some((v) => v.variant_group === key),
  );
  const canSave = requiredComplete && (!online || !!availability?.available);
  return (
    <PosDialog
      title={line ? "Edit " + item.name : item.name}
      wide
      onClose={onClose}
    >
      <div className="option-layout">
        <nav className="option-tabs" aria-label="Customization sections">
          {groups.map((key) => (
            <button
              key={key}
              className={group === key ? "is-selected" : ""}
              onClick={() => {
                setGroup(key);
                setPage(0);
              }}
            >
              <span>{labels[key] ?? key.replaceAll("_", " ")}</span>
              <small>
                {key === "notes"
                  ? notes || "Optional"
                  : selected
                      .filter((v) => v.variant_group === key)
                      .map((v) => v.label)
                      .join(", ") || "None"}
              </small>
            </button>
          ))}
        </nav>
        <section className="option-content">
          <h3>{labels[group] ?? group.replaceAll("_", " ")}</h3>
          {group === "notes" ? (
            <>
              <p className="pos-muted">Visible to the preparation team.</p>
              <label>
                Item notes
                <FieldRequirement required={false} />
                <textarea
                  className="pos-field"
                  rows={4}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  aria-label="Item notes"
                  style={{ marginTop: 14 }}
                />
              </label>
              <div className="quantity-control" style={{ marginTop: 16 }}>
                <button
                  className="pos-icon-button"
                  aria-label="Decrease item quantity"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((n) => n - 1)}
                >
                  <PosIcon name="minus" />
                </button>
                <span>{quantity}</span>
                <button
                  className="pos-icon-button"
                  aria-label="Increase item quantity"
                  onClick={() => setQuantity((n) => n + 1)}
                >
                  <PosIcon name="plus" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="option-choices">
                {group === "add_on" &&
                  choices.some((v) => v.label === "Extra Shot") && (
                    <button
                      className={`option-choice ${!selected.some((v) => v.variant_group === "add_on" && v.label === "Extra Shot") ? "is-selected" : ""}`}
                      aria-pressed={
                        !selected.some(
                          (v) =>
                            v.variant_group === "add_on" &&
                            v.label === "Extra Shot",
                        )
                      }
                      onClick={() =>
                        setSelected((previous) =>
                          previous.filter(
                            (v) =>
                              v.variant_group !== "add_on" ||
                              v.label !== "Extra Shot",
                          ),
                        )
                      }
                    >
                      Standard espresso<small>Included</small>
                    </button>
                  )}
                {choices.slice(page * 6, page * 6 + 6).map((v) => {
                  const chosen = selected.some(
                    (s) =>
                      s.variant_group === v.variant_group &&
                      s.label === v.label,
                  );
                  const disabled =
                    online &&
                    availability?.options?.[v.variant_group + ":" + v.label] ===
                      false;
                  return (
                    <button
                      key={v.id}
                      className={
                        "option-choice " + (chosen ? "is-selected" : "")
                      }
                      aria-pressed={chosen}
                      disabled={disabled}
                      onClick={() => change(v)}
                    >
                      {v.label === "Extra Shot" ? "+1 Extra Shot" : v.label}
                      <small>
                        {disabled
                          ? "Unavailable"
                          : v.price_modifier
                            ? "+ " + pesos(v.price_modifier)
                            : "Included"}
                      </small>
                    </button>
                  );
                })}
              </div>
              {choices.length > 6 && (
                <div className="catalog-pagination">
                  <button
                    className="pos-icon-button"
                    aria-label="Previous options"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <PosIcon name="left" />
                  </button>
                  <span>
                    {page + 1} / {Math.ceil(choices.length / 6)}
                  </span>
                  <button
                    className="pos-icon-button"
                    aria-label="Next options"
                    disabled={(page + 1) * 6 >= choices.length}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <PosIcon name="right" />
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <div className="option-summary">
        {selected.map((v) => v.label).join(" · ") || "Standard item"}
        {online && availability?.reason && (
          <p role="alert" style={{ color: "#9e4339", marginTop: 5 }}>
            {availability.reason}
          </p>
        )}
        {!online && <p>Draft only · availability will be checked online</p>}
      </div>
      <footer className="pos-dialog-footer">
        <strong className="option-total pos-number">
          {pesos(price * quantity)}
        </strong>
        <button className="pos-button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="pos-button pos-primary"
          disabled={!canSave}
          onClick={() => onSave(selected, notes, quantity)}
        >
          {checking && online && !availability
            ? "Checking…"
            : line
              ? "Update item"
              : "Add to ticket"}
        </button>
      </footer>
    </PosDialog>
  );
}
