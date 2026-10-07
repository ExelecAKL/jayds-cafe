-- ============================================================
-- Jayds Cafe — Feature Expansion (SAFE + CUSTOMIZATION-AWARE)
-- Fully idempotent: ON CONFLICT, IF NOT EXISTS everywhere
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. NEW COLUMNS on existing tables
-- ════════════════════════════════════════════════════════════
DO $$ BEGIN
  -- profiles
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='loyalty_tier') THEN
    ALTER TABLE profiles ADD COLUMN loyalty_tier text NOT NULL DEFAULT 'Bronze';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='total_spent') THEN
    ALTER TABLE profiles ADD COLUMN total_spent numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='favorite_items') THEN
    ALTER TABLE profiles ADD COLUMN favorite_items uuid[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='last_order_at') THEN
    ALTER TABLE profiles ADD COLUMN last_order_at timestamptz;
  END IF;
  -- orders
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='discount') THEN
    ALTER TABLE orders ADD COLUMN discount numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='points_redeemed') THEN
    ALTER TABLE orders ADD COLUMN points_redeemed integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 2. NEW TABLES
-- ════════════════════════════════════════════════════════════

-- 2a. Ingredients master list
CREATE TABLE IF NOT EXISTS ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  unit text NOT NULL DEFAULT 'g',
  current_stock numeric NOT NULL DEFAULT 0,
  min_stock_alert numeric NOT NULL DEFAULT 50,
  cost_per_unit numeric NOT NULL DEFAULT 0,
  supplier text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2b. Base recipe: which ingredients go into each menu item
CREATE TABLE IF NOT EXISTS menu_item_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_used numeric NOT NULL DEFAULT 1,
  size_multipliers jsonb NOT NULL DEFAULT '{"Regular":1,"Medium":1.3,"Large":1.6}',
  UNIQUE(menu_item_id, ingredient_id)
);

-- 2c. ★ NEW: Variant → ingredient mapping (for add-ons & substitutions)
--     When a customer picks a variant, THIS says what ingredient to deduct
CREATE TABLE IF NOT EXISTS variant_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_label text NOT NULL,          -- e.g. 'Extra Shot', 'Oat Milk', 'Tapioca Pearls'
  variant_group text NOT NULL,          -- e.g. 'add_on', 'milk_choice'
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_used numeric NOT NULL DEFAULT 1,
  replaces_ingredient_id uuid REFERENCES ingredients(id), -- if this SUBSTITUTES another
  UNIQUE(variant_label, variant_group, ingredient_id)
);

-- 2d. Inventory audit log
CREATE TABLE IF NOT EXISTS inventory_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  change_amount numeric NOT NULL,
  change_type text NOT NULL DEFAULT 'manual_adjustment',
  order_id uuid REFERENCES orders(id),
  staff_id uuid REFERENCES profiles(id),
  notes text,
  stock_after numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 2e. Staff shifts
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES profiles(id),
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  duration_minutes numeric GENERATED ALWAYS AS (
    CASE WHEN clock_out IS NOT NULL
      THEN EXTRACT(EPOCH FROM (clock_out - clock_in)) / 60
      ELSE NULL
    END
  ) STORED,
  orders_handled integer NOT NULL DEFAULT 0,
  total_sales numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 2f. Loyalty tiers
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  min_points integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#cd7f32',
  perks jsonb NOT NULL DEFAULT '[]',
  badge_emoji text NOT NULL DEFAULT '🥉',
  created_at timestamptz DEFAULT now()
);

