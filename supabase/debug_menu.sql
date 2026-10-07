-- ============================================================
-- Jayds Cafe — Database Diagnostic Query
-- Paste this entire script into the Supabase SQL Editor and run
-- ============================================================

-- 1. All categories
SELECT '--- CATEGORIES ---' AS section;
SELECT id, name, sort_order, created_at FROM categories ORDER BY sort_order, name;

-- 2. All menu items with their category
SELECT '--- MENU ITEMS ---' AS section;
SELECT
  mi.id,
  mi.name,
  c.name AS category,
  mi.price,
  mi.is_available,
  mi.prep_time_minutes,
  mi.created_at
FROM menu_items mi
LEFT JOIN categories c ON c.id = mi.category_id
ORDER BY c.sort_order, mi.name;

-- 3. Item variants
SELECT '--- ITEM VARIANTS ---' AS section;
SELECT
  iv.id,
  mi.name AS item_name,
  iv.label,
  iv.price_modifier,
  iv.variant_group
FROM item_variants iv
JOIN menu_items mi ON mi.id = iv.menu_item_id
ORDER BY mi.name, iv.variant_group, iv.label;

-- 4. Check if new tables exist yet
SELECT '--- NEW TABLES CHECK ---' AS section;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('ingredients', 'menu_item_ingredients', 'inventory_logs', 'shifts', 'loyalty_tiers')
ORDER BY table_name;

-- 5. Profile columns check (do loyalty fields exist?)
SELECT '--- PROFILE COLUMNS ---' AS section;
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 6. Order columns check
SELECT '--- ORDER COLUMNS ---' AS section;
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
ORDER BY ordinal_position;

-- 7. Counts summary
SELECT '--- COUNTS ---' AS section;
SELECT
  (SELECT count(*) FROM categories) AS categories,
  (SELECT count(*) FROM menu_items) AS menu_items,
  (SELECT count(*) FROM item_variants) AS variants,
  (SELECT count(*) FROM profiles) AS profiles,
  (SELECT count(*) FROM orders) AS orders;
