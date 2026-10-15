import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateCentavos,
  calculateFinancials,
  estimateOsdIncomeTax,
  graduatedIncomeTax,
  mayaAmountDetails,
} from "../packages/shared/src/finance/calculations.ts";
const item = {
  menu_item_id: "coffee",
  name: "Coffee",
  price: 112,
  quantity: 1,
};
test("VAT-inclusive prices reconcile without changing customer prices or charging VAT twice", () => {
  const q = calculateFinancials({ items: [item] });
  assert.equal(q.total, 11200);
  assert.equal(q.vat, 1200);
  assert.equal(q.net_sales, 10000);
  assert.deepEqual(mayaAmountDetails(q), {
    subtotal: 100,
    discount: 0,
    shippingFee: 0,
    serviceCharge: 0,
    tax: 12,
  });
  const small = calculateFinancials({ items: [{ ...item, price: 85 }] });
  assert.equal(small.net_sales, 7589);
  assert.equal(small.vat, 911);
});
test("verified personal portions receive one statutory benefit and exclude courier fees", () => {
  const q = calculateFinancials({
    items: [{ ...item, quantity: 2 }],
    eligibleQuantities: [1],
    deliveryFee: 50,
  });
  assert.equal(q.vat_relief, 1200);
  assert.equal(q.discount, 2000);
  assert.equal(q.exempt_sales, 8000);
  assert.equal(q.taxable_sales, 10000);
  assert.equal(q.vat, 1200);
  assert.equal(q.total, 24200);
  assert.equal(q.delivery_tax, null);
  assert.equal(q.osd_gross_sales, 20000);
  assert.equal(
    calculateFinancials({ items: [item], eligibleQuantities: [1] }).total,
    8000,
  );
});
test("configured delivery VAT is included once in Maya totals and OSD gross income", () => {
  const q = calculateFinancials({
    items: [item],
    deliveryFee: 112,
    deliveryTaxTreatment: "vat_inclusive",
  });
  assert.equal(q.delivery_tax, 1200);
  assert.equal(q.total, 22400);
  assert.equal(q.osd_gross_sales, 20000);
  assert.deepEqual(mayaAmountDetails(q), {
    subtotal: 100,
    discount: 0,
    shippingFee: 100,
    serviceCharge: 0,
    tax: 24,
  });
  const pass = calculateFinancials({
    items: [item],
    deliveryFee: 112,
    deliveryTaxTreatment: "pass_through",
  });
  assert.equal(pass.osd_gross_sales, 10000);
  assert.equal(pass.delivery_tax, 0);
  assert.equal(mayaAmountDetails(pass).shippingFee, 112);
});
test("a more favorable promotion replaces the statutory discount, retains VAT relief and never stacks it", () => {
  const q = calculateFinancials({
    items: [item],
    eligibleQuantities: [1],
    promotion: { kind: "percentage", value: 30 },
  });
  assert.equal(q.mode, "promotion");
  assert.equal(q.total, 7000);
  assert.equal(q.discount, 3000);
  assert.equal(q.vat, 0);
  const statutory = calculateFinancials({
    items: [item],
    eligibleQuantities: [1],
    promotion: { kind: "percentage", value: 10 },
    points: 1,
  });
  assert.equal(statutory.total, 8000);
  assert.equal(statutory.points_used, 0);
});
test("centavo allocation preserves totals, scopes selected-item vouchers and validates personal quantities", () => {
  assert.deepEqual(allocateCentavos(1, [1, 1, 1]), [1, 0, 0]);
  for (let amount = 0; amount <= 600; amount++)
    assert.equal(
      allocateCentavos(amount, [100, 200, 300]).reduce((a, b) => a + b, 0),
      amount,
    );
  const q = calculateFinancials({
    items: [item, { ...item, menu_item_id: "cake" }],
    promotion: { kind: "fixed", value: 5, itemIds: ["cake"] },
  });
  assert.equal(q.lines[0].discount, 0);
  assert.equal(q.lines[1].discount, 500);
  assert.throws(() =>
    calculateFinancials({ items: [item], eligibleQuantities: [2] }),
  );
  assert.throws(() => calculateFinancials({ items: [item], points: 2000 }));
  assert.throws(() =>
    calculateFinancials({ items: [{ ...item, quantity: 1.5 }] }),
  );
  assert.throws(() => allocateCentavos(2, [1]));
});
test("OSD uses gross sales without deducting operating costs again; graduated boundaries and credits remain exact", () => {
  const expected = [
    [250000, 0],
    [400000, 22500],
    [800000, 102500],
    [2000000, 402500],
    [8000000, 2202500],
  ];
  for (const [income, tax] of expected)
    assert.equal(graduatedIncomeTax(income * 100), tax * 100);
  assert.equal(graduatedIncomeTax(800000001), 220250000);
  const q = estimateOsdIncomeTax(1000000, 0, 10000);
  assert.equal(q.osd, 40000000);
  assert.equal(q.taxable_income, 60000000);
  assert.equal(q.tax_due, 6250000);
  assert.equal(q.balance, 5250000);
});