-- ════════════════════════════════════════════════════════════
-- 3. RLS POLICIES
-- ════════════════════════════════════════════════════════════
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_tiers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- ingredients
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ingredients_read') THEN
    CREATE POLICY ingredients_read ON ingredients FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ingredients_write') THEN
    CREATE POLICY ingredients_write ON ingredients FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin'))
    );
  END IF;
  -- menu_item_ingredients
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'recipes_read') THEN
    CREATE POLICY recipes_read ON menu_item_ingredients FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'recipes_write') THEN
    CREATE POLICY recipes_write ON menu_item_ingredients FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin'))
    );
  END IF;
  -- variant_ingredients
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'variant_ing_read') THEN
    CREATE POLICY variant_ing_read ON variant_ingredients FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'variant_ing_write') THEN
    CREATE POLICY variant_ing_write ON variant_ingredients FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin'))
    );
  END IF;
  -- inventory_logs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inv_logs_read') THEN
    CREATE POLICY inv_logs_read ON inventory_logs FOR SELECT USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inv_logs_insert') THEN
    CREATE POLICY inv_logs_insert ON inventory_logs FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin'))
    );
  END IF;
  -- shifts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shifts_read') THEN
    CREATE POLICY shifts_read ON shifts FOR SELECT USING (
      staff_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shifts_write') THEN
    CREATE POLICY shifts_write ON shifts FOR ALL USING (
      staff_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
  -- loyalty_tiers
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tiers_read') THEN
    CREATE POLICY tiers_read ON loyalty_tiers FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tiers_admin') THEN
    CREATE POLICY tiers_admin ON loyalty_tiers FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 4. SEED: INGREDIENTS (comprehensive list)
-- ════════════════════════════════════════════════════════════
INSERT INTO ingredients (name, unit, current_stock, min_stock_alert, cost_per_unit, supplier) VALUES
  -- ━━━ COFFEE / BASE ━━━
  ('Espresso Beans',       'g',   5000,  500,  0.80, 'Local Roaster'),
  ('Instant Coffee Powder','g',   2000,  200,  0.30, 'Local Roaster'),

  -- ━━━ DAIRY / MILK ━━━
  ('Whole Milk',           'ml', 10000, 1000,  0.05, 'Dairy Fresh'),
  ('Oat Milk',             'ml',  3000,  300,  0.12, 'Plant Milk PH'),
  ('Coconut Milk',         'ml',  2000,  200,  0.08, 'Coco Farm'),
  ('Condensed Milk',       'ml',  3000,  300,  0.08, 'Alaska'),
  ('Evaporated Milk',      'ml',  2000,  200,  0.06, 'Alaska'),
  ('Whipped Cream',        'ml',  2000,  200,  0.10, 'Dairy Fresh'),
  ('Cream Cheese',         'g',   1000,  100,  0.45, 'Dairy Fresh'),

  -- ━━━ SYRUPS ━━━
  ('Vanilla Syrup',        'ml',  2000,  200,  0.15, 'Sweet Co'),
  ('Caramel Syrup',        'ml',  2000,  200,  0.18, 'Sweet Co'),
  ('Hazelnut Syrup',       'ml',  1500,  200,  0.20, 'Sweet Co'),
  ('Brown Sugar Syrup',    'ml',  3000,  300,  0.12, 'Sweet Co'),
  ('Butterscotch Syrup',   'ml',  1500,  150,  0.22, 'Sweet Co'),
  ('Macadamia Syrup',      'ml',  1000,  100,  0.25, 'Sweet Co'),
  ('French Vanilla Syrup', 'ml',  1500,  150,  0.18, 'Sweet Co'),
  ('White Mocha Sauce',    'ml',  1500,  150,  0.30, 'Sweet Co'),
  ('Salted Caramel Sauce', 'ml',  1500,  150,  0.25, 'Sweet Co'),
  ('Simple Syrup',         'ml',  3000,  300,  0.05, 'In-house'),

  -- ━━━ POWDERS / FLAVORING ━━━
  ('Matcha Powder',        'g',   1000,  100,  2.50, 'Tea Import PH'),
  ('Chocolate Powder',     'g',   2000,  200,  0.60, 'Choco PH'),
  ('Milo Powder',          'g',   2000,  200,  0.40, 'Nestlé'),
  ('Taro Powder',          'g',   1000,  100,  1.20, 'Tea Import PH'),
  ('Ube Powder',           'g',    500,   50,  3.00, 'Local Supplier'),
  ('Wintermelon Powder',   'g',   1000,  100,  0.90, 'Tea Import PH'),
  ('Cinnamon Powder',      'g',    500,   50,  1.50, 'Spice House'),
  ('Cookies Crumble',      'g',   1000,  100,  1.00, 'Oreo/Generic'),

  -- ━━━ FRUIT / PUREE ━━━
  ('Strawberry Puree',     'ml',  1000,  100,  0.30, 'Fruit Supply'),
  ('Mango Puree',          'ml',  1000,  100,  0.25, 'Fruit Supply'),
  ('Blueberry Puree',      'ml',  1000,  100,  0.35, 'Fruit Supply'),
  ('Green Apple Puree',    'ml',  1000,  100,  0.30, 'Fruit Supply'),
  ('Lychee Puree',         'ml',  1000,  100,  0.35, 'Fruit Supply'),
  ('Honey Peach Puree',    'ml',  1000,  100,  0.30, 'Fruit Supply'),

  -- ━━━ TEA BASE ━━━
  ('Black Tea Bags',       'pcs', 500,   50,   3.00, 'Tea Import PH'),
  ('Nom Yen Mix',          'g',   500,   50,   2.00, 'Thai Import'),

  -- ━━━ TOPPINGS / ADD-ONS ━━━
  ('Tapioca Pearls (raw)', 'g',   3000,  300,  0.15, 'Boba Supply PH'),
  ('Coffee Jelly',         'g',   2000,  200,  0.20, 'In-house'),
  ('Nata de Coco',         'g',   2000,  200,  0.10, 'Local Supplier'),
  ('Chocolate Chips',      'g',   1000,  100,  1.20, 'Choco PH'),

  -- ━━━ SPREADS / SPECIAL ━━━
  ('Nutella',              'g',    500,   50,  2.50, 'Ferrero'),
  ('Biscoff Spread',       'g',    500,   50,  3.00, 'Lotus'),
  ('Marshmallows',         'g',   1000,  100,  0.80, 'Sweet Co'),
  ('Banana',               'pcs',  100,   20,  5.00, 'Market'),
  ('Almonds (sliced)',     'g',    500,   50,  2.00, 'Nut Supply'),

  -- ━━━ PACKAGING ━━━
  ('Cup 12oz (Hot)',       'pcs',  500,   50,  3.00, 'Pack Supplier'),
  ('Cup 16oz',             'pcs',  500,   50,  3.50, 'Pack Supplier'),
  ('Cup 22oz',             'pcs',  500,   50,  4.50, 'Pack Supplier'),
  ('Lid (flat)',           'pcs', 1000,  100,  1.00, 'Pack Supplier'),
  ('Lid (dome)',           'pcs',  500,   50,  1.50, 'Pack Supplier'),
  ('Straw',                'pcs', 1000,  100,  0.50, 'Pack Supplier'),

  -- ━━━ COOKED / PREP ━━━
  ('Ice',                  'g',  20000, 2000,  0.01, 'Ice Plant'),
  ('Soda Water',           'ml',  5000,  500,  0.03, 'Beverage Supply'),

  -- ━━━ PASTRY / FOOD ━━━
  ('Croffle Dough',        'pcs',  100,   15, 15.00, 'In-house'),
  ('Ham Slice',            'pcs',  100,   15,  8.00, 'Deli Supply'),
  ('Cheese Slice',         'pcs',  100,   15,  6.00, 'Dairy Fresh'),
  ('Powdered Sugar',       'g',   1000,  100,  0.10, 'Baking Supply'),
  ('French Fries (frozen)','g',   5000,  500,  0.08, 'Potato Supply'),
  ('BBQ Seasoning',        'g',    500,   50,  0.50, 'Spice House'),
  ('Cheese Seasoning',     'g',    500,   50,  0.60, 'Spice House'),
  ('Sour Cream Seasoning', 'g',    500,   50,  0.55, 'Spice House'),
  ('Frying Oil',           'ml',  5000,  500,  0.04, 'Market')
ON CONFLICT (name) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 5. SEED: LOYALTY TIERS
-- ════════════════════════════════════════════════════════════
INSERT INTO loyalty_tiers (name, min_points, color, perks, badge_emoji) VALUES
  ('Bronze', 0,    '#cd7f32', '["Earn 1 pt per ₱10 spent","Birthday greeting","Order history tracking"]'::jsonb, '🥉'),
  ('Silver', 500,  '#c0c0c0', '["1.2× point multiplier","Priority queue","Free size upgrade monthly","Early access to new items"]'::jsonb, '🥈'),
  ('Gold',   2000, '#ffd700', '["1.5× point multiplier","Free drink monthly","Exclusive Gold events","VIP support","10% birthday discount"]'::jsonb, '🥇')
ON CONFLICT (name) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 6. SEED: ADD-ON VARIANTS (for all drink categories)
--    These are new item_variants that appear as checkboxes
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_item_id uuid;
BEGIN
  -- Add "add_on" variants to ALL drinks (Espresso, Signature, Frappes, Milk Teas)
  FOR v_item_id IN
    SELECT mi.id FROM menu_items mi
    JOIN categories c ON c.id = mi.category_id
    WHERE c.name IN ('Espresso','Signature Drinks','Frappes','Milk Teas')
      AND mi.is_available = true
  LOOP
    -- Tapioca Pearls +₱15
    INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order)
    VALUES (v_item_id, 'add_on', 'Tapioca Pearls', 15, false, 10)
    ON CONFLICT DO NOTHING;

    -- Coffee Jelly +₱15
    INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order)
    VALUES (v_item_id, 'add_on', 'Coffee Jelly', 15, false, 11)
    ON CONFLICT DO NOTHING;

    -- Nata de Coco +₱15
    INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order)
    VALUES (v_item_id, 'add_on', 'Nata de Coco', 15, false, 12)
    ON CONFLICT DO NOTHING;

    -- Whipped Cream +₱10
    INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order)
    VALUES (v_item_id, 'add_on', 'Whipped Cream', 10, false, 13)
    ON CONFLICT DO NOTHING;

    -- Extra Shot +₱20 (only for coffee categories)
    IF EXISTS (
      SELECT 1 FROM menu_items mi2 JOIN categories c2 ON c2.id = mi2.category_id
      WHERE mi2.id = v_item_id AND c2.name IN ('Espresso','Signature Drinks')
    ) THEN
      INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order)
      VALUES (v_item_id, 'add_on', 'Extra Shot', 20, false, 14)
      ON CONFLICT DO NOTHING;
    END IF;

    -- Chocolate Drizzle +₱10
    INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order)
    VALUES (v_item_id, 'add_on', 'Chocolate Drizzle', 10, false, 15)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Add-on variants seeded for all drinks.';
