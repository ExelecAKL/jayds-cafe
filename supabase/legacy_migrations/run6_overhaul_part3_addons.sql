-- ============================================================
-- Migration: Personalize Add-On Variants per Menu Item
-- Run AFTER run6_overhaul_part2.sql
-- ============================================================
-- 
-- Current state: sugar_level + add_on variants were mass-inserted
-- for ALL items in Espresso, Signature, Frappes, Milk Teas categories.
-- This migration removes inappropriate ones.
--
-- Rules:
--   • Americano: NO add-ons (it's just espresso + water)
--   • Espresso lattes: All add-ons EXCEPT Nata de Coco (bad texture w/ espresso)
--   • Signature coffee: All add-ons OK
--   • Signature non-coffee (Cocoa Lava, Matcha, Strawberry Milk, Nom Yen): 
--       YES: Tapioca Pearls, Nata de Coco, Whipped Cream
--       NO: Coffee Jelly, Extra Shot, Chocolate Drizzle (already has chocolate)
--   • Frappes: YES Whipped Cream, Chocolate Drizzle. NO Tapioca/Jelly/Nata (texture)
--   • Milk Teas: YES Tapioca Pearls, Coffee Jelly, Nata de Coco. NO Whipped Cream, Extra Shot, Choco Drizzle
--   • Refreshers: NO add-ons (fruit sodas don't mix with toppings)
--   • Croffles / Snacks: NO sugar_level, NO drink add-ons

-- ═══════════════════════════════════════════════════════════════
-- 1. AMERICANO — remove ALL add-ons (plain espresso drink)
-- ═══════════════════════════════════════════════════════════════
DELETE FROM item_variants
WHERE menu_item_id = '20000000-0000-4000-8000-000000000001'
  AND variant_group IN ('add_on','sugar_level');

-- ═══════════════════════════════════════════════════════════════
-- 2. ESPRESSO LATTES — remove Nata de Coco (bad w/ hot espresso)
-- ═══════════════════════════════════════════════════════════════
DELETE FROM item_variants
WHERE menu_item_id IN (
  '20000000-0000-4000-8000-000000000002', -- Coffee Latte
  '20000000-0000-4000-8000-000000000003', -- Spanish Latte
  '20000000-0000-4000-8000-000000000004', -- Vanilla Latte
  '20000000-0000-4000-8000-000000000005', -- French Vanilla
  '20000000-0000-4000-8000-000000000006', -- Caramel Latte
  '20000000-0000-4000-8000-000000000007', -- Hazelnut Latte
  '20000000-0000-4000-8000-000000000008', -- Macadamia Latte
  '20000000-0000-4000-8000-000000000009', -- Butterscotch Latte
  '20000000-0000-4000-8000-00000000000a', -- Aussie Latte
  '20000000-0000-4000-8000-00000000000b', -- White Mocha Latte
  '20000000-0000-4000-8000-00000000000c'  -- Cinnamon Cappuccino
)
AND variant_group = 'add_on'
AND label = 'Nata de Coco';

-- ═══════════════════════════════════════════════════════════════
-- 3. SIGNATURE NON-COFFEE — remove Coffee Jelly, Extra Shot
-- ═══════════════════════════════════════════════════════════════
DELETE FROM item_variants
WHERE menu_item_id IN (
  '30000000-0000-4000-8000-00000000000a', -- Cocoa Lava
  '30000000-0000-4000-8000-00000000000b', -- Matcha Latte
  '30000000-0000-4000-8000-00000000000c', -- Strawberry Milk
  '30000000-0000-4000-8000-00000000000d'  -- Nom Yen
)
AND variant_group = 'add_on'
AND label IN ('Coffee Jelly', 'Extra Shot');

-- Cocoa Lava: also remove Chocolate Drizzle (already has chocolate)
DELETE FROM item_variants
WHERE menu_item_id = '30000000-0000-4000-8000-00000000000a'
  AND variant_group = 'add_on'
  AND label = 'Chocolate Drizzle';

-- ═══════════════════════════════════════════════════════════════
-- 4. FRAPPES — NO Tapioca, Coffee Jelly, Nata (bad texture w/ blended ice)
-- ═══════════════════════════════════════════════════════════════
DELETE FROM item_variants
WHERE menu_item_id IN (
  '40000000-0000-4000-8000-000000000001', -- Vanilla Milkshake
  '40000000-0000-4000-8000-000000000002', -- Cookies & Cream
  '40000000-0000-4000-8000-000000000003', -- Dark Chocolate
  '40000000-0000-4000-8000-000000000004', -- Matcha Frappe
  '40000000-0000-4000-8000-000000000005', -- Strawberries & Cream
  '40000000-0000-4000-8000-000000000006', -- Caramel Frappe
  '40000000-0000-4000-8000-000000000007', -- Mocha Frappe
  '40000000-0000-4000-8000-000000000008', -- Java Chip
  '40000000-0000-4000-8000-000000000009', -- Salted Caramel Frappe
  '40000000-0000-4000-8000-00000000000a'  -- Biscoff Frappe
)
AND variant_group = 'add_on'
AND label IN ('Tapioca Pearls', 'Coffee Jelly', 'Nata de Coco');

-- Non-coffee frappes: also remove Extra Shot
DELETE FROM item_variants
WHERE menu_item_id IN (
  '40000000-0000-4000-8000-000000000001', -- Vanilla Milkshake
  '40000000-0000-4000-8000-000000000002', -- Cookies & Cream
  '40000000-0000-4000-8000-000000000003', -- Dark Chocolate
  '40000000-0000-4000-8000-000000000004', -- Matcha Frappe
  '40000000-0000-4000-8000-000000000005'  -- Strawberries & Cream
)
AND variant_group = 'add_on'
AND label = 'Extra Shot';

-- ═══════════════════════════════════════════════════════════════
-- 5. MILK TEAS — remove Whipped Cream, Extra Shot, Choco Drizzle
-- ═══════════════════════════════════════════════════════════════
DELETE FROM item_variants
WHERE menu_item_id IN (
  '50000000-0000-4000-8000-000000000001', -- Classic Milk Tea
  '50000000-0000-4000-8000-000000000002', -- Wintermelon
  '50000000-0000-4000-8000-000000000003', -- Okinawa
  '50000000-0000-4000-8000-000000000004', -- Dark Chocolate MT
  '50000000-0000-4000-8000-000000000005', -- Taro
  '50000000-0000-4000-8000-000000000006'  -- Cookies & Cream MT
)
AND variant_group = 'add_on'
AND label IN ('Whipped Cream', 'Extra Shot', 'Chocolate Drizzle');

-- ═══════════════════════════════════════════════════════════════
-- 6. REFRESHERS — remove ALL add-ons and sugar_level (fruit sodas)
-- ═══════════════════════════════════════════════════════════════
DELETE FROM item_variants
WHERE menu_item_id IN (
  '60000000-0000-4000-8000-000000000001', -- Strawberry Soda
  '60000000-0000-4000-8000-000000000002', -- Blueberry Soda
  '60000000-0000-4000-8000-000000000003', -- Green Apple Soda
  '60000000-0000-4000-8000-000000000004', -- Lychee Soda
  '60000000-0000-4000-8000-000000000005'  -- Honey Peach Soda
)
AND variant_group IN ('add_on', 'sugar_level');

-- ═══════════════════════════════════════════════════════════════
-- 7. CROFFLES + SNACKS — ensure no drink add-ons or sugar_level
-- ═══════════════════════════════════════════════════════════════
DELETE FROM item_variants
WHERE menu_item_id IN (
  '70000000-0000-4000-8000-000000000001', -- Just Croffle
  '70000000-0000-4000-8000-000000000002', -- S'mores
  '70000000-0000-4000-8000-000000000003', -- Banatella
  '70000000-0000-4000-8000-000000000004', -- Biscoff Croffle
  '70000000-0000-4000-8000-000000000005', -- Almond Nutella
  '70000000-0000-4000-8000-000000000006', -- Ham & Cheese
  '80000000-0000-4000-8000-000000000001', -- Flavored Fries
  '80000000-0000-4000-8000-000000000002', -- Nachos
  '80000000-0000-4000-8000-000000000003'  -- Chicken Pop
)
AND variant_group IN ('add_on', 'sugar_level');

-- ═══════════════════════════════════════════════════════════════
-- 8. VERIFY
-- ═══════════════════════════════════════════════════════════════
SELECT
  mi.name AS item,
  iv.variant_group,
  string_agg(iv.label, ', ' ORDER BY iv.sort_order) AS options
FROM item_variants iv
JOIN menu_items mi ON mi.id = iv.menu_item_id
WHERE iv.variant_group = 'add_on'
GROUP BY mi.name, iv.variant_group
ORDER BY mi.name;
