import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  resolveMenuDefaults,
  validateMenuDefaults,
  optionKey,
} from "../packages/shared/src/menu/options.ts";
const milk = [
  {
    variant_group: "milk_sub",
    label: "Whole Milk",
    price_modifier: 0,
    is_default: true,
  },
  { variant_group: "milk_sub", label: "Oat Milk Sub", price_modifier: 30 },
];
test("milk defaults never force a paid substitute, including unavailable defaults and legacy groups", () => {
  assert.equal(resolveMenuDefaults(milk)[0].label, "Whole Milk");
  assert.deepEqual(
    resolveMenuDefaults(
      milk.map((v) => ({ ...v, is_available: v.label !== "Whole Milk" })),
    ),
    [],
  );
  assert.deepEqual(resolveMenuDefaults(milk.slice(1)), []);
  assert.equal(resolveMenuDefaults(milk, [milk[1]])[0].label, "Oat Milk Sub");
});
test("extra shots are opt-in, retain independent add-ons, and use compatible sizes", () => {
  const shot = {
    variant_group: "add_on",
    label: "Extra Shot",
    price_modifier: 20,
  };
  const syrup = { ...shot, label: "Syrup" };
  assert.deepEqual(resolveMenuDefaults([shot, syrup]), []);
  assert.equal(resolveMenuDefaults([shot, syrup], [shot, syrup]).length, 2);
  assert.notEqual(optionKey(shot), optionKey(syrup));
  const options = [
    {
      variant_group: "temperature",
      label: "Hot",
      price_modifier: 0,
      is_default: true,
    },
    {
      variant_group: "size",
      label: "16oz",
      price_modifier: 0,
      is_default: true,
    },
    { variant_group: "size", label: "12oz", price_modifier: 0 },
  ];
  assert.equal(
    resolveMenuDefaults(options).find((v) => v.variant_group === "size")?.label,
    "12oz",
  );
});
test("Admin publication rejects missing or paid milk defaults and duplicate options", () => {
  assert.equal(validateMenuDefaults(milk), null);
  assert.match(validateMenuDefaults(milk.slice(1))!, /default/);
  assert.match(
    validateMenuDefaults(
      milk.map((v) => ({ ...v, is_default: v.label !== "Whole Milk" })),
    )!,
    /Whole Milk/,
  );
  assert.match(validateMenuDefaults([...milk, milk[0]])!, /unique/);
});
test("forward catalog migration corrects nine milk groups and recipes without doubling milk or changing stored orders", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
    await db.exec(
      readFileSync(
        "supabase/migrations/20261002000100_inventory_operations.sql",
        "utf8",
      ),
    );
    await db.exec(
      "SELECT set_config('request.jwt.claim.role','service_role',false)",
    );
    const names = [
      "Coffee Latte",
      "Spanish Latte",
      "Vanilla Latte",
      "Caramel Latte",
      "Aussie Latte",
      "Hazelnut Latte",
      "Macadamia Latte",
      "Butterscotch Latte",
      "White Mocha Latte",
      "Americano",
      "Matcha Latte",
    ];
    for (const name of names)
      await db.query("INSERT INTO menu_items(name,price) VALUES($1,112)", [
        name,
      ]);
    await db.exec(`INSERT INTO ingredients(name,unit,current_stock) VALUES('Whole Milk','ml',10000),('Espresso Beans','g',10000);
   INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used) SELECT m.id,i.id,CASE WHEN i.name='Whole Milk' THEN 200 ELSE 18 END FROM menu_items m CROSS JOIN ingredients i;
   INSERT INTO item_variants(menu_item_id,variant_group,label,price_modifier) SELECT id,'milk_sub','Oat Milk Sub',30 FROM menu_items WHERE name NOT IN('Americano','Matcha Latte');
   INSERT INTO orders(subtotal,total,discount) VALUES(112,112,0);
   INSERT INTO order_items(order_id,menu_item_id,name,price,quantity,subtotal,variants) SELECT o.id,m.id,'Original recipe',112,1,112,'[]' FROM orders o CROSS JOIN menu_items m WHERE m.name='Americano';`);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261013000300_menu_defaults_recipes.sql",
        "utf8",
      ),
    );
    const defaults = await db.query<{ label: string; price_modifier: number }>(
      "SELECT * FROM item_variants WHERE is_default",
    );
    assert.equal(defaults.rows.length, 9);
    assert.ok(
      defaults.rows.every(
        (v) => v.label === "Whole Milk" && Number(v.price_modifier) === 0,
      ),
    );
    const recipes = await db.query<{
      name: string;
      ingredient: string;
      quantity: number;
    }>(
      "SELECT m.name,i.name ingredient,r.quantity_used quantity FROM menu_item_ingredients r JOIN menu_items m ON m.id=r.menu_item_id JOIN ingredients i ON i.id=r.ingredient_id WHERE m.name IN('Americano','Matcha Latte')",
    );
    assert.deepEqual(
      recipes.rows.map((v) => `${v.name}:${v.ingredient}`).sort(),
      ["Americano:Espresso Beans", "Matcha Latte:Whole Milk"],
    );
    const amount = await db.query<{ quantity: number }>(
      `SELECT r.quantity FROM menu_items m CROSS JOIN LATERAL inv_requirements(m.id,'[{"variant_group":"milk_sub","label":"Whole Milk","price_modifier":0}]',2) r JOIN ingredients i ON i.id=r.ingredient_id WHERE m.name='Coffee Latte' AND i.name='Whole Milk'`,
    );
    assert.equal(Number(amount.rows[0].quantity), 400);
    assert.equal(
      (await db.query<{ name: string }>("SELECT name FROM order_items")).rows[0]
        .name,
      "Original recipe",
    );
    const catalog = await db.query<{
      catalog: { menuItems: { name: string; included_milk: string | null }[] };
    }>("SELECT get_published_catalog() catalog");
    assert.equal(
      catalog.rows[0].catalog.menuItems.find((v) => v.name === "Americano")
        ?.included_milk,
      null,
    );
    assert.equal(
      catalog.rows[0].catalog.menuItems.find((v) => v.name === "Matcha Latte")
        ?.included_milk,
      "Whole Milk",
    );
  } finally {
    await db.close();
  }
});
