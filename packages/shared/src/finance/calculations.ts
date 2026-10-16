/** Financial snapshots are expressed in integer PHP centavos, never floating-point totals. */
export interface FinancialItem {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
}
export interface Promotion {
  kind: "fixed" | "percentage";
  value: number;
  cap?: number | null;
  itemIds?: string[];
}
export interface FinancialLine {
  index: number;
  menu_item_id: string;
  name: string;
  quantity: number;
  eligible_quantity: number;
  gross: number;
  vat_relief: number;
  discount: number;
  taxable_sales: number;
  exempt_sales: number;
  vat: number;
  total: number;
}
export interface FinancialBreakdown {
  version: 1;
  currency: "PHP";
  lines: FinancialLine[];
  gross: number;
  vat_relief: number;
  discount: number;
  savings: number;
  taxable_sales: number;
  exempt_sales: number;
  vat: number;
  net_sales: number;
  osd_gross_sales: number;
  delivery: number;
  delivery_tax: number | null;
  delivery_tax_treatment?: "pending" | "pass_through" | "vat_inclusive";
  total: number;
  mode: "standard" | "promotion";
  points_used: number;
}
export function centavos(value: number): number {
  const cents = Math.round((Number(value) + Number.EPSILON) * 100);
  if (
    !Number.isFinite(Number(value)) ||
    !Number.isSafeInteger(cents) ||
    cents < 0
  )
    throw new Error("Enter a valid nonnegative PHP amount.");
  return cents;
}
export const pesosFromCentavos = (cents: number) => cents / 100;
/** Largest-remainder allocation is deterministic and preserves every centavo. */
export function allocateCentavos(amount: number, weights: number[]): number[] {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    weights.some((v) => !Number.isSafeInteger(v) || v < 0)
  )
    throw new Error("Invalid discount allocation.");
  const total = weights.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(total) || amount > total)
    throw new Error("Discount exceeds its eligible amount.");
  if (!total) return weights.map(() => 0);
  const parts = weights.map((weight, index) => {
    const numerator = BigInt(amount) * BigInt(weight);
    return {
      index,
      amount: Number(numerator / BigInt(total)),
      remainder: numerator % BigInt(total),
    };
  });
  let remaining = amount - parts.reduce((sum, p) => sum + p.amount, 0);
  const ranked = [...parts].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const part of ranked) {
    if (!remaining) break;
    part.amount++;
    remaining--;
  }
  return parts.map((p) => p.amount);
}
const netOfVat = (gross: number) =>
  Number((BigInt(gross) * BigInt(100) + BigInt(56)) / BigInt(112));
