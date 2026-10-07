-- ============================================================
-- PART 2 of 3: Add-on Variants + Variant Ingredients + Base Recipes
-- Run this SECOND (after Part 1 succeeds)
-- ============================================================

-- 1. ADD-ON VARIANTS for all drinks
DO $addons$
DECLARE
  v_item_id uuid;
  v_is_coffee boolean;
BEGIN
  FOR v_item_id, v_is_coffee IN
    SELECT mi.id, (c.name IN ('Espresso','Signature Drinks')) AS is_coffee
    FROM menu_items mi
    JOIN categories c ON c.id = mi.category_id
    WHERE c.name IN ('Espresso','Signature Drinks','Frappes','Milk Teas')
      AND mi.is_available = true
  LOOP
    INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order)
    VALUES (v_item_id, 'add_on', 'Tapioca Pearls', 15, false, 10) ON CONFLICT DO NOTHING;

    INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order)
    VALUES (v_item_id, 'add_on', 'Coffee Jelly', 15, false, 11) ON CONFLICT DO NOTHING;

    INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order)
    VALUES (v_item_id, 'add_on', 'Nata de Coco', 15, false, 12) ON CONFLICT DO NOTHING;

    INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order)
    VALUES (v_item_id, 'add_on', 'Whipped Cream', 10, false, 13) ON CONFLICT DO NOTHING;

    INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order)
    VALUES (v_item_id, 'add_on', 'Chocolate Drizzle', 10, false, 15) ON CONFLICT DO NOTHING;

    IF v_is_coffee THEN
      INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order)
      VALUES (v_item_id, 'add_on', 'Extra Shot', 20, false, 14) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $addons$;

-- 2. VARIANT -> INGREDIENT MAPPINGS
DO $vmap$
DECLARE
  v_ing uuid;
BEGIN
  -- Add-ons
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Tapioca Pearls (raw)';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Tapioca Pearls', 'add_on', v_ing, 50) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Coffee Jelly';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Coffee Jelly', 'add_on', v_ing, 40) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Nata de Coco';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Nata de Coco', 'add_on', v_ing, 40) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Whipped Cream';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Whipped Cream', 'add_on', v_ing, 30) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Espresso Beans';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Extra Shot', 'add_on', v_ing, 18) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Chocolate Powder';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Chocolate Drizzle', 'add_on', v_ing, 10) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Simple Syrup';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Extra Sweet', 'sugar_level', v_ing, 15) ON CONFLICT DO NOTHING;

  -- Size -> packaging
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Cup 12oz (Hot)';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Hot 12oz', 'size', v_ing, 1) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Cup 16oz';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Medium 16oz', 'size', v_ing, 1) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Cup 22oz';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Large 22oz', 'size', v_ing, 1) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Lid (flat)';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Medium 16oz', 'size', v_ing, 1) ON CONFLICT DO NOTHING;
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Large 22oz', 'size', v_ing, 1) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Straw';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Medium 16oz', 'size', v_ing, 1) ON CONFLICT DO NOTHING;
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Large 22oz', 'size', v_ing, 1) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Lid (dome)';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used, replaces_ingredient_id)
  VALUES ('Whipped Cream', 'add_on', v_ing, 1, (SELECT id FROM ingredients WHERE name = 'Lid (flat)'))
  ON CONFLICT DO NOTHING;
END $vmap$;

-- 3. BASE RECIPES: Espresso category
DO $esp$
DECLARE
  v_item uuid;
  v_ing uuid;
  v_sz jsonb;
BEGIN
  v_sz := '{"Hot 12oz":0.7,"Medium 16oz":1,"Large 22oz":1.5}';

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Espresso Beans';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000001' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 18, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Whole Milk';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000001' AND name != 'Americano' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 200, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Ice';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000001' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 150, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  -- Specific syrups
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Vanilla Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000004', v_ing, 30, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'French Vanilla Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000005', v_ing, 30, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Caramel Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000006', v_ing, 30, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Hazelnut Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000007', v_ing, 30, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Macadamia Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000008', v_ing, 30, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Butterscotch Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000009', v_ing, 30, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'White Mocha Sauce';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-00000000000b', v_ing, 25, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Cinnamon Powder';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-00000000000c', v_ing, 3, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Condensed Milk';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000003', v_ing, 40, v_sz) ON CONFLICT DO NOTHING;
END $esp$;

-- 4. BASE RECIPES: Signature Drinks
DO $sig$
DECLARE
  v_item uuid;
  v_ing uuid;
  v_sz jsonb;
