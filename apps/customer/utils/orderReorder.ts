import type { CartItem, MenuItem, Order } from "@cafeos/shared/types";
import { cartLineId, normalizeCartLines } from "./cartDraft";

export function buildReorderDraft(
  order: Order,
  menuItems: MenuItem[],
): { items: CartItem[]; issues: string[] } {
  const items: CartItem[] = [],
    issues: string[] = [];
  for (const line of order.items ?? []) {
    const product = menuItems.find(
      (p) => p.id === line.menu_item_id && p.status === "active",
    );
    if (!product || !product.is_available) {
      issues.push(`${line.name} is currently unavailable.`);
      continue;
    }
    const choices = (product.variants ?? []).filter(
      (v) => !v.applicable_items || v.applicable_items.includes(product.id),
    );
    const required = [...new Set(choices.map((v) => v.variant_group))].filter(
      (group) => group !== "add_on",
    );
    const previous = [...(line.variants ?? [])];
    // Older purchases predate the explicit included-milk option. Restore only
    // this free default; paid replacements and other changed groups need review.
    if (!previous.some((v) => v.variant_group === "milk_sub")) {
      const included = choices.find(
        (v) =>
          v.variant_group === "milk_sub" &&
          v.label === "Whole Milk" &&
          v.is_default &&
          v.is_available !== false &&
          Number(v.price_modifier) === 0,
      );
      if (included)
        previous.push({
          variant_group: included.variant_group,
          label: included.label,
          price_modifier: 0,
        });
    }
    const variants = previous.map((v) =>
      choices.find(
        (current) =>
          current.variant_group === v.variant_group &&
          current.label === v.label,
      ),
    );
    const temperature = previous.find(
      (v) => v.variant_group === "temperature",
    )?.label;
    const size = previous.find((v) => v.variant_group === "size")?.label;
    if (
      variants.some((v) => !v || v.is_available === false) ||
      required.some(
        (group) =>
          previous.filter((v) => v.variant_group === group).length !== 1,
      ) ||
      new Set(
        previous.map((v) =>
          v.variant_group === "add_on"
            ? `${v.variant_group}:${v.label}`
            : v.variant_group,
        ),
      ).size !== previous.length ||
      (size &&
        ((temperature === "Hot" && !size.includes("12oz")) ||
          (temperature === "Iced" && size.includes("12oz"))))
    ) {
      issues.push(`Review ${line.name}: its options have changed.`);
      continue;
    }
    const selected = variants.map((v) => ({
      variant_group: v!.variant_group,
      label: v!.label,
      price_modifier: Number(v!.price_modifier),
    }));
    const price =
      Math.round(
        (Number(product.price) +
          selected.reduce((s, v) => s + v.price_modifier, 0)) *
          100,
      ) / 100;
    if (price !== Number(line.price))
      issues.push(`${line.name} is now ₱${price.toFixed(2)} per item.`);
    items.push({
      id: cartLineId(product.id, selected, line.notes),
      menu_item_id: product.id,
      name: product.name,
      price,
      quantity: line.quantity,
      variants: selected,
      image_url: product.image_url,
      prep_time_minutes: product.prep_time_minutes,
      notes: line.notes,
    });
  }
  return { items: normalizeCartLines(items), issues };
}