END $$;

-- ════════════════════════════════════════════════════════════
-- 7. SEED: VARIANT → INGREDIENT MAPPINGS
--    How each customization choice maps to real ingredients
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_ing uuid;
  v_milk uuid;
BEGIN
  SELECT id INTO v_milk FROM ingredients WHERE name = 'Whole Milk';

  -- ── Add-ons (pure additions, no substitution) ──
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Tapioca Pearls (raw)';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Tapioca Pearls', 'add_on', v_ing, 50)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Coffee Jelly';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Coffee Jelly', 'add_on', v_ing, 40)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Nata de Coco';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Nata de Coco', 'add_on', v_ing, 40)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Whipped Cream';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Whipped Cream', 'add_on', v_ing, 30)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Espresso Beans';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Extra Shot', 'add_on', v_ing, 18)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Chocolate Powder';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Chocolate Drizzle', 'add_on', v_ing, 10)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Chocolate Chips';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Chocolate Drizzle', 'add_on', v_ing, 5)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  -- ── Sugar levels → syrup deductions ──
  -- "Extra Sweet" adds 15ml simple syrup, "Less Sweet" uses 0
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Simple Syrup';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Extra Sweet', 'sugar_level', v_ing, 15)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;
  -- "Normal" uses the base recipe amount (no extra), "Less Sweet" = no syrup addition

  -- ── Size → packaging ──
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Cup 12oz (Hot)';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Hot 12oz', 'size', v_ing, 1)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Cup 16oz';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Medium 16oz', 'size', v_ing, 1)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Cup 22oz';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Large 22oz', 'size', v_ing, 1)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  -- All cold drinks need lid + straw
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Lid (flat)';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Medium 16oz', 'size', v_ing, 1)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Large 22oz', 'size', v_ing, 1)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Straw';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Medium 16oz', 'size', v_ing, 1)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used)
  VALUES ('Large 22oz', 'size', v_ing, 1)
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  -- Dome lid for whipped cream orders
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Lid (dome)';
  INSERT INTO variant_ingredients (variant_label, variant_group, ingredient_id, quantity_used, replaces_ingredient_id)
  VALUES ('Whipped Cream', 'add_on', v_ing, 1, (SELECT id FROM ingredients WHERE name = 'Lid (flat)'))
  ON CONFLICT (variant_label, variant_group, ingredient_id) DO NOTHING;

  RAISE NOTICE 'Variant → ingredient mappings seeded.';
