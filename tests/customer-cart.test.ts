import assert from "node:assert/strict";
import test from "node:test";
import type {
  CartItem,
  MenuItem,
  Order,
} from "../packages/shared/src/types/index.ts";
import {
  cartLineId,
  normalizeCartLines,
  validCartLines,
} from "../apps/customer/utils/cartDraft.ts";
import { buildReorderDraft } from "../apps/customer/utils/orderReorder.ts";
const variants = [
  { variant_group: "size", label: "Large", price_modifier: 20 },
  { variant_group: "milk_sub", label: "Oat", price_modifier: 30 },
];
const line = {
  id: "legacy",
  menu_item_id: "latte",
  name: "Latte",
  price: 150,
  quantity: 1,
  variants,
  notes: "Less ice",
  image_url: null,
  prep_time_minutes: 5,
} satisfies CartItem;
test("customer bag preserves distinct notes and options while merging normalized configurations", () => {
  const merged = normalizeCartLines([
    line,
    {
      ...line,
      id: "other",
      variants: [...variants].reverse(),
      quantity: 2,
      notes: " Less ice ",
    },
    { ...line, notes: "No ice" },
    { ...line, variants: [variants[0]] },
  ]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].quantity, 3);
  assert.equal(merged[0].id, cartLineId("latte", variants, "Less ice"));
  const edited = normalizeCartLines(
    merged.map((i) => ({ ...i, notes: "No ice" })),
  );
  assert.equal(edited.length, 2);
  assert.equal(edited[0].quantity, 4);
});
test("corrupt persisted drafts cannot introduce nonfinite totals or fractional quantities", () => {
  const recovered = validCartLines([
    line,
    { ...line, quantity: 1.5 },
    { ...line, price: Infinity },
    { ...line, quantity: 0 },
    { ...line, variants: [{ label: "forged" }] },
  ]);
  assert.deepEqual(recovered, normalizeCartLines([line]));
  assert.equal(validCartLines({ items: [line] }).length, 0);
});
test("reorder explains changed prices and excludes removed options without replacing an existing bag", () => {
  const product = {
    id: "latte",
    name: "Latte",
    status: "active",
    is_available: true,
    price: 110,
    variants: variants.map((v) => ({ ...v, is_available: true })),
    image_url: null,
    prep_time_minutes: 5,
  } as MenuItem;
  const order = {
    items: [
      { ...line, subtotal: 150 },
      { ...line, menu_item_id: "archived" },
      {
        ...line,
        variants: [
          {
            variant_group: "milk_sub",
            label: "Removed milk",
            price_modifier: 0,
          },
        ],
      },
    ],
  } as unknown as Order;
  const original = structuredClone(line);
  const draft = buildReorderDraft(order, [product]);
  assert.equal(draft.items.length, 1);
  assert.equal(draft.items[0].price, 160);
  assert.equal(draft.items[0].notes, "Less ice");
  assert.equal(draft.issues.length, 3);
  assert.deepEqual(line, original);
  assert.equal(order.items![0].price, 150);
});