BEGIN
  v_sz := '{"Hot 12oz":0.7,"Medium 16oz":1,"Large 22oz":1.5}';

  -- Espresso for coffee-based signatures
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Espresso Beans';
  FOR v_item IN SELECT id FROM menu_items WHERE id IN (
    'e2000000-0000-4000-a000-000000000001','e2000000-0000-4000-a000-000000000002',
    'e2000000-0000-4000-a000-000000000003','e2000000-0000-4000-a000-000000000004',
    'e2000000-0000-4000-a000-000000000005','e2000000-0000-4000-a000-000000000006',
    'e2000000-0000-4000-a000-000000000007','e2000000-0000-4000-a000-000000000008',
    'e2000000-0000-4000-a000-000000000009'
  ) LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 18, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  -- Milk + ice for all signatures
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Whole Milk';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000002' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 200, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Ice';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000002' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 150, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  -- Specific syrups/sauces
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Caramel Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-000000000001', v_ing, 30, v_sz) ON CONFLICT DO NOTHING;
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-000000000002', v_ing, 25, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Salted Caramel Sauce';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-000000000003', v_ing, 30, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Chocolate Powder';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-000000000002', v_ing, 20, v_sz) ON CONFLICT DO NOTHING;
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-000000000004', v_ing, 25, v_sz) ON CONFLICT DO NOTHING;
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-000000000008', v_ing, 20, v_sz) ON CONFLICT DO NOTHING;
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-00000000000a', v_ing, 30, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Hazelnut Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-000000000005', v_ing, 30, v_sz) ON CONFLICT DO NOTHING;
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-000000000008', v_ing, 25, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Condensed Milk';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-000000000006', v_ing, 40, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Evaporated Milk';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-000000000006', v_ing, 30, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Milo Powder';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-000000000007', v_ing, 25, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Biscoff Spread';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-000000000009', v_ing, 20, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Matcha Powder';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-00000000000b', v_ing, 5, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Strawberry Puree';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-00000000000c', v_ing, 50, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Nom Yen Mix';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e2000000-0000-4000-a000-00000000000d', v_ing, 15, v_sz) ON CONFLICT DO NOTHING;
END $sig$;

-- 5. BASE RECIPES: Milk Teas
DO $mt$
DECLARE
  v_item uuid;
  v_ing uuid;
  v_sz jsonb;
BEGIN
  v_sz := '{"Medium 16oz":1,"Large 22oz":1.5}';

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Black Tea Bags';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000004' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 1, '{"Medium 16oz":1,"Large 22oz":1}') ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Whole Milk';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000004' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 180, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Ice';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000004' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 150, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Wintermelon Powder';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e4000000-0000-4000-a000-000000000002', v_ing, 15, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Brown Sugar Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e4000000-0000-4000-a000-000000000003', v_ing, 30, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Chocolate Powder';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e4000000-0000-4000-a000-000000000004', v_ing, 20, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Taro Powder';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e4000000-0000-4000-a000-000000000005', v_ing, 15, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Cookies Crumble';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e4000000-0000-4000-a000-000000000006', v_ing, 15, v_sz) ON CONFLICT DO NOTHING;
END $mt$;

-- 6. BASE RECIPES: Refreshers
DO $ref$
DECLARE
  v_item uuid;
  v_ing uuid;
  v_sz jsonb;
BEGIN
  v_sz := '{"Medium 16oz":1,"Large 22oz":1.5}';

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Soda Water';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000005' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 250, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Ice';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000005' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 150, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Strawberry Puree';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e5000000-0000-4000-a000-000000000001', v_ing, 50, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Blueberry Puree';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e5000000-0000-4000-a000-000000000002', v_ing, 50, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Green Apple Puree';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e5000000-0000-4000-a000-000000000003', v_ing, 50, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Lychee Puree';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e5000000-0000-4000-a000-000000000004', v_ing, 50, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Honey Peach Puree';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e5000000-0000-4000-a000-000000000005', v_ing, 50, v_sz) ON CONFLICT DO NOTHING;
END $ref$;

-- 7. BASE RECIPES: Croffles + Snacks
DO $food$
DECLARE
  v_item uuid;
  v_ing uuid;
  v_sz jsonb;
BEGIN
  v_sz := '{"Regular":1}';

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Croffle Dough';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000006' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 1, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Powdered Sugar';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e6000000-0000-4000-a000-000000000001', v_ing, 5, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Marshmallows';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e6000000-0000-4000-a000-000000000002', v_ing, 20, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Chocolate Powder';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e6000000-0000-4000-a000-000000000002', v_ing, 10, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Banana';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e6000000-0000-4000-a000-000000000003', v_ing, 1, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Nutella';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e6000000-0000-4000-a000-000000000003', v_ing, 15, v_sz) ON CONFLICT DO NOTHING;
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e6000000-0000-4000-a000-000000000005', v_ing, 15, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Biscoff Spread';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e6000000-0000-4000-a000-000000000004', v_ing, 20, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Almonds (sliced)';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e6000000-0000-4000-a000-000000000005', v_ing, 10, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Ham Slice';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e6000000-0000-4000-a000-000000000006', v_ing, 2, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Cheese Slice';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e6000000-0000-4000-a000-000000000006', v_ing, 2, v_sz) ON CONFLICT DO NOTHING;

  -- Fries
  SELECT id INTO v_ing FROM ingredients WHERE name = 'French Fries (frozen)';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e7000000-0000-4000-a000-000000000001', v_ing, 150, v_sz) ON CONFLICT DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Frying Oil';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e7000000-0000-4000-a000-000000000001', v_ing, 50, v_sz) ON CONFLICT DO NOTHING;
END $food$;

SELECT 'PART 2 COMPLETE: ' || (SELECT count(*) FROM menu_item_ingredients) || ' base recipes, ' ||
  (SELECT count(*) FROM variant_ingredients) || ' variant maps, ' ||
  (SELECT count(*) FROM item_variants WHERE variant_group = 'add_on') || ' add-on variants' AS status;
