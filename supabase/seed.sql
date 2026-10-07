-- ============================================================
-- Jayds Cafe (@jaydscafe) — Seed Data
-- Run AFTER schema.sql — only INSERTs, no table recreation
-- ============================================================

-- Add tags column if not exists
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Clear previous seed data
DELETE FROM item_variants;
DELETE FROM menu_items;
DELETE FROM categories;
DELETE FROM vouchers;

-- ============================================================
-- CATEGORIES
-- ============================================================

INSERT INTO categories (id, name, description, sort_order) VALUES
  ('c0000000-0000-4000-a000-000000000001', 'Espresso', 'Arabica-Robusta blend espresso drinks', 1),
  ('c0000000-0000-4000-a000-000000000002', 'Signature Drinks', 'House specialty beverages', 2),
  ('c0000000-0000-4000-a000-000000000003', 'Frappes', 'Ice-blended cream drinks', 3),
  ('c0000000-0000-4000-a000-000000000004', 'Milk Teas', 'Classic milk tea flavors', 4),
  ('c0000000-0000-4000-a000-000000000005', 'Refreshers', 'Fruity sparkling sodas', 5),
  ('c0000000-0000-4000-a000-000000000006', 'Croffles', 'Croissant-waffle pastries', 6),
  ('c0000000-0000-4000-a000-000000000007', 'Snacks', 'Savory bites', 7);

-- ============================================================
-- MENU ITEMS — ESPRESSO
-- ============================================================

INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes, sort_order, tags) VALUES
  ('e1000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001', 'Americano', 'Rich double-shot espresso with hot water', 65.00, true, false, 3, 1, ARRAY['coffee','espresso','classic','arabica-robusta']),
  ('e1000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000001', 'Coffee Latte', 'Smooth espresso with steamed milk', 85.00, true, false, 4, 2, ARRAY['coffee','espresso','latte','arabica-robusta']),
  ('e1000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000001', 'Spanish Latte', 'Espresso with sweetened condensed milk', 100.00, true, true, 4, 3, ARRAY['coffee','espresso','latte','sweet','arabica-robusta']),
  ('e1000000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000001', 'Vanilla Latte', 'Classic latte with vanilla syrup', 100.00, true, false, 4, 4, ARRAY['coffee','espresso','latte','vanilla','arabica-robusta']),
  ('e1000000-0000-4000-a000-000000000005', 'c0000000-0000-4000-a000-000000000001', 'French Vanilla', 'Rich espresso with French vanilla cream', 100.00, true, false, 4, 5, ARRAY['coffee','espresso','latte','vanilla','arabica-robusta']),
  ('e1000000-0000-4000-a000-000000000006', 'c0000000-0000-4000-a000-000000000001', 'Caramel Latte', 'Espresso with buttery caramel syrup and milk', 100.00, true, false, 4, 6, ARRAY['coffee','espresso','latte','caramel','arabica-robusta']),
  ('e1000000-0000-4000-a000-000000000007', 'c0000000-0000-4000-a000-000000000001', 'Hazelnut Latte', 'Espresso with roasted hazelnut and milk', 100.00, true, false, 4, 7, ARRAY['coffee','espresso','latte','hazelnut','arabica-robusta']),
  ('e1000000-0000-4000-a000-000000000008', 'c0000000-0000-4000-a000-000000000001', 'Macadamia Latte', 'Espresso with creamy macadamia nut syrup', 100.00, true, false, 4, 8, ARRAY['coffee','espresso','latte','macadamia','arabica-robusta']),
  ('e1000000-0000-4000-a000-000000000009', 'c0000000-0000-4000-a000-000000000001', 'Butterscotch Latte', 'Espresso with rich butterscotch caramel', 100.00, true, false, 4, 9, ARRAY['coffee','espresso','latte','butterscotch','arabica-robusta']),
  ('e1000000-0000-4000-a000-00000000000a', 'c0000000-0000-4000-a000-000000000001', 'Aussie Latte', 'Specialty iced latte with house blend', 120.00, true, false, 4, 10, ARRAY['coffee','espresso','latte','iced-only','arabica-robusta']),
  ('e1000000-0000-4000-a000-00000000000b', 'c0000000-0000-4000-a000-000000000001', 'White Mocha Latte', 'Espresso with white chocolate and steamed milk', 100.00, true, true, 4, 11, ARRAY['coffee','espresso','latte','white-chocolate','mocha','arabica-robusta']),
  ('e1000000-0000-4000-a000-00000000000c', 'c0000000-0000-4000-a000-000000000001', 'Cinnamon Cappuccino', 'Foamy cappuccino dusted with cinnamon', 100.00, true, false, 4, 12, ARRAY['coffee','espresso','cappuccino','cinnamon','arabica-robusta']);

-- ============================================================
-- MENU ITEMS — SIGNATURE DRINKS
-- ============================================================

INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes, sort_order, tags) VALUES
  ('e2000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000002', 'Caramel Macchiato', 'Layered espresso with vanilla milk and caramel drizzle', 110.00, true, true, 5, 1, ARRAY['coffee','signature','caramel','vanilla']),
  ('e2000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000002', 'Caramel Mocha', 'Rich espresso with chocolate and caramel', 110.00, true, false, 5, 2, ARRAY['coffee','signature','caramel','mocha']),
  ('e2000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000002', 'Salted Caramel', 'Espresso with sea salt and caramel', 110.00, true, true, 5, 3, ARRAY['coffee','signature','caramel','salted']),
  ('e2000000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000002', 'Mocha', 'Rich chocolate espresso blend', 110.00, true, false, 5, 4, ARRAY['coffee','signature','mocha','chocolate']),
  ('e2000000-0000-4000-a000-000000000005', 'c0000000-0000-4000-a000-000000000002', 'Cloud Hazelnut', 'Fluffy hazelnut cloud espresso', 110.00, true, false, 5, 5, ARRAY['coffee','signature','hazelnut','creamy']),
  ('e2000000-0000-4000-a000-000000000006', 'c0000000-0000-4000-a000-000000000002', 'Tres Leche Shaken Espresso', 'Shaken espresso with three-milk blend', 110.00, true, true, 5, 6, ARRAY['coffee','signature','tres-leche','shaken','iced-only']),
  ('e2000000-0000-4000-a000-000000000007', 'c0000000-0000-4000-a000-000000000002', 'Milo Shaken Espresso', 'Shaken espresso with Milo chocolate malt', 110.00, true, false, 5, 7, ARRAY['coffee','signature','milo','shaken','iced-only']),
  ('e2000000-0000-4000-a000-000000000008', 'c0000000-0000-4000-a000-000000000002', 'Hazelnut Mocha', 'Chocolate hazelnut espresso blend', 110.00, true, false, 5, 8, ARRAY['coffee','signature','hazelnut','mocha']),
  ('e2000000-0000-4000-a000-000000000009', 'c0000000-0000-4000-a000-000000000002', 'Biscoff', 'Espresso with Biscoff cookie butter spread', 130.00, true, true, 5, 9, ARRAY['coffee','signature','biscoff','cookie','iced-only']),
  ('e2000000-0000-4000-a000-00000000000a', 'c0000000-0000-4000-a000-000000000002', 'Cocoa Lava', 'Rich premium hot chocolate', 100.00, true, false, 4, 10, ARRAY['non-coffee','signature','chocolate','cocoa']),
  ('e2000000-0000-4000-a000-00000000000b', 'c0000000-0000-4000-a000-000000000002', 'Matcha Latte', 'Premium Japanese matcha with milk', 100.00, true, true, 4, 11, ARRAY['non-coffee','signature','matcha','creamy']),
  ('e2000000-0000-4000-a000-00000000000c', 'c0000000-0000-4000-a000-000000000002', 'Strawberry Milk', 'Creamy strawberry milk blend', 90.00, true, false, 3, 12, ARRAY['non-coffee','signature','strawberry','fruity','iced-only']),
  ('e2000000-0000-4000-a000-00000000000d', 'c0000000-0000-4000-a000-000000000002', 'Nom Yen Pink Milk', 'Thai-style sweet pink milk', 90.00, true, false, 3, 13, ARRAY['non-coffee','signature','thai','sweet','iced-only']);

-- ============================================================
-- MENU ITEMS — FRAPPES
-- ============================================================

INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes, sort_order, tags) VALUES
  ('e3000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000003', 'Vanilla Milkshake', 'Classic vanilla ice-blended milkshake', 110.00, true, false, 5, 1, ARRAY['non-coffee','frappe','ice-blended','vanilla']),
  ('e3000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000003', 'Cookies & Cream', 'Oreo cookie ice-blended cream', 110.00, true, true, 5, 2, ARRAY['non-coffee','frappe','ice-blended','cookies','chocolate']),
  ('e3000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000003', 'Dark Chocolate', 'Rich dark chocolate ice blend', 110.00, true, false, 5, 3, ARRAY['non-coffee','frappe','ice-blended','chocolate']),
  ('e3000000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000003', 'Matcha', 'Japanese matcha ice-blended cream', 110.00, true, false, 5, 4, ARRAY['non-coffee','frappe','ice-blended','matcha']),
  ('e3000000-0000-4000-a000-000000000005', 'c0000000-0000-4000-a000-000000000003', 'Strawberries & Cream', 'Strawberry cream ice blend', 110.00, true, false, 5, 5, ARRAY['non-coffee','frappe','ice-blended','strawberry']),
  ('e3000000-0000-4000-a000-000000000006', 'c0000000-0000-4000-a000-000000000003', 'Caramel Frappe', 'Coffee with caramel ice blend', 120.00, true, false, 5, 6, ARRAY['coffee','frappe','ice-blended','caramel']),
  ('e3000000-0000-4000-a000-000000000007', 'c0000000-0000-4000-a000-000000000003', 'Mocha Frappe', 'Chocolate coffee ice blend', 120.00, true, false, 5, 7, ARRAY['coffee','frappe','ice-blended','mocha','chocolate']),
  ('e3000000-0000-4000-a000-000000000008', 'c0000000-0000-4000-a000-000000000003', 'Java Chip', 'Coffee with chocolate chip ice blend', 120.00, true, true, 5, 8, ARRAY['coffee','frappe','ice-blended','chocolate','java']),
  ('e3000000-0000-4000-a000-000000000009', 'c0000000-0000-4000-a000-000000000003', 'Salted Caramel Frappe', 'Coffee with sea salt caramel ice blend', 120.00, true, false, 5, 9, ARRAY['coffee','frappe','ice-blended','caramel','salted']),
  ('e3000000-0000-4000-a000-00000000000a', 'c0000000-0000-4000-a000-000000000003', 'Biscoff Frappe', 'Coffee with Biscoff cookie ice blend', 130.00, true, true, 5, 10, ARRAY['coffee','frappe','ice-blended','biscoff','cookie']);

