import { createHash } from "node:crypto";
import { calculateFinancials } from "../../packages/shared/src/finance/calculations.ts";
export type Row = Record<string, unknown>;
export interface Variant {
  variant_group: string;
  label: string;
  price_modifier: number;
  is_default: boolean;
  applicable_items?: string[] | null;
  menu_item_id: string;
}
export interface Recipe {
  menu_item_id: string;
  ingredient_id: string;
  quantity_used: number;
  size_multipliers: Record<string, number>;
}
export interface VariantRecipe {
  id: string;
  ingredient_id: string;
  quantity_used: number;
  variant_group: string;
  variant_label: string;
  size_multipliers: Record<string, number>;
  replaces_ingredient_id: string | null;
}
export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  current_stock: number;
  stock_version: number;
  stock_kind: string;
  is_active: boolean;
}
export interface Profile {
  id: string;
  role: string;
  points: number;
  total_spent: number;
  total_orders: number;
  loyalty_tier: string;
  last_order_at: string | null;
  updated_at: string;
}
export interface HistoryInput {
  menu: {
    id: string;
    name: string;
    price: number;
    category_id: string | null;
    status: string;
  }[];
  categories: {
    id: string;
    name: string;
    is_active: boolean;
    status: string;
  }[];
  variants: Variant[];
  recipes: Recipe[];
  variantRecipes: VariantRecipe[];
  ingredients: Ingredient[];
  profiles: Profile[];
  batches: {
    id: string;
    ingredient_id: string;
    quantity: number;
    reserved: number;
    unit_cost: number;
    expires_on: string | null;
    received_at: string;
  }[];
  movements: {
    ingredient_id: string;
    created_at: string;
    balance_after: number;
  }[];
}
export interface HistoryModel {
  id: string;
  tables: Record<string, Row[]>;
  updates: Record<string, Row[]>;
  manifest: Row;
  configurations: {
    item: string;
    variants: Variant[];
    requirements: Record<string, number>;
  }[];
}
export const quantity = (n: number) => Math.round(n * 1000000) / 1000000;
const dayMs = 86400000;
// Use UTC noon for calendar arithmetic so a Philippine midnight does not become the previous date.
const addDate = (date: string, days: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + days * dayMs)
    .toISOString()
    .slice(0, 10);