END $$;

-- ════════════════════════════════════════════════════════════
-- 8. SEED: BASE RECIPES (menu item → ingredients)
--    Maps each drink/food to its core ingredients
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_item uuid;
  v_ing uuid;
  v_sz jsonb := '{"Hot 12oz":0.7,"Medium 16oz":1,"Large 22oz":1.5}'::jsonb;
  v_sz_food jsonb := '{"Regular":1}'::jsonb;
BEGIN
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- ESPRESSO CATEGORY — base: espresso beans + milk + ice
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  -- Espresso beans for all espresso drinks
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Espresso Beans';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000001' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 18, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  -- Whole milk for all espresso (except Americano)
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Whole Milk';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000001' AND name != 'Americano' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 200, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  -- Ice for all espresso
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Ice';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000001' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 150, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  -- Specific syrups per drink
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Vanilla Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000004', v_ing, 30, v_sz) ON CONFLICT DO NOTHING; -- Vanilla Latte

  SELECT id INTO v_ing FROM ingredients WHERE name = 'French Vanilla Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000005', v_ing, 30, v_sz) ON CONFLICT DO NOTHING; -- French Vanilla

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Caramel Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000006', v_ing, 30, v_sz) ON CONFLICT DO NOTHING; -- Caramel Latte

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Hazelnut Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000007', v_ing, 30, v_sz) ON CONFLICT DO NOTHING; -- Hazelnut Latte

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Macadamia Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000008', v_ing, 30, v_sz) ON CONFLICT DO NOTHING; -- Macadamia Latte

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Butterscotch Syrup';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000009', v_ing, 30, v_sz) ON CONFLICT DO NOTHING; -- Butterscotch Latte

  SELECT id INTO v_ing FROM ingredients WHERE name = 'White Mocha Sauce';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-00000000000b', v_ing, 25, v_sz) ON CONFLICT DO NOTHING; -- White Mocha

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Cinnamon Powder';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-00000000000c', v_ing, 3, v_sz) ON CONFLICT DO NOTHING; -- Cinnamon Cappuccino

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Condensed Milk';
  INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
  VALUES ('e1000000-0000-4000-a000-000000000003', v_ing, 40, v_sz) ON CONFLICT DO NOTHING; -- Spanish Latte

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- SIGNATURE DRINKS — espresso/non-coffee bases + specific flavoring
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  -- Espresso beans for coffee-based signatures
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Espresso Beans';
  FOR v_item IN
    SELECT id FROM menu_items WHERE id IN (
      'e2000000-0000-4000-a000-000000000001', -- Caramel Macchiato
      'e2000000-0000-4000-a000-000000000002', -- Caramel Mocha
      'e2000000-0000-4000-a000-000000000003', -- Salted Caramel
      'e2000000-0000-4000-a000-000000000004', -- Mocha
      'e2000000-0000-4000-a000-000000000005', -- Cloud Hazelnut
      'e2000000-0000-4000-a000-000000000006', -- Tres Leche
      'e2000000-0000-4000-a000-000000000007', -- Milo Shaken
      'e2000000-0000-4000-a000-000000000008', -- Hazelnut Mocha
      'e2000000-0000-4000-a000-000000000009'  -- Biscoff
    )
  LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 18, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  -- Milk for all signatures
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Whole Milk';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000002' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 200, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  -- Ice for all signatures
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Ice';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000002' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 150, v_sz) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;

  -- Per-drink syrups/sauces
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Caramel Syrup';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-000000000001', v_ing, 30, v_sz) ON CONFLICT DO NOTHING; -- Caramel Macchiato
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-000000000002', v_ing, 25, v_sz) ON CONFLICT DO NOTHING; -- Caramel Mocha

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Salted Caramel Sauce';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-000000000003', v_ing, 30, v_sz) ON CONFLICT DO NOTHING; -- Salted Caramel

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Chocolate Powder';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-000000000002', v_ing, 20, v_sz) ON CONFLICT DO NOTHING; -- Caramel Mocha
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-000000000004', v_ing, 25, v_sz) ON CONFLICT DO NOTHING; -- Mocha
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-000000000008', v_ing, 20, v_sz) ON CONFLICT DO NOTHING; -- Hazelnut Mocha
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-00000000000a', v_ing, 30, v_sz) ON CONFLICT DO NOTHING; -- Cocoa Lava

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Hazelnut Syrup';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-000000000005', v_ing, 30, v_sz) ON CONFLICT DO NOTHING; -- Cloud Hazelnut
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-000000000008', v_ing, 25, v_sz) ON CONFLICT DO NOTHING; -- Hazelnut Mocha

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Condensed Milk';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-000000000006', v_ing, 40, v_sz) ON CONFLICT DO NOTHING; -- Tres Leche
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Evaporated Milk';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-000000000006', v_ing, 30, v_sz) ON CONFLICT DO NOTHING; -- Tres Leche

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Milo Powder';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-000000000007', v_ing, 25, v_sz) ON CONFLICT DO NOTHING; -- Milo Shaken

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Biscoff Spread';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-000000000009', v_ing, 20, v_sz) ON CONFLICT DO NOTHING; -- Biscoff

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Matcha Powder';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-00000000000b', v_ing, 5, v_sz) ON CONFLICT DO NOTHING; -- Matcha Latte

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Strawberry Puree';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-00000000000c', v_ing, 50, v_sz) ON CONFLICT DO NOTHING; -- Strawberry Milk

  SELECT id INTO v_ing FROM ingredients WHERE name = 'Nom Yen Mix';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e2000000-0000-4000-a000-00000000000d', v_ing, 15, v_sz) ON CONFLICT DO NOTHING; -- Nom Yen

  -- ━━━ MILK TEAS — tea base + milk + flavor powder ━━━
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

  -- Per milk tea flavor
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Wintermelon Powder';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e4000000-0000-4000-a000-000000000002', v_ing, 15, v_sz) ON CONFLICT DO NOTHING;
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Brown Sugar Syrup';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e4000000-0000-4000-a000-000000000003', v_ing, 30, v_sz) ON CONFLICT DO NOTHING; -- Okinawa
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Chocolate Powder';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e4000000-0000-4000-a000-000000000004', v_ing, 20, v_sz) ON CONFLICT DO NOTHING; -- Dark Choco MT
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Taro Powder';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e4000000-0000-4000-a000-000000000005', v_ing, 15, v_sz) ON CONFLICT DO NOTHING;
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Cookies Crumble';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e4000000-0000-4000-a000-000000000006', v_ing, 15, v_sz) ON CONFLICT DO NOTHING;

  -- ━━━ REFRESHERS — puree + soda water + ice ━━━
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
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e5000000-0000-4000-a000-000000000001', v_ing, 50, v_sz) ON CONFLICT DO NOTHING;
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Blueberry Puree';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e5000000-0000-4000-a000-000000000002', v_ing, 50, v_sz) ON CONFLICT DO NOTHING;
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Green Apple Puree';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e5000000-0000-4000-a000-000000000003', v_ing, 50, v_sz) ON CONFLICT DO NOTHING;
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Lychee Puree';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e5000000-0000-4000-a000-000000000004', v_ing, 50, v_sz) ON CONFLICT DO NOTHING;
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Honey Peach Puree';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e5000000-0000-4000-a000-000000000005', v_ing, 50, v_sz) ON CONFLICT DO NOTHING;

  -- ━━━ CROFFLES — dough + toppings ━━━
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Croffle Dough';
  FOR v_item IN SELECT id FROM menu_items WHERE category_id = 'c0000000-0000-4000-a000-000000000006' LOOP
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers)
    VALUES (v_item, v_ing, 1, v_sz_food) ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  END LOOP;
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Powdered Sugar';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e6000000-0000-4000-a000-000000000001', v_ing, 5, v_sz_food) ON CONFLICT DO NOTHING; -- Just Croffle
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Marshmallows';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e6000000-0000-4000-a000-000000000002', v_ing, 20, v_sz_food) ON CONFLICT DO NOTHING; -- S'mores
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Chocolate Powder';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e6000000-0000-4000-a000-000000000002', v_ing, 10, v_sz_food) ON CONFLICT DO NOTHING; -- S'mores
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Banana';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e6000000-0000-4000-a000-000000000003', v_ing, 1, v_sz_food) ON CONFLICT DO NOTHING; -- Banatella
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Nutella';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e6000000-0000-4000-a000-000000000003', v_ing, 15, v_sz_food) ON CONFLICT DO NOTHING; -- Banatella
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e6000000-0000-4000-a000-000000000005', v_ing, 15, v_sz_food) ON CONFLICT DO NOTHING; -- Almond Nutella
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Biscoff Spread';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e6000000-0000-4000-a000-000000000004', v_ing, 20, v_sz_food) ON CONFLICT DO NOTHING; -- Biscoff Croffle
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Almonds (sliced)';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e6000000-0000-4000-a000-000000000005', v_ing, 10, v_sz_food) ON CONFLICT DO NOTHING; -- Almond Nutella
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Ham Slice';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e6000000-0000-4000-a000-000000000006', v_ing, 2, v_sz_food) ON CONFLICT DO NOTHING;
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Cheese Slice';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e6000000-0000-4000-a000-000000000006', v_ing, 2, v_sz_food) ON CONFLICT DO NOTHING;

  -- ━━━ SNACKS ━━━
  SELECT id INTO v_ing FROM ingredients WHERE name = 'French Fries (frozen)';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e7000000-0000-4000-a000-000000000001', v_ing, 150, v_sz_food) ON CONFLICT DO NOTHING;
  SELECT id INTO v_ing FROM ingredients WHERE name = 'Frying Oil';
  INSERT INTO menu_item_ingredients VALUES (gen_random_uuid(), 'e7000000-0000-4000-a000-000000000001', v_ing, 50, v_sz_food) ON CONFLICT DO NOTHING;

  RAISE NOTICE 'All base recipes seeded.';