-- ============================================================
-- MENU ITEMS — MILK TEAS
-- ============================================================

INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes, sort_order, tags) VALUES
  ('e4000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000004', 'Classic Milk Tea', 'Traditional black milk tea', 55.00, true, false, 3, 1, ARRAY['non-coffee','milk-tea','classic']),
  ('e4000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000004', 'Wintermelon Milk Tea', 'Sweet wintermelon-flavored milk tea', 55.00, true, true, 3, 2, ARRAY['non-coffee','milk-tea','wintermelon','sweet']),
  ('e4000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000004', 'Okinawa Milk Tea', 'Japanese brown sugar milk tea', 55.00, true, false, 3, 3, ARRAY['non-coffee','milk-tea','okinawa','brown-sugar']),
  ('e4000000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000004', 'Dark Chocolate Milk Tea', 'Rich dark chocolate milk tea', 55.00, true, false, 3, 4, ARRAY['non-coffee','milk-tea','chocolate']),
  ('e4000000-0000-4000-a000-000000000005', 'c0000000-0000-4000-a000-000000000004', 'Taro Milk Tea', 'Creamy purple taro milk tea', 55.00, true, true, 3, 5, ARRAY['non-coffee','milk-tea','taro','creamy']),
  ('e4000000-0000-4000-a000-000000000006', 'c0000000-0000-4000-a000-000000000004', 'Cookies & Cream Milk Tea', 'Oreo cookies blended with milk tea', 55.00, true, false, 3, 6, ARRAY['non-coffee','milk-tea','cookies','chocolate']);

-- ============================================================
-- MENU ITEMS — REFRESHERS
-- ============================================================

INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes, sort_order, tags) VALUES
  ('e5000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000005', 'Strawberry Soda', 'Sparkling strawberry refresher', 70.00, true, false, 3, 1, ARRAY['non-coffee','refresher','fruity','strawberry','sparkling']),
  ('e5000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000005', 'Blueberry Soda', 'Sparkling blueberry refresher', 70.00, true, false, 3, 2, ARRAY['non-coffee','refresher','fruity','blueberry','sparkling']),
  ('e5000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000005', 'Green Apple Soda', 'Sparkling green apple refresher', 70.00, true, false, 3, 3, ARRAY['non-coffee','refresher','fruity','green-apple','sparkling']),
  ('e5000000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000005', 'Lychee Soda', 'Sparkling lychee refresher', 70.00, true, false, 3, 4, ARRAY['non-coffee','refresher','fruity','lychee','sparkling']),
  ('e5000000-0000-4000-a000-000000000005', 'c0000000-0000-4000-a000-000000000005', 'Honey Peach Soda', 'Sparkling honey peach refresher', 70.00, true, true, 3, 5, ARRAY['non-coffee','refresher','fruity','peach','honey','sparkling']);

-- ============================================================
-- MENU ITEMS — CROFFLES
-- ============================================================

INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes, sort_order, tags) VALUES
  ('e6000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000006', 'Just Croffle', 'Plain buttery croffle with powdered sugar', 100.00, true, false, 8, 1, ARRAY['food','croffle','pastry','classic']),
  ('e6000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000006', 'S''mores', 'Croffle with toasted marshmallow and chocolate', 125.00, true, true, 10, 2, ARRAY['food','croffle','pastry','smores','chocolate','marshmallow']),
  ('e6000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000006', 'Banatella', 'Croffle with banana slices and Nutella', 145.00, true, true, 10, 3, ARRAY['food','croffle','pastry','banana','nutella']),
  ('e6000000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000006', 'Biscoff Croffle', 'Croffle with Biscoff cookie butter spread', 160.00, true, false, 10, 4, ARRAY['food','croffle','pastry','biscoff','cookie']),
  ('e6000000-0000-4000-a000-000000000005', 'c0000000-0000-4000-a000-000000000006', 'Almond Nutella', 'Croffle with Nutella and toasted almonds', 125.00, true, false, 10, 5, ARRAY['food','croffle','pastry','almond','nutella']),
  ('e6000000-0000-4000-a000-000000000006', 'c0000000-0000-4000-a000-000000000006', 'Ham & Cheese', 'Savory croffle with ham and melted cheese', 160.00, true, true, 12, 6, ARRAY['food','croffle','pastry','savory','ham','cheese']);