export const timestamp = (date: string, hour = 13, minute = 0) =>
  new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`,
  ).toISOString();
export function historyId(key: string) {
  const h = createHash("sha256")
    .update("jayds-history-v1:" + key)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function recipeRequirements(
  input: HistoryInput,
  item: string,
  variants: Variant[],
): Record<string, number> {
  const size =
    variants.find((v) => v.variant_group === "size")?.label ?? "Medium 16oz";
  const selected = input.variantRecipes.filter((r) =>
    variants.some(
      (v) => v.variant_group === r.variant_group && v.label === r.variant_label,
    ),
  );
  const base = input.recipes.filter((r) => r.menu_item_id === item),
    result: Record<string, number> = {};
  const add = (id: string, value: number) => {
    result[id] = quantity((result[id] ?? 0) + value);
  };
  for (const r of base)
    if (!selected.some((s) => s.replaces_ingredient_id === r.ingredient_id))
      add(
        r.ingredient_id,
        Number(r.quantity_used) * Number(r.size_multipliers?.[size] ?? 1),
      );
  for (const r of selected)
    if (
      !selected.some(
        (s) => s.id !== r.id && s.replaces_ingredient_id === r.ingredient_id,
      )
    )
      add(
        r.ingredient_id,
        Number(r.quantity_used) *
          Number(
            r.size_multipliers?.[size] ??
              base.find((b) => b.ingredient_id === r.replaces_ingredient_id)
                ?.size_multipliers?.[size] ??
              1,
          ),
      );
  return Object.fromEntries(
    Object.entries(result)
      .filter(([, value]) => value > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
function random(seed: string) {
  let n = parseInt(
    createHash("sha256").update(seed).digest("hex").slice(0, 8),
    16,
  );
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const supplierNames = [
  "Silang Highlands Coffee Supply",
  "South Cavite Dairy & Chilled Goods",
  "Dasma Baking Pantry",
  "Metro South Beverage Essentials",
  "PrimePack Café Supplies",
  "Cavite Frozen Foods Depot",
  "Everyday Produce & Dry Goods",
];
function supply(ingredient: Ingredient) {
  const name = ingredient.name.toLowerCase(),
    packaging = /cup|lid|straw/.test(name),
    dairy = /milk|cream|cheese/.test(name) && !/powder|seasoning/.test(name),
    frozen = /fries|dough|ham/.test(name);
  const supplier = packaging
    ? 4
    : /espresso beans|instant coffee/.test(name)
      ? 0
      : dairy
        ? 1
        : /flour|sugar|butter|egg|chocolate chips|nutella|biscoff|almonds|marshmallow/.test(
              name,
            )
          ? 2
          : frozen
            ? 5
            : /syrup|sauce|powder|puree|tea|foam|jelly|pearls/.test(name)
              ? 3
              : 6;
  const pack = packaging
    ? /cup/.test(name)
      ? 50
      : 100
    : ingredient.unit === "pcs"
      ? /egg/.test(name)
        ? 30
        : /dough/.test(name)
          ? 20
          : 12
      : /ice/.test(name)
        ? 5000
        : /flour|oil|fries/.test(name)
          ? 5000
          : /powder|spread|nutella/.test(name)
            ? 500
            : 1000;
  return {
    supplier,
    pack,
    days: packaging
      ? 21
      : /ice/.test(name)
        ? 1
        : dairy
          ? 3
          : frozen
            ? 7
            : /beans/.test(name)
              ? 7
              : 14,
    shelf: packaging
      ? null
      : /ice/.test(name)
        ? 2
        : dairy
          ? 10
          : frozen
            ? 60
            : /banana/.test(name)
              ? 5
              : 180,
    lead: packaging ? 4 : dairy ? 1 : 3,
    kind: packaging ? "packaging" : ingredient.stock_kind,
  };
}
interface PlannedOrder {
  row: Row;
  items: Row[];
  requirements: Record<string, number>;
  consume: boolean;
  reserve: boolean;
  date: string;
  profile: Profile | null;
  breakdown: ReturnType<typeof calculateFinancials>;
}
export function buildCafeHistory(
  input: HistoryInput,
  {
    now,
    months = 20,
    seed = "jayds-2026-10-16",
  }: { now: Date; months?: number; seed?: string },
): HistoryModel {
  const rand = random(seed),
    end = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  const first = new Date(end + "T12:00:00Z");
  first.setUTCMonth(first.getUTCMonth() - months);
  const start = first.toISOString().slice(0, 10);
  const id = historyId(seed + ":" + start + ":" + end),
    tables: Record<string, Row[]> = {},
    updates: Record<string, Row[]> = {};
  const emit = (table: string, row: Row) => {
    (tables[table] ??= []).push(row);
    return row;
  };
  const uid = (key: string) => historyId(id + ":" + key);
  const admin = input.profiles.find((p) => p.role === "admin"),
    staff = input.profiles.find((p) => p.role === "staff") ?? admin,
    customers = input.profiles.filter((p) => p.role === "customer");
  if (!admin || !staff || !customers.length)
    throw Error(
      "The history needs existing test Admin, staff and customer accounts.",
    );
  const adminId = admin.id;
  const balances = new Map(customers.map((p) => [p.id, Number(p.points)])),
    spent = new Map(customers.map((p) => [p.id, 0])),
    visits = new Map(customers.map((p) => [p.id, 0]));
  const activeCategories = new Set(
    input.categories
      .filter((c) => c.is_active && c.status === "active")
      .map((c) => c.id),
  );
  const menu = input.menu.filter(
    (m) =>
      m.status === "active" &&
      Number(m.price) > 0 &&
      (!m.category_id || activeCategories.has(m.category_id)) &&
      input.recipes.some((r) => r.menu_item_id === m.id),
  );
  if (menu.length < 2) throw Error("No usable priced recipes for the history.");
  const categories = new Map(input.categories.map((c) => [c.id, c.name]));
  const weight = (m: (typeof menu)[number]) =>
    /Spanish Latte|Caramel Macchiato/.test(m.name)
      ? 7
      : /Coffee Latte|Americano/.test(m.name)
        ? 5
        : /Matcha Latte|Mocha|Classic Milk Tea/.test(m.name)
          ? 3
          : categories.get(m.category_id ?? "")?.includes("Croffle")
            ? 1.2
            : 2;
  const totalWeight = menu.reduce((n, m) => n + weight(m), 0);
  const pickMenu = () => {
    let n = rand() * totalWeight;
    return menu.find((m) => (n -= weight(m)) <= 0) ?? menu[0];
  };
  const configs = new Map<string, HistoryModel["configurations"][number]>(),
    orders: PlannedOrder[] = [],
    dailyDemand = new Map<string, Record<string, number>>();
  const hours = [0.07, 0.09, 0.13, 0.14, 0.12, 0.13, 0.14, 0.11, 0.07];
  let days = 0;
  for (let date = start; date <= end; date = addDate(date, 1), days++) {
    const calendar = new Date(date + "T12:00:00Z"),
      weekend = [0, 6].includes(calendar.getUTCDay()),
      month = calendar.getUTCMonth() + 1;
    const season =
      month === 12
        ? 1.18
        : month === 1
          ? 0.86
          : [6, 7, 8, 9].includes(month)
            ? 0.95
            : 1;
    const payday = [14, 15, 16, 29, 30].includes(calendar.getUTCDate())
      ? 1.15
      : 1;
    const count = Math.max(
      7,
      Math.round(
        (13 + days * 0.009) *
          (weekend ? 1.35 : 1) *
          season *
          payday *
          (0.75 + rand() * 0.5),
      ),
    );
    for (let index = 0; index < count; index++) {
      let h = rand();
      const bucket = hours.findIndex((v) => (h -= v) <= 0),
        hour = 13 + (bucket < 0 ? 8 : bucket),
        created = timestamp(date, hour, Math.floor(rand() * 60));
      if (Date.parse(created) > now.getTime() - 30 * 60000) continue;
      const orderId = uid(`order:${date}:${index}`),
        profile =
          rand() < 0.38
            ? customers[Math.floor(rand() * customers.length)]
            : null;
      const canceled = rand() < 0.035,
        refunded = !canceled && rand() < 0.012;
      const source = profile && rand() < 0.65 ? "app" : "pos",
        delivery = source === "app" && rand() < 0.1;
      const payment = refunded || delivery || rand() < 0.28 ? "maya" : "cash";
      const items: Row[] = [],
        requirements: Record<string, number> = {};
      const itemCount = rand() < 0.07 ? 3 : rand() < 0.28 ? 2 : 1;
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
        const product = pickMenu(),
          all = input.variants
            .filter(
              (v) =>
                v.menu_item_id === product.id &&
                (!v.applicable_items ||
                  v.applicable_items.includes(product.id)),
            )
            .sort(
              (a, b) =>
                a.variant_group.localeCompare(b.variant_group) ||
                a.label.localeCompare(b.label),
            ),
          groups = new Map<string, Variant[]>();
        for (const variant of all)
          groups.set(variant.variant_group, [
            ...(groups.get(variant.variant_group) ?? []),
            variant,
          ]);
        const selected: Variant[] = [];
        for (const [group, options] of groups) {
          if (group === "add_on") {
            const shot = options.find((v) => /extra shot/i.test(v.label));
            if (shot && rand() < 0.07) selected.push(shot);
            continue;
          }
          let option = options.find((v) => v.is_default) ?? options[0];
          if (group === "milk_sub") {
            option =
              options.find(
                (v) =>
                  v.label === "Whole Milk" && Number(v.price_modifier) === 0,
              ) ?? option;
            if (rand() < 0.09)
              option =
                options.find((v) => /Oat|Almond/.test(v.label)) ?? option;
          } else if (group === "size" && rand() < 0.24)
            option = options.find((v) => /22|large/i.test(v.label)) ?? option;
          else if (group === "sugar_level" && rand() < 0.23)
            option = options[Math.floor(rand() * options.length)];
          selected.push(option);
        }
        const key =
            product.id +
            JSON.stringify(selected.map((v) => [v.variant_group, v.label])),
          recipe =
            configs.get(key)?.requirements ??
            recipeRequirements(input, product.id, selected);
        configs.set(key, {
          item: product.id,
          variants: selected,
          requirements: recipe,
        });
        const qty = rand() < 0.08 ? 2 : 1,
          price =
            Math.round(
              (Number(product.price) +
                selected.reduce((n, v) => n + Number(v.price_modifier), 0)) *
                100,
            ) / 100;
        if (price <= 0 || !Object.keys(recipe).length)
          throw Error("A selected history item has no valid price or recipe.");
        items.push({
          id: uid(`item:${orderId}:${itemIndex}`),
          order_id: orderId,
          menu_item_id: product.id,
          name: product.name,
          price,
          quantity: qty,
          subtotal: Math.round(price * qty * 100) / 100,
          variants: selected.map((v) => ({
            variant_group: v.variant_group,
            label: v.label,
            price_modifier: Number(v.price_modifier),
          })),
          notes: null,
          created_at: created,
        });
        for (const [ingredient, amount] of Object.entries(recipe))
          requirements[ingredient] = quantity(
            (requirements[ingredient] ?? 0) + amount * qty,
          );
      }
      const redeem = 0;
      const fee = delivery ? Math.round(49 + rand() * 35) : 0;
      const breakdown = calculateFinancials({
        items: items as unknown as Parameters<
          typeof calculateFinancials
        >[0]["items"],
        points: redeem,
        deliveryFee: fee,
        deliveryTaxTreatment: "pass_through",
      });
      const earned =
        profile && !canceled && !refunded
          ? Math.floor(breakdown.total / 1000)
          : 0;
      const row: Row = {
        id: orderId,
        order_number: `JD-${date.replaceAll("-", "")}-${String(index + 1).padStart(4, "0")}`,
        customer_id: profile?.id ?? null,
        staff_id: source === "pos" ? staff.id : null,
        status: canceled || refunded ? "cancelled" : "completed",
        order_type: delivery ? "delivery" : "pickup",
        order_source: source,
        payment_method: payment,
        payment_status: refunded ? "refunded" : canceled ? "pending" : "paid",
        subtotal: breakdown.gross / 100,
        discount: breakdown.discount / 100,
        total: breakdown.total / 100,
        points_earned: earned,
        points_redeemed: redeem,
        notes: null,
        delivery_fee: fee,
        delivery_address: delivery ? "Dasmariñas, Cavite" : null,
        delivery_name: null,
        delivery_phone: null,
        lalamove_status: delivery && !canceled ? "COMPLETED" : null,
        created_at: created,
        updated_at: new Date(
          Date.parse(created) + (canceled ? 3 : refunded ? 25 : 18) * 60000,
        ).toISOString(),
        inventory_managed: true,
        inventory_consumed: !canceled,
        is_parked: false,
        stock_conflict: false,
        rewards_returned: canceled || refunded,
        idempotency_key: `history:${id}:${orderId}`,
        request_fingerprint: createHash("sha256")
          .update(JSON.stringify(items))
          .digest("hex"),
        synthetic_dataset_id: id,
      };
      orders.push({
        row,
        items,
        requirements,
        consume: !canceled,
        reserve: false,
        date,
        profile,
        breakdown,
      });
      const daily = dailyDemand.get(date) ?? {};
      for (const [ingredient, amount] of Object.entries(requirements))
        daily[ingredient] = quantity((daily[ingredient] ?? 0) + amount);
      dailyDemand.set(date, daily);
    }
  }
  orders.sort((a, b) =>
    String(a.row.created_at).localeCompare(String(b.row.created_at)),
  );
  for (const order of orders) {
    if (!order.profile || order.row.status !== "completed") continue;
    const customer = order.profile.id,
      balance = balances.get(customer) ?? 0,
      subtotal = Number(order.row.subtotal);
    const redeem =
      balance >= 120 && rand() < 0.45
        ? Math.min(Math.floor(subtotal * 2), Math.floor(balance / 10) * 10)
        : 0;
    order.breakdown = calculateFinancials({
      items: order.items as unknown as Parameters<
        typeof calculateFinancials
      >[0]["items"],
      points: redeem,
      deliveryFee: Number(order.row.delivery_fee),
      deliveryTaxTreatment: "pass_through",
    });
    const earned = Math.floor(order.breakdown.total / 1000);
    Object.assign(order.row, {
      points_redeemed: redeem,
      points_earned: earned,
      discount: order.breakdown.discount / 100,
      total: order.breakdown.total / 100,
    });
    balances.set(customer, balance - redeem + earned);
    spent.set(
      customer,
      (spent.get(customer) ?? 0) + order.breakdown.total / 100,
    );
    visits.set(customer, (visits.get(customer) ?? 0) + 1);
  }
  const settings = new Map(input.ingredients.map((i) => [i.id, supply(i)]));
  const suppliers = supplierNames.map((name, index) =>
    emit("suppliers", {
      id: uid("supplier:" + index),
      name,
      lead_time_days: index === 1 ? 1 : 3,
      notes:
        index === 4
          ? "Cups, lids and takeaway packaging"
          : index === 0
            ? "Coffee beans and café essentials"
            : index === 1
              ? "Chilled dairy and cold-chain delivery"
              : index === 2
                ? "Baking ingredients and pantry items"
                : index === 5
                  ? "Frozen snacks and pastry supplies"
                  : "Beverage and dry-goods supply",
      is_active: true,
      created_at: timestamp(addDate(start, -14), 10),
    }),
  );
  const lots = new Map<string, Row[]>(),
    available = new Map<string, number>(),
    baseline = new Map<string, HistoryInput["movements"]>(),
    heldExpired = new Map<string, number>();
  const heldLotIds = new Set<string>();
  for (const ingredient of input.ingredients)
    baseline.set(
      ingredient.id,
      input.movements
        .filter((m) => m.ingredient_id === ingredient.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    );
  const baselineAt = (ingredient: string, at: string) => {
    const records = baseline.get(ingredient) ?? [];
    let value = 0;
    for (const r of records) {
      if (r.created_at > at) break;
      value = Number(r.balance_after);
    }
    return value;
  };
  const movement = (
    ingredient: string,
    batch: Row,
    amount: number,
    kind: string,
    reason: string,
    at: string,
    extra: Row = {},
  ) =>
    emit("stock_movements", {
      id: uid(`movement:${tables.stock_movements?.length ?? 0}`),
      ingredient_id: ingredient,
      batch_id: batch.id,
      quantity: quantity(amount),
      movement_type: kind,
      balance_after: quantity(
        (available.get(ingredient) ?? 0) +
          (heldExpired.get(ingredient) ?? 0) +
          baselineAt(ingredient, at),
      ),
      actor_id: admin.id,
      reason,
      created_at: at,
      unit_cost: Number(batch.unit_cost),
      ...extra,
    });
  const deliveryGroups = new Map<string, { po: Row; receipt: Row }>();
  function receive(
    ingredient: Ingredient,
    amount: number,
    date: string,
    label = "Scheduled supply delivery",
    expiry?: string | null,
  ) {
    const cfg = settings.get(ingredient.id)!,
      when = timestamp(date, 12),
      groupKey = date + ":" + cfg.supplier;
    let group = deliveryGroups.get(groupKey);
    if (!group) {
      const poId = uid("po:" + groupKey),
        receiptId = uid("receipt:" + groupKey);
      group = {
        po: emit("purchase_orders", {
          id: poId,
          number: `PO-${date.replaceAll("-", "")}-${cfg.supplier + 1}`,
          supplier_id: suppliers[cfg.supplier].id,
          status: "received",
          expected_on: date,
          notes: label,
          generated: false,
          manually_edited: false,
          actor_id: adminId,
          created_at: timestamp(addDate(date, -cfg.lead), 14),
        }),
        receipt: emit("goods_receipts", {
          id: receiptId,
          purchase_order_id: poId,
          reference: `DR-${date.replaceAll("-", "")}-${cfg.supplier + 1}`,
          idempotency_key: uid("receipt-key:" + groupKey),
          fingerprint: uid("receipt-fingerprint:" + groupKey),
          actor_id: adminId,
          created_at: when,
        }),
      };
      deliveryGroups.set(groupKey, group);
    }
    const unitCost =
      Math.round(
        Number(ingredient.cost_per_unit) * (0.96 + rand() * 0.08) * 10000,
      ) / 10000;
    const lineKey = String(group.po.id) + ":" + ingredient.id,
      existing = tables.purchase_order_lines?.find(
        (l) => l.id === uid("line:" + lineKey),
      );
    if (existing) {
      existing.unit_cost =
        (Number(existing.quantity) * Number(existing.unit_cost) +
          amount * unitCost) /
        (Number(existing.quantity) + amount);
      existing.quantity = quantity(Number(existing.quantity) + amount);
      existing.received_quantity = existing.quantity;
    } else
      emit("purchase_order_lines", {
        id: uid("line:" + lineKey),
        purchase_order_id: group.po.id,
        ingredient_id: ingredient.id,
        quantity: quantity(amount),
        received_quantity: quantity(amount),
        unit_cost: unitCost,
      });
    const batch = emit("stock_batches", {
      id: uid(
        `batch:${ingredient.id}:${date}:${tables.stock_batches?.length ?? 0}`,
      ),
      ingredient_id: ingredient.id,
      batch_code: `LOT-${date.replaceAll("-", "")}-${String(input.ingredients.indexOf(ingredient) + 1).padStart(3, "0")}`,
      quantity: quantity(amount),
      reserved: 0,
      unit_cost: unitCost,
      expires_on:
        expiry === undefined
          ? cfg.shelf === null
            ? null
            : addDate(date, cfg.shelf)
          : expiry,
      received_at: when,
      receipt_id: group.receipt.id,
    });
    (
      lots.get(ingredient.id) ??
      (lots.set(ingredient.id, []), lots.get(ingredient.id)!)
    ).push(batch);
    available.set(
      ingredient.id,
      quantity((available.get(ingredient.id) ?? 0) + amount),
    );
    movement(
      ingredient.id,
      batch,
      amount,
      "receipt",
      String(group.receipt.reference),
      when,
      { source_id: group.receipt.id },
    );
    return batch;
  }
  const take = (
    ingredient: string,
    amount: number,
    at: string,
    kind: string,
    reason: string,
    extra: Row = {},
    reservation?: { order: string; state: string },
  ) => {
    let remaining = quantity(amount),
      cost = 0;
    const candidates = (lots.get(ingredient) ?? [])
      .filter(
        (l) =>
          Number(l.quantity) > 0 &&
          (!l.expires_on || String(l.expires_on) >= at.slice(0, 10)),
      )
      .sort(
        (a, b) =>
          String(a.expires_on ?? "9999").localeCompare(
            String(b.expires_on ?? "9999"),
          ) || String(a.received_at).localeCompare(String(b.received_at)),
      );
    for (const lot of candidates) {
      if (remaining <= 0) break;
      const used = Math.min(remaining, Number(lot.quantity));
      remaining = quantity(remaining - used);
      cost += used * Number(lot.unit_cost);
      if (reservation)
        emit("stock_reservations", {
          id: uid("reservation:" + (tables.stock_reservations?.length ?? 0)),
          order_id: reservation.order,
          ingredient_id: ingredient,
          batch_id: lot.id,
          quantity: used,
          unit_cost: Number(lot.unit_cost),
          state: reservation.state,
        });
      if (kind !== "release") {
        lot.quantity = quantity(Number(lot.quantity) - used);
        available.set(
          ingredient,
          quantity((available.get(ingredient) ?? 0) - used),
        );
        movement(ingredient, lot, -used, kind, reason, at, extra);
      }
    }
    if (remaining > 0.00001)
      throw Error("Model inventory cannot satisfy a planned recipe.");
    return amount > 0 ? cost / amount : 0;
  };
  for (let date = start; date <= end; date = addDate(date, 1)) {
    for (const ingredient of input.ingredients.filter((i) => i.is_active)) {
      for (const lot of lots.get(ingredient.id) ?? [])
        if (
          Number(lot.quantity) > 0 &&
          lot.expires_on &&
          String(lot.expires_on) < date &&
          !heldLotIds.has(String(lot.id))
        ) {
          const amount = Number(lot.quantity);
          available.set(
            ingredient.id,
            quantity((available.get(ingredient.id) ?? 0) - amount),
          );
          if (date >= addDate(end, -7) && heldLotIds.size < 2) {
            heldLotIds.add(String(lot.id));
            heldExpired.set(
              ingredient.id,
              quantity((heldExpired.get(ingredient.id) ?? 0) + amount),
            );
          } else {
            lot.quantity = 0;
            movement(
              ingredient.id,
              lot,
              -amount,
              "waste",
              "Expired during shelf-life check",
              timestamp(date, 12, 5),
            );
          }
        }
      const cfg = settings.get(ingredient.id)!,
        need = Array.from(
          { length: cfg.days },
          (_, n) => dailyDemand.get(addDate(date, n))?.[ingredient.id] ?? 0,
        ).reduce((a, b) => a + b, 0),
        current = available.get(ingredient.id) ?? 0;
      if (current < need * 1.02 && need > 0)
        receive(
          ingredient,
          Math.max(
            cfg.pack,
            Math.ceil((need * 1.05 - current) / cfg.pack) * cfg.pack,
          ),
          date,
        );
    }
    const dailyOrders = orders.filter((o) => o.date === date);
    for (const order of dailyOrders) {
      emit("orders", order.row);
      for (const item of order.items) emit("order_items", item);
      const created = String(order.row.created_at),
        paid = order.row.payment_status !== "pending";
      for (const [ingredient, amount] of Object.entries(order.requirements)) {
        if ((available.get(ingredient) ?? 0) + 0.00001 < amount)
          throw Error("The planned supplier delivery does not cover the day.");
        const unitCost = take(
          ingredient,
          amount,
          new Date(Date.parse(created) + 4 * 60000).toISOString(),
          order.consume ? "consumption" : "release",
          order.consume
            ? "Preparation started"
            : "Order cancelled before preparation",
          { order_id: order.row.id },
          {
            order: String(order.row.id),
            state: order.consume ? "consumed" : "released",
          },
        );
        emit("order_stock_requirements", {
          order_id: order.row.id,
          ingredient_id: ingredient,
          quantity: amount,
          unit_cost: unitCost,
        });
      }
      const states = order.consume
        ? [
            "pending",
            "confirmed",
            "preparing",
            "ready",
            order.row.status === "cancelled" ? "cancelled" : "completed",
          ]
        : ["pending", "cancelled"];
      states.forEach((state, index) =>
        emit("order_status_history", {
          id: uid(`status:${order.row.id}:${index}`),
          order_id: order.row.id,
          previous_status: index ? states[index - 1] : null,
          new_status: state,
          changed_by: index ? staff.id : null,
          notes: null,
          created_at: new Date(
            Date.parse(created) + index * 4 * 60000,
          ).toISOString(),
        }),
      );
      emit("order_financials", {
        order_id: order.row.id,
        breakdown: {
          ...order.breakdown,
          data_origin: "synthetic",
          synthetic_dataset_id: id,
        },
        created_at: created,
      });
      if (paid) {
        const saleId = uid("sale:" + order.row.id),
          paidAt = new Date(
            Date.parse(created) +
              (order.row.order_source === "app" &&
              order.row.payment_method === "cash"
                ? 16
                : 1) *
                60000,
          ).toISOString();
        emit("financial_events", {
          id: saleId,
          order_id: order.row.id,
          kind: "sale",
          reverses: null,
          breakdown: {
            ...order.breakdown,
            data_origin: "synthetic",
            synthetic_dataset_id: id,
          },
          business_date: date,
          created_at: paidAt,
        });
        if (order.row.payment_status === "refunded")
          emit("financial_events", {
            id: uid("refund:" + order.row.id),
            order_id: order.row.id,
            kind: "refund",
            reverses: saleId,
            breakdown: {
              ...order.breakdown,
              data_origin: "synthetic",
              synthetic_dataset_id: id,
            },
            business_date: date,
            created_at: String(order.row.updated_at),
          });
        if (order.row.payment_method === "cash") {
          const received = Math.ceil(Number(order.row.total) / 50) * 50;
          emit("pos_cash_payments", {
            order_id: order.row.id,
            cash_received: received,
            amount_paid: order.row.total,
            change_due:
              Math.round((received - Number(order.row.total)) * 100) / 100,
            actor_id: staff.id,
            created_at: paidAt,
          });
        }
      }
    }
    if (
      date < end &&
      Math.round(
        (Date.parse(date + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) /
          dayMs,
      ) %
        7 ===
        0
    ) {
      const eligible = input.ingredients.filter(
        (i) => (available.get(i.id) ?? 0) > 0,
      );
      const selected = Array.from(
        { length: Math.min(3, eligible.length) },
        (_, index) =>
          eligible[
            ((tables.stocktakes?.length ?? 0) + index) % eligible.length
          ],
      );
      for (const ingredient of selected) {
        const at = timestamp(date, 21, 50),
          expected = quantity(
            (available.get(ingredient.id) ?? 0) +
              (heldExpired.get(ingredient.id) ?? 0) +
              baselineAt(ingredient.id, at),
          ),
          variance =
            rand() < 0.12
              ? Math.min(
                  (available.get(ingredient.id) ?? 0) * 0.005,
                  settings.get(ingredient.id)!.pack * 0.02,
                )
              : 0,
          counted = quantity(expected - variance),
          countId = uid("count:" + date + ":" + ingredient.id);
        emit("stocktakes", {
          id: countId,
          ingredient_id: ingredient.id,
          expected,
          counted,
          version: tables.stocktakes?.length ?? 0,
          reason: "Weekly stock check",
          state: "posted",
          actor_id: admin.id,
          created_at: at,
          synthetic_dataset_id: id,
        });
        if (variance > 0)
          take(ingredient.id, variance, at, "count", "Weekly stock check", {
            source_id: countId,
          });
        else {
          const batch = (lots.get(ingredient.id) ?? []).find(
            (b) => Number(b.quantity) > 0,
          );
          if (batch)
            movement(
              ingredient.id,
              batch,
              0,
              "count",
              "Weekly stock check",
              at,
              { source_id: countId },
            );
        }
      }
    }
    if (date < end) {
      const pos = dailyOrders.filter(
        (o) => o.row.order_source === "pos" && o.row.status === "completed",
      );
      emit("shifts", {
        id: uid("shift:" + date),
        staff_id: staff.id,
        clock_in: timestamp(date, 12, 45),
        clock_out: timestamp(date, 22, 30),
        orders_handled: pos.length,
        total_sales:
          Math.round(pos.reduce((n, o) => n + Number(o.row.total), 0) * 100) /
          100,
        notes: null,
        created_at: timestamp(date, 12, 45),
      });
      emit("clock_entries", {
        id: uid("clock:" + date),
        staff_id: staff.id,
        clock_in: timestamp(date, 12, 45),
        clock_out: timestamp(date, 22, 30),
        total_hours: 9.75,
        notes: null,
        created_at: timestamp(date, 12, 45),
      });
    }
  }
  const averages = new Map(
    input.ingredients.map((i) => [
      i.id,
      Array.from(
        { length: 56 },
        (_, n) => dailyDemand.get(addDate(end, -n))?.[i.id] ?? 0,
      ).reduce((a, b) => a + b, 0) / 56,
    ]),
  );
  updates.ingredients = input.ingredients.map((ingredient, index) => {
    const cfg = settings.get(ingredient.id)!,
      daily = averages.get(ingredient.id) ?? 0;
    return {
      id: ingredient.id,
      sku: `JD-STK-${String(index + 1).padStart(3, "0")}`,
      supplier_id: suppliers[cfg.supplier].id,
      pack_size: cfg.pack,
      min_purchase_packs: 1,
      lead_time_days: cfg.lead,
      safety_days: 2,
      review_days: 7,
      min_stock_alert: quantity(
        Math.max(cfg.pack * 0.25, daily * (cfg.lead + 2)),
      ),
      max_stock: quantity(Math.max(cfg.pack * 4, daily * 30)),
      stock_kind: cfg.kind,
    };
  });
  updates.profiles = customers.map((p) => ({
    id: p.id,
    points: balances.get(p.id),
    total_spent:
      Math.round((Number(p.total_spent) + (spent.get(p.id) ?? 0)) * 100) / 100,
    total_orders: Number(p.total_orders) + (visits.get(p.id) ?? 0),
    last_order_at:
      orders
        .filter((o) => o.profile?.id === p.id && o.row.status === "completed")
        .at(-1)?.row.updated_at ?? p.last_order_at,
    loyalty_tier:
      (balances.get(p.id) ?? 0) >= 2000
        ? "Gold"
        : (balances.get(p.id) ?? 0) >= 500
          ? "Silver"
          : "Bronze",
  }));
  updates.stock_batches = [];
  const finalAt = new Date(now.getTime() - 60000).toISOString();
  for (const [name, mode] of [
    ["Macadamia Syrup", "empty"],
    ["Almond Milk", "empty"],
    ["White Mocha Sauce", "low"],
    ["Butterscotch Syrup", "low"],
    ["Biscoff Spread", "low"],
  ] as const) {
    const ingredient = input.ingredients.find((i) => i.name === name);
    if (!ingredient) continue;
    const original = input.batches.filter(
        (b) => b.ingredient_id === ingredient.id,
      ),
      model = lots.get(ingredient.id) ?? [];
    let total = quantity(
      [...original, ...model].reduce((n, b) => n + Number(b.quantity), 0),
    );
    const reserved = original.reduce((n, b) => n + Number(b.reserved), 0);
    const keep =
      mode === "empty"
        ? reserved
        : Math.max(
            reserved,
            Math.min(
              settings.get(ingredient.id)!.pack * 0.15,
              (averages.get(ingredient.id) ?? 1) * 0.6,
            ),
          );
    let remove = Math.max(0, total - keep);
    for (const batch of [...model, ...original]) {
      const amount = Math.min(
        remove,
        Math.max(0, Number(batch.quantity) - Number(batch.reserved)),
      );
      if (amount <= 0) continue;
      remove = quantity(remove - amount);
      total = quantity(total - amount);
      if (original.includes(batch as (typeof original)[number]))
        updates.stock_batches.push({
          id: batch.id,
          quantity: quantity(Number(batch.quantity) - amount),
        });
      else {
        batch.quantity = quantity(Number(batch.quantity) - amount);
        if (!heldLotIds.has(String(batch.id)))
          available.set(
            ingredient.id,
            quantity((available.get(ingredient.id) ?? 0) - amount),
          );
      }
      emit("stock_movements", {
        id: uid("quality:" + ingredient.id + ":" + String(batch.id)),
        ingredient_id: ingredient.id,
        batch_id: batch.id,
        quantity: -amount,
        movement_type: "waste",
        balance_after: total,
        actor_id: admin.id,
        reason: "Removed from sale after quality check",
        order_id: null,
        source_id: null,
        unit_cost: Number(batch.unit_cost),
        created_at: finalAt,
      });
    }
  }
  // Current purchasing stages stay actionable; receipts remain linked to actual lots.
  for (let index = 0; index < suppliers.length; index++) {
    const status = [
        "draft",
        "approved",
        "ordered",
        "partial",
        "draft",
        "ordered",
        "cancelled",
      ][index],
      date = addDate(end, -2),
      poId = uid("current-po:" + index),
      stock = input.ingredients
        .filter((i) => settings.get(i.id)?.supplier === index)
        .slice(0, 2);
    if (!stock.length) continue;
    emit("purchase_orders", {
      id: poId,
      number: `PO-${end.replaceAll("-", "")}-N${index + 1}`,
      supplier_id: suppliers[index].id,
      status,
      expected_on: addDate(end, 2),
      notes:
        status === "cancelled"
          ? "Supplier could not meet the requested delivery date"
          : "Next replenishment",
      generated: false,
      manually_edited: false,
      actor_id: admin.id,
      created_at: timestamp(date, 15),
    });
    for (const ingredient of stock) {
      const cfg = settings.get(ingredient.id)!,
        received = status === "partial" ? cfg.pack : 0;
      emit("purchase_order_lines", {
        id: uid("current-line:" + ingredient.id),
        purchase_order_id: poId,
        ingredient_id: ingredient.id,
        quantity: cfg.pack * 3,
        received_quantity: received,
        unit_cost: ingredient.cost_per_unit,
      });
      if (received) {
        const receiptId = uid("current-receipt:" + index);
        if (!tables.goods_receipts.some((r) => r.id === receiptId))
          emit("goods_receipts", {
            id: receiptId,
            purchase_order_id: poId,
            reference: `DR-${end.replaceAll("-", "")}-P${index}`,
            idempotency_key: uid("current-receipt-key:" + index),
            fingerprint: uid("current-receipt-fingerprint:" + index),
            actor_id: admin.id,
            created_at: finalAt,
          });
        const batch = emit("stock_batches", {
          id: uid("partial-batch:" + ingredient.id),
          ingredient_id: ingredient.id,
          batch_code: `PART-${end.replaceAll("-", "")}-${index}`,
          quantity: received,
          reserved: 0,
          unit_cost: ingredient.cost_per_unit,
          expires_on: cfg.shelf ? addDate(end, cfg.shelf) : null,
          received_at: finalAt,
          receipt_id: receiptId,
        });
        available.set(
          ingredient.id,
          quantity((available.get(ingredient.id) ?? 0) + received),
        );
        movement(
          ingredient.id,
          batch,
          received,
          "receipt",
          `DR-${end.replaceAll("-", "")}-P${index}`,
          finalAt,
          { source_id: receiptId },
        );
      }
    }
  }
  for (let date = start; date <= end; date = addDate(date, 1)) {
    const day = Number(date.slice(8)),
      month = date.slice(0, 7),
      types: Record<number, [string, string, number]> = {
        1: ["rent", "Unit lease", 9000],
        5: [
          "utilities",
          "Electricity and water",
          3600 + Math.floor(rand() * 900),
        ],
        10: ["utilities", "Internet service", 1399],
        15: ["wages", "Team wages - first period", 11000],
        20: ["transport", "Supply transport", 750 + Math.floor(rand() * 400)],
        28: ["wages", "Team wages - second period", 11000],
      };
    const expense = types[day];
    if (expense && Date.parse(timestamp(date, 12)) <= now.getTime())
      emit("finance_expenses", {
        id: uid("expense:" + date),
        business_date: date,
        request_key: uid("expense-key:" + date),
        request_fingerprint: uid("expense-fingerprint:" + date),
        category: expense[0],
        description: `${expense[1]} · ${month}`,
        gross_centavos: expense[2] * 100,
        input_vat_centavos: 0,
        input_vat_reviewed: false,
        document_reference: null,
        document_id: null,
        actor_id: admin.id,
        created_at: timestamp(date, 12),
      });
  }
  const counts = Object.fromEntries(
    Object.entries(tables).map(([table, rows]) => [table, rows.length]),
  );
  const manifest: Row = {
    version: 1,
    seed,
    from: start,
    to: end,
    days,
    counts,
    actor_id: admin.id,
    synthetic: true,
    menuPrices: "Current configured VAT-inclusive prices",
    supplierReferenceBasis:
      "Fictional supply businesses informed by Philippine coffee, dairy, bakery and packaging categories; no real supplier relationship claimed",
    providerTransactionsCreated: false,
    officialInvoicesCreated: false,
    existingRecordsPreserved: true,
    operatorPhysicalStockVerified: false,
  };
  return {
    id,
    tables,
    updates,
    manifest,
    configurations: [...configs.values()],
  };
}
