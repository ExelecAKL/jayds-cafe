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
    const variants = (line.variants ?? []).map((v) =>
      product.variants?.find(
        (current) =>
          current.variant_group === v.variant_group &&
          current.label === v.label,
      ),
    );
    if (variants.some((v) => !v || v.is_available === false)) {
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
