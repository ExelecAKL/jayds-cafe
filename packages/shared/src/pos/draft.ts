import type { RegisterDraft, RegisterLine, RegisterOption } from "./types";

export const emptyDraft = (): RegisterDraft => ({
  version: 1,
  items: [],
  notes: "",
  customer: null,
  points: 0,
  parked_order_id: null,
});
export const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
export const pesos = (value: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    value,
  );
export function normalizedOptions(options: RegisterOption[]) {
  return [...options].sort((a, b) =>
    (a.variant_group + ":" + a.label).localeCompare(
      b.variant_group + ":" + b.label,
    ),
  );
}
export function lineIdentity(
  line: Pick<RegisterLine, "menu_item_id" | "variants" | "notes">,
) {
  return JSON.stringify([
    line.menu_item_id,
    normalizedOptions(line.variants).map((v) => [v.variant_group, v.label]),
    line.notes.trim(),
  ]);
}
export function lineTotal(line: RegisterLine) {
  return money(
    (line.price + line.variants.reduce((n, v) => n + v.price_modifier, 0)) *
      line.quantity,
  );
}
export function addLine(
  items: RegisterLine[],
  line: RegisterLine,
  replacing?: string,
) {
  const remaining = items.filter((i) => i.line_id !== replacing);
  const existing = remaining.find(
    (i) => lineIdentity(i) === lineIdentity(line),
  );
  if (existing)
    return remaining.map((i) =>
      i.line_id === existing.line_id
        ? { ...i, quantity: i.quantity + line.quantity }
        : i,
    );
  return [
    ...remaining,
    {
      ...line,
      notes: line.notes.trim(),
      variants: normalizedOptions(line.variants),
    },
  ];
}
export function draftTotals(draft: RegisterDraft) {
  const subtotal = money(
    draft.items.reduce((sum, line) => sum + lineTotal(line), 0),
  );
  const points = draft.customer
    ? Math.min(
        Math.max(0, Math.floor(draft.points)),
        draft.customer.points,
        Math.floor(subtotal * 10),
      )
    : 0;
  const discount = money(points / 10);
  return {
    subtotal,
    points,
    discount,
    total: money(subtotal - discount),
    count: draft.items.reduce((n, line) => n + line.quantity, 0),
  };
}
export function readDraft(value: string | null): RegisterDraft {
  try {
    const draft = JSON.parse(value ?? "null") as RegisterDraft | null;
    if (
      !draft ||
      draft.version !== 1 ||
      !Array.isArray(draft.items) ||
      typeof draft.notes !== "string" ||
      !Number.isSafeInteger(draft.points)
    )
      return emptyDraft();
    if (
      draft.items.some(
        (i) =>
          !i ||
          typeof i.line_id !== "string" ||
          typeof i.menu_item_id !== "string" ||
          typeof i.name !== "string" ||
          !Number.isFinite(i.price) ||
          i.price < 0 ||
          !Number.isSafeInteger(i.quantity) ||
          i.quantity < 1 ||
          typeof i.notes !== "string" ||
          !Array.isArray(i.variants) ||
          i.variants.some(
            (v) =>
              typeof v.label !== "string" ||
              typeof v.variant_group !== "string" ||
              !Number.isFinite(v.price_modifier),
          ),
      )
    )
      return emptyDraft();
    if (
      draft.customer &&
      (typeof draft.customer.id !== "string" ||
        !Number.isFinite(draft.customer.points))
    )
      return emptyDraft();
    for (const field of ["pending_checkout", "pending_park"] as const) {
      const pending = draft[field];
      if (
        pending &&
        (typeof pending.key !== "string" ||
          !pending.payload ||
          typeof pending.payload !== "object")
      )
        delete draft[field];
    }
    return draft;
  } catch {
    return emptyDraft();
  }
}
