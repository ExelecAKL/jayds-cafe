import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  recipeStandards,
  newRecipeIngredients,
} from "../scripts/recipes/standards.ts";

test("all 55 recipes have realistic components, matched sizes, exact packaging and protected accepted requirements", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
    const fixture = JSON.parse(
      readFileSync("tests/fixtures/menu-recipe-baseline.json", "utf8"),
    ) as Record<string, Record<string, unknown>[]>;
    for (const table of [
      "categories",
      "ingredients",
      "menu_items",
      "menu_item_ingredients",
      "item_variants",
      "variant_ingredients",
    ]) {
      const rows = fixture[table];
      const cols = Object.keys(rows[0]).filter(
        (k) => k !== "size_multipliers" || table !== "variant_ingredients",
      );
      await db.query(
        `INSERT INTO ${table}(${cols.join(",")}) SELECT ${cols.map((c) => "r." + c).join(",")} FROM jsonb_populate_recordset(NULL::${table},$1::jsonb) r`,
        [JSON.stringify(rows)],
      );
    }
    await db.exec(
      "UPDATE ingredients SET current_stock=100000,cost_per_unit=1; SELECT set_config('request.jwt.claim.role','service_role',false)",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261002000100_inventory_operations.sql",
        "utf8",
      ),
    );
    const oldOrder = (
      await db.query<{ id: string }>(
        "INSERT INTO orders(total,subtotal) VALUES(150,150) RETURNING id",
      )
    ).rows[0].id;
    const beans = (
      await db.query<{ id: string }>(
        "SELECT id FROM ingredients WHERE name='Espresso Beans'",
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO order_stock_requirements(order_id,ingredient_id,quantity,unit_cost) VALUES($1,$2,36,1)",
      [oldOrder, beans],
    );
    const before = await db.query(
      "SELECT * FROM order_stock_requirements ORDER BY ingredient_id",
    );
    const oldStock = await db.query(
      "SELECT id,quantity,reserved,unit_cost FROM stock_batches ORDER BY id",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261018000100_recipe_realism.sql",
        "utf8",
      ),
    );
    assert.deepEqual(
      (
        await db.query(
          "SELECT * FROM order_stock_requirements ORDER BY ingredient_id",
        )
      ).rows,
      before.rows,
    );
    assert.deepEqual(
      (
        await db.query(
          "SELECT id,quantity,reserved,unit_cost FROM stock_batches ORDER BY id",
        )
      ).rows,
      oldStock.rows,
    );
    assert.equal(recipeStandards.length, 55);
    for (const standard of recipeStandards) {
      const rows = (
        await db.query<{
          name: string;
          quantity_used: string;
          size_multipliers: Record<string, number>;
        }>(
          `SELECT i.name,r.quantity_used,r.size_multipliers FROM menu_item_ingredients r JOIN ingredients i ON i.id=r.ingredient_id WHERE r.menu_item_id=$1 ORDER BY i.name`,
          [standard.id],
        )
      ).rows;
      assert.deepEqual(
        rows.map((r) => r.name),
        standard.portions.map((r) => r.ingredient).sort(),
        standard.name,
      );
      const variants = (
        await db.query<{
          variant_group: string;
          label: string;
          is_default: boolean;
        }>("SELECT * FROM item_variants WHERE menu_item_id=$1", [standard.id])
      ).rows;
      if (standard.icedOnly)
        assert.ok(
          !variants.some(
            (v) => v.variant_group === "temperature" && v.label === "Hot",
          ),
          standard.name + " iced-only",
        );
      const sizes = variants.filter((v) => v.variant_group === "size");
      for (const r of rows)
        for (const size of sizes)
          if (
            Object.keys(r.size_multipliers).length &&
            !(r.name === "Ice" && size.label === "Hot 12oz")
          )
            assert.ok(
              size.label in r.size_multipliers,
              `${standard.name}: ${r.name} missing ${size.label}`,
            );
      const defaults = variants.filter(
        (v) => v.is_default && v.variant_group !== "add_on",
      );
      for (const size of sizes.length
        ? sizes
        : [{ label: "Regular", variant_group: "size", is_default: true }]) {
        const hot = size.label === "Hot 12oz";
        const selected = defaults
          .filter((v) => !["size", "temperature"].includes(v.variant_group))
          .concat([
            { variant_group: "size", label: size.label, is_default: true },
            {
              variant_group: "temperature",
              label: hot ? "Hot" : "Iced",
              is_default: true,
            },
          ]);
        const req = await requirements(standard.id, selected);
        if (
          [
            "Espresso",
            "Signature Drinks",
            "Frappes",
            "Milk Teas",
            "Refreshers",
          ].includes(standard.category)
        ) {
          assert.equal(
            [...req]
              .filter(([n]) => n.startsWith("Cup "))
              .reduce((sum, [, n]) => sum + n, 0),
            1,
            standard.name + " one cup",
          );
          assert.equal(
            [...req]
              .filter(([n]) => n === "Lid" || n.startsWith("Lid ("))
              .reduce((sum, [, n]) => sum + n, 0),
            1,
            standard.name + " one lid",
          );
          assert.equal(
            req.get("Straw") || 0,
            hot ? 0 : 1,
            standard.name + " straw",
          );
          if (hot)
            assert.equal(
              req.get("Ice"),
              undefined,
              standard.name + " hot has no ice",
            );
          if (size.label === "Large 22oz" && req.has("Whole Milk"))
            assert.ok(
              req.get("Whole Milk")! >
                standard.portions.find((p) => p.ingredient === "Whole Milk")!
                  .quantity,
              standard.name + " large scales milk",
            );
        }
      }
    }
    for (const ingredient of newRecipeIngredients) {
      const r = (
        await db.query<{ current_stock: string }>(
          "SELECT current_stock FROM ingredients WHERE name=$1",
          [ingredient.name],
        )
      ).rows[0];
      assert.equal(
        Number(r.current_stock),
        0,
        "New ingredients have no invented count",
      );
    }
    const latte = recipeStandards.find((s) => s.name === "Coffee Latte")!.id;
    const oat = await requirements(latte, [
      { variant_group: "size", label: "Large 22oz" },
      { variant_group: "milk_sub", label: "Oat Milk Sub" },
    ]);
    assert.equal(oat.get("Whole Milk"), undefined);
    assert.equal(oat.get("Oat Milk"), 280);
    const vanilla = recipeStandards.find((s) => s.name === "Vanilla Latte")!.id;
    assert.equal(
      (
        await requirements(vanilla, [
          { variant_group: "size", label: "Medium 16oz" },
          { variant_group: "sugar_level", label: "Less Sweet" },
        ])
      ).get("Vanilla Syrup"),
      12.5,
    );
    const frappe = recipeStandards.find((s) => s.name === "Mocha Frappe")!.id;
    const topped = await requirements(frappe, [
      { variant_group: "size", label: "Medium 16oz" },
      { variant_group: "add_on", label: "Whipped Cream" },
    ]);
    assert.equal(topped.get("Lid (flat)"), undefined);
    assert.equal(topped.get("Lid (dome)"), 1);
    await db.exec(
      "UPDATE inventory_settings SET enforcement_enabled=true; UPDATE stock_batches SET quantity=0 WHERE ingredient_id IN(SELECT id FROM ingredients WHERE name='Ice')",
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "SELECT inv_any_configuration_available($1) ok",
          [latte],
        )
      ).rows[0].ok,
      true,
      "Hot latte stays available without ice",
    );
    await db.exec(
      "UPDATE stock_batches SET quantity=0 WHERE ingredient_id IN(SELECT id FROM ingredients WHERE name IN('Cheese Seasoning','BBQ Seasoning','Sour Cream Seasoning'))",
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "SELECT inv_any_configuration_available($1) ok",
          [recipeStandards.find((s) => s.name === "Flavored Fries")!.id],
        )
      ).rows[0].ok,
      false,
      "No available flavor must not silently become unseasoned fries",
    );
    async function requirements(id: string, variants: unknown[]) {
      return new Map(
        (
          await db.query<{ name: string; quantity: string }>(
            "SELECT i.name,r.quantity FROM inv_requirements($1,$2::jsonb,1) r JOIN ingredients i ON i.id=r.ingredient_id",
            [id, JSON.stringify(variants)],
          )
        ).rows.map((r) => [r.name, Number(r.quantity)]),
      );
    }
  } finally {
    await db.close();
  }
});