END $$;

-- ════════════════════════════════════════════════════════════
-- 9. TRIGGERS (customization-aware)
-- ════════════════════════════════════════════════════════════

-- 9a. ★ SMART DEDUCTION: base recipe + variant add-ons
CREATE OR REPLACE FUNCTION deduct_inventory_on_order_complete()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
  recipe RECORD;
  vi RECORD;
  size_label text;
  multiplier numeric;
  deduct_qty numeric;
  v_variant jsonb;
  v_label text;
  v_group text;
  replaced_ids uuid[];
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    FOR item IN
      SELECT oi.menu_item_id, oi.quantity, oi.variants
      FROM order_items oi WHERE oi.order_id = NEW.id
    LOOP
      -- 1. Determine size from variants for multiplier
      size_label := 'Medium 16oz';  -- default
      replaced_ids := '{}';

      IF item.variants IS NOT NULL AND jsonb_typeof(item.variants) = 'array' THEN
        SELECT v->>'label' INTO size_label
        FROM jsonb_array_elements(item.variants) v
        WHERE v->>'variant_group' = 'size'
        LIMIT 1;
        IF size_label IS NULL THEN size_label := 'Medium 16oz'; END IF;
      END IF;

      -- 2. Deduct BASE recipe ingredients (with size multiplier)
      FOR recipe IN
        SELECT mii.ingredient_id, mii.quantity_used, mii.size_multipliers
        FROM menu_item_ingredients mii
        WHERE mii.menu_item_id = item.menu_item_id
      LOOP
        multiplier := COALESCE((recipe.size_multipliers->>size_label)::numeric, 1);
        deduct_qty := recipe.quantity_used * multiplier * item.quantity;

        UPDATE ingredients
        SET current_stock = GREATEST(0, current_stock - deduct_qty), updated_at = now()
        WHERE id = recipe.ingredient_id;

        INSERT INTO inventory_logs (ingredient_id, change_amount, change_type, order_id, stock_after)
        SELECT recipe.ingredient_id, -deduct_qty, 'order_deduction', NEW.id,
               (SELECT current_stock FROM ingredients WHERE id = recipe.ingredient_id);
      END LOOP;

      -- 3. ★ Deduct VARIANT-specific ingredients (add-ons, sugar, packaging)
      IF item.variants IS NOT NULL AND jsonb_typeof(item.variants) = 'array' THEN
        FOR v_variant IN SELECT * FROM jsonb_array_elements(item.variants) LOOP
          v_label := v_variant->>'label';
          v_group := v_variant->>'variant_group';

          FOR vi IN
            SELECT ving.ingredient_id, ving.quantity_used, ving.replaces_ingredient_id
            FROM variant_ingredients ving
            WHERE ving.variant_label = v_label
              AND (ving.variant_group = v_group OR v_group IS NULL)
          LOOP
            deduct_qty := vi.quantity_used * item.quantity;

            UPDATE ingredients
            SET current_stock = GREATEST(0, current_stock - deduct_qty), updated_at = now()
            WHERE id = vi.ingredient_id;

            INSERT INTO inventory_logs (ingredient_id, change_amount, change_type, order_id, notes, stock_after)
            SELECT vi.ingredient_id, -deduct_qty, 'order_deduction', NEW.id,
                   'variant: ' || v_label,
                   (SELECT current_stock FROM ingredients WHERE id = vi.ingredient_id);

            -- Track substitution (e.g. dome lid replaces flat lid)
            IF vi.replaces_ingredient_id IS NOT NULL THEN
              replaced_ids := array_append(replaced_ids, vi.replaces_ingredient_id);
            END IF;
          END LOOP;
        END LOOP;
      END IF;

    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_deduct_inventory ON orders;
