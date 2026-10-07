import type { CartItem, SelectedVariant } from "@cafeos/shared/types";

export function cartLineId(
  product: string,
  variants: SelectedVariant[],
  notes: string | null = null,
) {
  const options = variants
    .map((v) => [v.variant_group.trim(), v.label.trim()])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return `${product}:${encodeURIComponent(JSON.stringify([options, (notes ?? "").trim()]))}`;
}
export function normalizeCartLines(items: CartItem[]): CartItem[] {
  const lines = new Map<string, CartItem>();
  for (const item of items) {
    const id = cartLineId(item.menu_item_id, item.variants, item.notes);
    const previous = lines.get(id);
    lines.set(id, {
      ...item,
      id,
      notes: item.notes?.trim() || null,
      quantity: Math.min(99, item.quantity + (previous?.quantity ?? 0)),
    });
  }
  return [...lines.values()];
}
export function validCartLines(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  return normalizeCartLines(
    value.slice(0, 200).filter((item): item is CartItem => {
      if (!item || typeof item !== "object") return false;
      return (
        typeof item.menu_item_id === "string" &&
        typeof item.name === "string" &&
        Number.isFinite(item.price) &&
        item.price >= 0 &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 99 &&
        Array.isArray(item.variants) &&
        item.variants.every(
          (v: SelectedVariant) =>
            v &&
            typeof v.variant_group === "string" &&
            typeof v.label === "string" &&
            Number.isFinite(v.price_modifier),
        ) &&
        (item.notes == null || typeof item.notes === "string")
      );
    }),
  );
}