-- ============================================================
-- MENU ITEMS — SNACKS
-- ============================================================

INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes, sort_order, tags) VALUES
  ('e7000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000007', 'Flavored Fries', 'Crispy fries with your choice of seasoning', 89.00, true, false, 10, 1, ARRAY['food','snack','fries','savory']),
  ('e7000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000007', 'Nachos', 'Loaded tortilla chips with cheese (coming soon)', 0.00, false, false, 10, 2, ARRAY['food','snack','nachos','coming-soon']),
  ('e7000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000007', 'Chicken Pop', 'Crispy chicken poppers (coming soon)', 0.00, false, false, 10, 3, ARRAY['food','snack','chicken','coming-soon']);


-- ============================================================
-- ITEM VARIANTS — SIZE (ESPRESSO)
-- Espresso: Hot -10, Medium 0 (base), Large +10
-- Aussie Latte: no Hot
-- ============================================================

INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order) VALUES
  -- Americano (base 65)
  ('e1000000-0000-4000-a000-000000000001', 'size', 'Hot 12oz', -10.00, false, 1),
  ('e1000000-0000-4000-a000-000000000001', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e1000000-0000-4000-a000-000000000001', 'size', 'Large 22oz', 10.00, false, 3),
  -- Coffee Latte (base 85)
  ('e1000000-0000-4000-a000-000000000002', 'size', 'Hot 12oz', -10.00, false, 1),
  ('e1000000-0000-4000-a000-000000000002', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e1000000-0000-4000-a000-000000000002', 'size', 'Large 22oz', 10.00, false, 3),
  -- Spanish Latte (base 100)
  ('e1000000-0000-4000-a000-000000000003', 'size', 'Hot 12oz', -10.00, false, 1),
  ('e1000000-0000-4000-a000-000000000003', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e1000000-0000-4000-a000-000000000003', 'size', 'Large 22oz', 10.00, false, 3),
  -- Vanilla Latte (base 100)
  ('e1000000-0000-4000-a000-000000000004', 'size', 'Hot 12oz', -10.00, false, 1),
  ('e1000000-0000-4000-a000-000000000004', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e1000000-0000-4000-a000-000000000004', 'size', 'Large 22oz', 10.00, false, 3),
  -- French Vanilla (base 100)
  ('e1000000-0000-4000-a000-000000000005', 'size', 'Hot 12oz', -10.00, false, 1),
  ('e1000000-0000-4000-a000-000000000005', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e1000000-0000-4000-a000-000000000005', 'size', 'Large 22oz', 10.00, false, 3),
  -- Caramel Latte (base 100)
  ('e1000000-0000-4000-a000-000000000006', 'size', 'Hot 12oz', -10.00, false, 1),
  ('e1000000-0000-4000-a000-000000000006', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e1000000-0000-4000-a000-000000000006', 'size', 'Large 22oz', 10.00, false, 3),
  -- Hazelnut Latte (base 100)
  ('e1000000-0000-4000-a000-000000000007', 'size', 'Hot 12oz', -10.00, false, 1),
  ('e1000000-0000-4000-a000-000000000007', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e1000000-0000-4000-a000-000000000007', 'size', 'Large 22oz', 10.00, false, 3),
  -- Macadamia Latte (base 100)
  ('e1000000-0000-4000-a000-000000000008', 'size', 'Hot 12oz', -10.00, false, 1),
  ('e1000000-0000-4000-a000-000000000008', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e1000000-0000-4000-a000-000000000008', 'size', 'Large 22oz', 10.00, false, 3),
  -- Butterscotch Latte (base 100)
  ('e1000000-0000-4000-a000-000000000009', 'size', 'Hot 12oz', -10.00, false, 1),
  ('e1000000-0000-4000-a000-000000000009', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e1000000-0000-4000-a000-000000000009', 'size', 'Large 22oz', 10.00, false, 3),
  -- Aussie Latte (base 120, NO Hot)
  ('e1000000-0000-4000-a000-00000000000a', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e1000000-0000-4000-a000-00000000000a', 'size', 'Large 22oz', 10.00, false, 2),
  -- White Mocha Latte (base 100)
  ('e1000000-0000-4000-a000-00000000000b', 'size', 'Hot 12oz', -10.00, false, 1),
  ('e1000000-0000-4000-a000-00000000000b', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e1000000-0000-4000-a000-00000000000b', 'size', 'Large 22oz', 10.00, false, 3),
  -- Cinnamon Cappuccino (base 100)
  ('e1000000-0000-4000-a000-00000000000c', 'size', 'Hot 12oz', -10.00, false, 1),
  ('e1000000-0000-4000-a000-00000000000c', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e1000000-0000-4000-a000-00000000000c', 'size', 'Large 22oz', 10.00, false, 3);


-- ============================================================
-- ITEM VARIANTS — SIZE (SIGNATURE)
-- With Hot: Hot -20, Medium 0, Large +15
-- Without Hot: Medium 0, Large +15 (except Strawberry Milk & Nom Yen: Large +10)
-- ============================================================

INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order) VALUES
  -- Caramel Macchiato (base 110, has Hot)
  ('e2000000-0000-4000-a000-000000000001', 'size', 'Hot 12oz', -20.00, false, 1),
  ('e2000000-0000-4000-a000-000000000001', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e2000000-0000-4000-a000-000000000001', 'size', 'Large 22oz', 15.00, false, 3),
  -- Caramel Mocha (base 110, has Hot)
  ('e2000000-0000-4000-a000-000000000002', 'size', 'Hot 12oz', -20.00, false, 1),
  ('e2000000-0000-4000-a000-000000000002', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e2000000-0000-4000-a000-000000000002', 'size', 'Large 22oz', 15.00, false, 3),
  -- Salted Caramel (base 110, has Hot)
  ('e2000000-0000-4000-a000-000000000003', 'size', 'Hot 12oz', -20.00, false, 1),
  ('e2000000-0000-4000-a000-000000000003', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e2000000-0000-4000-a000-000000000003', 'size', 'Large 22oz', 15.00, false, 3),
  -- Mocha (base 110, has Hot)
  ('e2000000-0000-4000-a000-000000000004', 'size', 'Hot 12oz', -20.00, false, 1),
  ('e2000000-0000-4000-a000-000000000004', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e2000000-0000-4000-a000-000000000004', 'size', 'Large 22oz', 15.00, false, 3),
  -- Cloud Hazelnut (base 110, has Hot)
  ('e2000000-0000-4000-a000-000000000005', 'size', 'Hot 12oz', -20.00, false, 1),
  ('e2000000-0000-4000-a000-000000000005', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e2000000-0000-4000-a000-000000000005', 'size', 'Large 22oz', 15.00, false, 3),
  -- Tres Leche Shaken Espresso (base 110, NO Hot)
  ('e2000000-0000-4000-a000-000000000006', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e2000000-0000-4000-a000-000000000006', 'size', 'Large 22oz', 15.00, false, 2),
  -- Milo Shaken Espresso (base 110, NO Hot)
  ('e2000000-0000-4000-a000-000000000007', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e2000000-0000-4000-a000-000000000007', 'size', 'Large 22oz', 15.00, false, 2),
  -- Hazelnut Mocha (base 110, has Hot)
  ('e2000000-0000-4000-a000-000000000008', 'size', 'Hot 12oz', -20.00, false, 1),
  ('e2000000-0000-4000-a000-000000000008', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e2000000-0000-4000-a000-000000000008', 'size', 'Large 22oz', 15.00, false, 3),
  -- Biscoff (base 130, NO Hot, Large +15)
  ('e2000000-0000-4000-a000-000000000009', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e2000000-0000-4000-a000-000000000009', 'size', 'Large 22oz', 15.00, false, 2),
  -- Cocoa Lava (base 100, has Hot)
  ('e2000000-0000-4000-a000-00000000000a', 'size', 'Hot 12oz', -20.00, false, 1),
  ('e2000000-0000-4000-a000-00000000000a', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e2000000-0000-4000-a000-00000000000a', 'size', 'Large 22oz', 15.00, false, 3),
  -- Matcha Latte (base 100, has Hot)
  ('e2000000-0000-4000-a000-00000000000b', 'size', 'Hot 12oz', -20.00, false, 1),
  ('e2000000-0000-4000-a000-00000000000b', 'size', 'Medium 16oz', 0.00, true, 2),
  ('e2000000-0000-4000-a000-00000000000b', 'size', 'Large 22oz', 15.00, false, 3),
  -- Strawberry Milk (base 90, NO Hot, Large +10)
  ('e2000000-0000-4000-a000-00000000000c', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e2000000-0000-4000-a000-00000000000c', 'size', 'Large 22oz', 10.00, false, 2),
  -- Nom Yen Pink Milk (base 90, NO Hot, Large +10)
  ('e2000000-0000-4000-a000-00000000000d', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e2000000-0000-4000-a000-00000000000d', 'size', 'Large 22oz', 10.00, false, 2);


-- ============================================================
-- ITEM VARIANTS — SIZE (FRAPPES)
-- Non-coffee: Large +15 | Coffee: Large +10 | Biscoff: Large +20
-- ============================================================

INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order) VALUES
  -- Vanilla Milkshake (non-coffee, Large +15)
  ('e3000000-0000-4000-a000-000000000001', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e3000000-0000-4000-a000-000000000001', 'size', 'Large 22oz', 15.00, false, 2),
  -- Cookies & Cream (non-coffee, Large +15)
  ('e3000000-0000-4000-a000-000000000002', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e3000000-0000-4000-a000-000000000002', 'size', 'Large 22oz', 15.00, false, 2),
  -- Dark Chocolate (non-coffee, Large +15)
  ('e3000000-0000-4000-a000-000000000003', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e3000000-0000-4000-a000-000000000003', 'size', 'Large 22oz', 15.00, false, 2),
  -- Matcha (non-coffee, Large +15)
  ('e3000000-0000-4000-a000-000000000004', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e3000000-0000-4000-a000-000000000004', 'size', 'Large 22oz', 15.00, false, 2),
  -- Strawberries & Cream (non-coffee, Large +15)
  ('e3000000-0000-4000-a000-000000000005', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e3000000-0000-4000-a000-000000000005', 'size', 'Large 22oz', 15.00, false, 2),
  -- Caramel Frappe (coffee, Large +10)
  ('e3000000-0000-4000-a000-000000000006', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e3000000-0000-4000-a000-000000000006', 'size', 'Large 22oz', 10.00, false, 2),
  -- Mocha Frappe (coffee, Large +10)
  ('e3000000-0000-4000-a000-000000000007', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e3000000-0000-4000-a000-000000000007', 'size', 'Large 22oz', 10.00, false, 2),
  -- Java Chip (coffee, Large +10)
  ('e3000000-0000-4000-a000-000000000008', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e3000000-0000-4000-a000-000000000008', 'size', 'Large 22oz', 10.00, false, 2),
  -- Salted Caramel Frappe (coffee, Large +10)
  ('e3000000-0000-4000-a000-000000000009', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e3000000-0000-4000-a000-000000000009', 'size', 'Large 22oz', 10.00, false, 2),
  -- Biscoff Frappe (coffee, Large +20)
  ('e3000000-0000-4000-a000-00000000000a', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e3000000-0000-4000-a000-00000000000a', 'size', 'Large 22oz', 20.00, false, 2);


-- ============================================================
-- ITEM VARIANTS — SIZE (MILK TEAS) — Large +10
-- ============================================================

INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order) VALUES
  ('e4000000-0000-4000-a000-000000000001', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e4000000-0000-4000-a000-000000000001', 'size', 'Large 22oz', 10.00, false, 2),
  ('e4000000-0000-4000-a000-000000000002', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e4000000-0000-4000-a000-000000000002', 'size', 'Large 22oz', 10.00, false, 2),
  ('e4000000-0000-4000-a000-000000000003', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e4000000-0000-4000-a000-000000000003', 'size', 'Large 22oz', 10.00, false, 2),
  ('e4000000-0000-4000-a000-000000000004', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e4000000-0000-4000-a000-000000000004', 'size', 'Large 22oz', 10.00, false, 2),
  ('e4000000-0000-4000-a000-000000000005', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e4000000-0000-4000-a000-000000000005', 'size', 'Large 22oz', 10.00, false, 2),
  ('e4000000-0000-4000-a000-000000000006', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e4000000-0000-4000-a000-000000000006', 'size', 'Large 22oz', 10.00, false, 2);


-- ============================================================
-- ITEM VARIANTS — SIZE (REFRESHERS) — Large +15
-- ============================================================

INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order) VALUES
  ('e5000000-0000-4000-a000-000000000001', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e5000000-0000-4000-a000-000000000001', 'size', 'Large 22oz', 15.00, false, 2),
  ('e5000000-0000-4000-a000-000000000002', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e5000000-0000-4000-a000-000000000002', 'size', 'Large 22oz', 15.00, false, 2),
  ('e5000000-0000-4000-a000-000000000003', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e5000000-0000-4000-a000-000000000003', 'size', 'Large 22oz', 15.00, false, 2),
  ('e5000000-0000-4000-a000-000000000004', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e5000000-0000-4000-a000-000000000004', 'size', 'Large 22oz', 15.00, false, 2),
  ('e5000000-0000-4000-a000-000000000005', 'size', 'Medium 16oz', 0.00, true, 1),
  ('e5000000-0000-4000-a000-000000000005', 'size', 'Large 22oz', 15.00, false, 2);


-- ============================================================
-- ITEM VARIANTS — SUGAR LEVEL (ALL DRINKS)
-- Espresso (12) + Signature (13) + Frappes (10) + Milk Teas (6) + Refreshers (5) = 46 items
-- ============================================================

INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order) VALUES
  -- Espresso sugar levels
  ('e1000000-0000-4000-a000-000000000001', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e1000000-0000-4000-a000-000000000001', 'sugar_level', 'Normal', 0, true, 2),
  ('e1000000-0000-4000-a000-000000000001', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e1000000-0000-4000-a000-000000000002', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e1000000-0000-4000-a000-000000000002', 'sugar_level', 'Normal', 0, true, 2),
  ('e1000000-0000-4000-a000-000000000002', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e1000000-0000-4000-a000-000000000003', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e1000000-0000-4000-a000-000000000003', 'sugar_level', 'Normal', 0, true, 2),
  ('e1000000-0000-4000-a000-000000000003', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e1000000-0000-4000-a000-000000000004', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e1000000-0000-4000-a000-000000000004', 'sugar_level', 'Normal', 0, true, 2),
  ('e1000000-0000-4000-a000-000000000004', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e1000000-0000-4000-a000-000000000005', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e1000000-0000-4000-a000-000000000005', 'sugar_level', 'Normal', 0, true, 2),
  ('e1000000-0000-4000-a000-000000000005', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e1000000-0000-4000-a000-000000000006', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e1000000-0000-4000-a000-000000000006', 'sugar_level', 'Normal', 0, true, 2),
  ('e1000000-0000-4000-a000-000000000006', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e1000000-0000-4000-a000-000000000007', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e1000000-0000-4000-a000-000000000007', 'sugar_level', 'Normal', 0, true, 2),
  ('e1000000-0000-4000-a000-000000000007', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e1000000-0000-4000-a000-000000000008', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e1000000-0000-4000-a000-000000000008', 'sugar_level', 'Normal', 0, true, 2),
  ('e1000000-0000-4000-a000-000000000008', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e1000000-0000-4000-a000-000000000009', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e1000000-0000-4000-a000-000000000009', 'sugar_level', 'Normal', 0, true, 2),
  ('e1000000-0000-4000-a000-000000000009', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e1000000-0000-4000-a000-00000000000a', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e1000000-0000-4000-a000-00000000000a', 'sugar_level', 'Normal', 0, true, 2),
  ('e1000000-0000-4000-a000-00000000000a', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e1000000-0000-4000-a000-00000000000b', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e1000000-0000-4000-a000-00000000000b', 'sugar_level', 'Normal', 0, true, 2),
  ('e1000000-0000-4000-a000-00000000000b', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e1000000-0000-4000-a000-00000000000c', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e1000000-0000-4000-a000-00000000000c', 'sugar_level', 'Normal', 0, true, 2),
  ('e1000000-0000-4000-a000-00000000000c', 'sugar_level', 'Extra Sweet', 0, false, 3),
  -- Signature sugar levels
  ('e2000000-0000-4000-a000-000000000001', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-000000000001', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-000000000001', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e2000000-0000-4000-a000-000000000002', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-000000000002', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-000000000002', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e2000000-0000-4000-a000-000000000003', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-000000000003', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-000000000003', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e2000000-0000-4000-a000-000000000004', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-000000000004', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-000000000004', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e2000000-0000-4000-a000-000000000005', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-000000000005', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-000000000005', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e2000000-0000-4000-a000-000000000006', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-000000000006', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-000000000006', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e2000000-0000-4000-a000-000000000007', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-000000000007', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-000000000007', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e2000000-0000-4000-a000-000000000008', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-000000000008', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-000000000008', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e2000000-0000-4000-a000-000000000009', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-000000000009', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-000000000009', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e2000000-0000-4000-a000-00000000000a', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-00000000000a', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-00000000000a', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e2000000-0000-4000-a000-00000000000b', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-00000000000b', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-00000000000b', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e2000000-0000-4000-a000-00000000000c', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-00000000000c', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-00000000000c', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e2000000-0000-4000-a000-00000000000d', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e2000000-0000-4000-a000-00000000000d', 'sugar_level', 'Normal', 0, true, 2),
  ('e2000000-0000-4000-a000-00000000000d', 'sugar_level', 'Extra Sweet', 0, false, 3),
  -- Frappes sugar levels
  ('e3000000-0000-4000-a000-000000000001', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e3000000-0000-4000-a000-000000000001', 'sugar_level', 'Normal', 0, true, 2),
  ('e3000000-0000-4000-a000-000000000001', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e3000000-0000-4000-a000-000000000002', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e3000000-0000-4000-a000-000000000002', 'sugar_level', 'Normal', 0, true, 2),
  ('e3000000-0000-4000-a000-000000000002', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e3000000-0000-4000-a000-000000000003', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e3000000-0000-4000-a000-000000000003', 'sugar_level', 'Normal', 0, true, 2),
  ('e3000000-0000-4000-a000-000000000003', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e3000000-0000-4000-a000-000000000004', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e3000000-0000-4000-a000-000000000004', 'sugar_level', 'Normal', 0, true, 2),
  ('e3000000-0000-4000-a000-000000000004', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e3000000-0000-4000-a000-000000000005', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e3000000-0000-4000-a000-000000000005', 'sugar_level', 'Normal', 0, true, 2),
  ('e3000000-0000-4000-a000-000000000005', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e3000000-0000-4000-a000-000000000006', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e3000000-0000-4000-a000-000000000006', 'sugar_level', 'Normal', 0, true, 2),
  ('e3000000-0000-4000-a000-000000000006', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e3000000-0000-4000-a000-000000000007', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e3000000-0000-4000-a000-000000000007', 'sugar_level', 'Normal', 0, true, 2),
  ('e3000000-0000-4000-a000-000000000007', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e3000000-0000-4000-a000-000000000008', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e3000000-0000-4000-a000-000000000008', 'sugar_level', 'Normal', 0, true, 2),
  ('e3000000-0000-4000-a000-000000000008', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e3000000-0000-4000-a000-000000000009', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e3000000-0000-4000-a000-000000000009', 'sugar_level', 'Normal', 0, true, 2),
  ('e3000000-0000-4000-a000-000000000009', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e3000000-0000-4000-a000-00000000000a', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e3000000-0000-4000-a000-00000000000a', 'sugar_level', 'Normal', 0, true, 2),
  ('e3000000-0000-4000-a000-00000000000a', 'sugar_level', 'Extra Sweet', 0, false, 3),
  -- Milk Teas sugar levels
  ('e4000000-0000-4000-a000-000000000001', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e4000000-0000-4000-a000-000000000001', 'sugar_level', 'Normal', 0, true, 2),
  ('e4000000-0000-4000-a000-000000000001', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e4000000-0000-4000-a000-000000000002', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e4000000-0000-4000-a000-000000000002', 'sugar_level', 'Normal', 0, true, 2),
  ('e4000000-0000-4000-a000-000000000002', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e4000000-0000-4000-a000-000000000003', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e4000000-0000-4000-a000-000000000003', 'sugar_level', 'Normal', 0, true, 2),
  ('e4000000-0000-4000-a000-000000000003', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e4000000-0000-4000-a000-000000000004', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e4000000-0000-4000-a000-000000000004', 'sugar_level', 'Normal', 0, true, 2),
  ('e4000000-0000-4000-a000-000000000004', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e4000000-0000-4000-a000-000000000005', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e4000000-0000-4000-a000-000000000005', 'sugar_level', 'Normal', 0, true, 2),
  ('e4000000-0000-4000-a000-000000000005', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e4000000-0000-4000-a000-000000000006', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e4000000-0000-4000-a000-000000000006', 'sugar_level', 'Normal', 0, true, 2),
  ('e4000000-0000-4000-a000-000000000006', 'sugar_level', 'Extra Sweet', 0, false, 3),
  -- Refreshers sugar levels
  ('e5000000-0000-4000-a000-000000000001', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e5000000-0000-4000-a000-000000000001', 'sugar_level', 'Normal', 0, true, 2),
  ('e5000000-0000-4000-a000-000000000001', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e5000000-0000-4000-a000-000000000002', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e5000000-0000-4000-a000-000000000002', 'sugar_level', 'Normal', 0, true, 2),
  ('e5000000-0000-4000-a000-000000000002', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e5000000-0000-4000-a000-000000000003', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e5000000-0000-4000-a000-000000000003', 'sugar_level', 'Normal', 0, true, 2),
  ('e5000000-0000-4000-a000-000000000003', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e5000000-0000-4000-a000-000000000004', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e5000000-0000-4000-a000-000000000004', 'sugar_level', 'Normal', 0, true, 2),
  ('e5000000-0000-4000-a000-000000000004', 'sugar_level', 'Extra Sweet', 0, false, 3),
  ('e5000000-0000-4000-a000-000000000005', 'sugar_level', 'Less Sweet', 0, false, 1),
  ('e5000000-0000-4000-a000-000000000005', 'sugar_level', 'Normal', 0, true, 2),
  ('e5000000-0000-4000-a000-000000000005', 'sugar_level', 'Extra Sweet', 0, false, 3);


-- ============================================================
-- ITEM VARIANTS — FLAVOR (FLAVORED FRIES ONLY)
-- ============================================================

INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order) VALUES
  ('e7000000-0000-4000-a000-000000000001', 'flavor', 'BBQ', 0, false, 1),
  ('e7000000-0000-4000-a000-000000000001', 'flavor', 'Cheese', 0, false, 2),
  ('e7000000-0000-4000-a000-000000000001', 'flavor', 'Sour & Cream', 0, false, 3);


-- ============================================================
-- VOUCHERS
-- ============================================================

INSERT INTO vouchers (code, description, discount_type, discount_value, min_order_amount, valid_from, valid_until) VALUES
  ('JAYDS10', '10% off your order', 'percentage', 10, 0, now(), now() + INTERVAL '30 days'),
  ('FLAT30', '₱30 off orders above ₱200', 'fixed', 30, 200, now(), now() + INTERVAL '30 days'),
  ('CROFFLE20', '₱20 off orders above ₱100', 'fixed', 20, 100, now(), now() + INTERVAL '14 days'),
  ('NEWUSER', '15% off — welcome discount', 'percentage', 15, 0, now(), now() + INTERVAL '60 days');