CREATE TRIGGER trg_deduct_inventory
  AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION deduct_inventory_on_order_complete();

-- 9b. Auto-mark unavailable when stock = 0
CREATE OR REPLACE FUNCTION check_stock_and_mark_unavailable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_stock <= 0 AND OLD.current_stock > 0 THEN
    UPDATE menu_items SET is_available = false
    WHERE id IN (SELECT DISTINCT mii.menu_item_id FROM menu_item_ingredients mii WHERE mii.ingredient_id = NEW.id);
  ELSIF NEW.current_stock > 0 AND OLD.current_stock <= 0 THEN
    UPDATE menu_items SET is_available = true
    WHERE id IN (SELECT DISTINCT mii.menu_item_id FROM menu_item_ingredients mii WHERE mii.ingredient_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_stock_availability ON ingredients;
CREATE TRIGGER trg_stock_availability
  AFTER UPDATE ON ingredients FOR EACH ROW EXECUTE FUNCTION check_stock_and_mark_unavailable();

-- 9c. Award points (tier-aware)
CREATE OR REPLACE FUNCTION award_points_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  base_points integer; multiplier numeric; tier text;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.customer_id IS NOT NULL THEN
    base_points := GREATEST(1, floor(NEW.total / 10));
    SELECT loyalty_tier INTO tier FROM profiles WHERE id = NEW.customer_id;
    CASE tier WHEN 'Gold' THEN multiplier := 1.5; WHEN 'Silver' THEN multiplier := 1.2; ELSE multiplier := 1.0; END CASE;
    UPDATE profiles SET points = points + floor(base_points * multiplier), total_spent = total_spent + NEW.total,
      total_orders = total_orders + 1, last_order_at = now(), updated_at = now() WHERE id = NEW.customer_id;
    UPDATE orders SET points_earned = floor(base_points * multiplier) WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_award_points ON orders;
CREATE TRIGGER trg_award_points AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION award_points_on_completion();

-- 9d. Auto-upgrade loyalty tier
CREATE OR REPLACE FUNCTION update_loyalty_tier()
RETURNS TRIGGER AS $$
DECLARE new_tier text;
BEGIN
  SELECT name INTO new_tier FROM loyalty_tiers WHERE min_points <= NEW.points ORDER BY min_points DESC LIMIT 1;
  IF new_tier IS NOT NULL AND new_tier IS DISTINCT FROM NEW.loyalty_tier THEN NEW.loyalty_tier := new_tier; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_tier ON profiles;
CREATE TRIGGER trg_update_tier BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_loyalty_tier();

-- ════════════════════════════════════════════════════════════
-- 10. UPDATE guard_profile_mutation
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION guard_profile_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.points IS DISTINCT FROM OLD.points OR NEW.total_orders IS DISTINCT FROM OLD.total_orders
     OR NEW.role IS DISTINCT FROM OLD.role OR NEW.loyalty_tier IS DISTINCT FROM OLD.loyalty_tier
     OR NEW.total_spent IS DISTINCT FROM OLD.total_spent THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
      RAISE EXCEPTION 'Cannot modify protected profile fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════
-- 11. VERIFICATION
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE t int; i int; r int; vi int; av int;
BEGIN
  SELECT count(*) INTO t FROM loyalty_tiers;
  SELECT count(*) INTO i FROM ingredients;
  SELECT count(*) INTO r FROM menu_item_ingredients;
  SELECT count(*) INTO vi FROM variant_ingredients;
  SELECT count(*) INTO av FROM item_variants WHERE variant_group = 'add_on';
  RAISE NOTICE '✅ DONE: % tiers, % ingredients, % base recipes, % variant→ingredient maps, % add-on variants', t, i, r, vi, av;
END $$;