function promotionalAmount(promotion: Promotion | undefined, base: number) {
  if (!promotion) return 0;
  const requested =
    promotion.kind === "percentage"
      ? Math.round((base * promotion.value) / 100)
      : centavos(promotion.value);
  if (!Number.isFinite(requested) || requested < 0)
    throw new Error("Invalid promotion.");
  return Math.min(
    base,
    requested,
    promotion.cap && promotion.cap > 0 ? centavos(promotion.cap) : base,
  );
}
export function calculateFinancials(input: {
  items: FinancialItem[];
  promotion?: Promotion;
  points?: number;
  deliveryFee?: number;
  deliveryTaxTreatment?: "pending" | "pass_through" | "vat_inclusive";
}): FinancialBreakdown {
  if (!input.items.length || input.items.length > 200)
    throw new Error("Add items before requesting a quote.");
  // Reject stale callers instead of silently granting or ignoring removed benefits.
  if ("eligibleQuantities" in input)
    throw new Error("Personal-benefit quotes are unavailable in this release.");
  const bases = input.items.map((item, index) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1)
      throw new Error("Invalid item quantity.");
    const unit = centavos(item.price),
      gross = unit * item.quantity;
    if (!Number.isSafeInteger(gross))
      throw new Error("Order amount is too large.");
    return {
      item,
      index,
      gross,
    };
  });
  const points = input.points ?? 0;
  if (!Number.isSafeInteger(points) || points < 0)
    throw new Error("Invalid points amount.");
  const discountedBases = bases.map((b) => b.gross);
  const promoWeights = bases.map((b, i) =>
    !input.promotion?.itemIds?.length ||
    input.promotion.itemIds.includes(b.item.menu_item_id)
      ? discountedBases[i]
      : 0,
  );
  const promotion = promotionalAmount(
    input.promotion,
    promoWeights.reduce((a, b) => a + b, 0),
  );
  const promoParts = allocateCentavos(promotion, promoWeights);
  const pointsCents = Math.min(
    points * 10,
    discountedBases.reduce((a, b) => a + b, 0) - promotion,
  );
  if (!Number.isSafeInteger(pointsCents) || pointsCents !== points * 10)
    throw new Error("Points exceed the payable item amount.");
  const pointParts = allocateCentavos(
    pointsCents,
    discountedBases.map((b, i) => b - promoParts[i]),
  );
  const discounts = promoParts.map((v, i) => v + pointParts[i]);
  const lines = bases.map((b, i): FinancialLine => {
    const taxableAfter = b.gross - discounts[i],
      taxableSales = netOfVat(taxableAfter);
    return {
      index: i,
      menu_item_id: b.item.menu_item_id,
      name: b.item.name,
      quantity: b.item.quantity,
      eligible_quantity: 0,
      gross: b.gross,
      vat_relief: 0,
      discount: discounts[i],
      taxable_sales: taxableSales,
      exempt_sales: 0,
      vat: taxableAfter - taxableSales,
      total: taxableAfter,
    };
  });
  const sum = (
    key:
      | "gross"
      | "vat_relief"
      | "discount"
      | "taxable_sales"
      | "exempt_sales"
      | "vat"
      | "total",
  ) => {
    const amount = lines.reduce((n, line) => n + line[key], 0);
    if (!Number.isSafeInteger(amount))
      throw new Error("Order amount is too large.");
    return amount;
  };
  const delivery = centavos(input.deliveryFee ?? 0);
  const deliveryTax =
    input.deliveryTaxTreatment === "vat_inclusive"
      ? delivery - netOfVat(delivery)
      : input.deliveryTaxTreatment === "pass_through" || delivery === 0
        ? 0
        : null;
  return {
    version: 1,
    currency: "PHP",
    lines,
    gross: sum("gross"),
    vat_relief: sum("vat_relief"),
    discount: sum("discount"),
    savings: sum("vat_relief") + sum("discount"),
    taxable_sales: sum("taxable_sales"),
    exempt_sales: sum("exempt_sales"),
    vat: sum("vat"),
    net_sales: sum("taxable_sales") + sum("exempt_sales"),
    osd_gross_sales:
      sum("taxable_sales") +
      (input.deliveryTaxTreatment === "vat_inclusive"
        ? delivery - (deliveryTax ?? 0)
        : 0),
    delivery,
    delivery_tax: deliveryTax,
    delivery_tax_treatment: input.deliveryTaxTreatment ?? "pending",
    total: sum("total") + delivery,
    mode: promotion || pointsCents ? "promotion" : "standard",
    points_used: points,
  };
}
export function mayaAmountDetails(snapshot: FinancialBreakdown) {
  const subtotal = snapshot.net_sales + snapshot.discount;
  const tax = snapshot.vat + (snapshot.delivery_tax ?? 0);
  const shipping = snapshot.delivery - (snapshot.delivery_tax ?? 0);
  if (subtotal - snapshot.discount + shipping + tax !== snapshot.total)
    throw new Error("The payment breakdown does not reconcile.");
  return {
    subtotal: subtotal / 100,
    discount: snapshot.discount / 100,
    shippingFee: shipping / 100,
    serviceCharge: 0,
    tax: tax / 100,
  };
}
export function graduatedIncomeTax(taxableIncomeCentavos: number): number {
  if (!Number.isSafeInteger(taxableIncomeCentavos) || taxableIncomeCentavos < 0)
    throw new Error("Invalid taxable income.");
  const brackets = [
    [800000000, 220250000, 35],
    [200000000, 40250000, 30],
    [80000000, 10250000, 25],
    [40000000, 2250000, 20],
    [25000000, 0, 15],
  ];
  for (const [threshold, base, rate] of brackets)
    if (taxableIncomeCentavos > threshold)
      return (
        base + Math.round(((taxableIncomeCentavos - threshold) * rate) / 100)
      );
  return 0;
}
export function estimateOsdIncomeTax(
  grossSales: number,
  otherTaxableIncome = 0,
  credits = 0,
) {
  const sales = centavos(grossSales),
    other = centavos(otherTaxableIncome),
    paid = centavos(credits);
  const deduction = Math.round((sales * 40) / 100),
    taxable = sales - deduction + other,
    tax = graduatedIncomeTax(taxable);
  return {
    gross_sales: sales,
    osd: deduction,
    taxable_income: taxable,
    tax_due: tax,
    credits: paid,
    balance: tax - paid,
  };
}
