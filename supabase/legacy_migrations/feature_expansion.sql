-- ============================================================
-- CafeOS Feature Expansion Migration
-- Safe to run on existing DB (idempotent where possible)
-- ============================================================

-- ── 1. CLEAN OLD DEMO DATA ─────────────────────────────────

DELETE FROM item_variants WHERE menu_item_id IN (
  SELECT id FROM menu_items WHERE category_id IN (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567801',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567802',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567803',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567804'
  )
);
DELETE FROM menu_items WHERE category_id IN (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567801',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567802',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567803',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567804'
);
DELETE FROM categories WHERE id IN (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567801',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567802',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567803',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567804'
);

-- ── 2. NEW ENUM ─────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE inventory_change_type AS ENUM (
    'order_deduction','manual_restock','manual_adjustment','waste','opening_stock'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. NEW TABLES ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  current_stock NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_stock_alert NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC(10,4) NOT NULL DEFAULT 0,
  supplier TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_item_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_used NUMERIC(10,4) NOT NULL,
  size_multipliers JSONB DEFAULT '{}',
  UNIQUE(menu_item_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
  change_amount NUMERIC(10,2) NOT NULL,
  change_type inventory_change_type NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  stock_after NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  duration_minutes INT GENERATED ALWAYS AS (
    CASE WHEN clock_out IS NOT NULL
    THEN EXTRACT(EPOCH FROM (clock_out - clock_in))::INT / 60
    ELSE NULL END
  ) STORED,
  orders_handled INT DEFAULT 0,
  total_sales NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  min_points INT NOT NULL,
  color TEXT NOT NULL,
  perks JSONB NOT NULL DEFAULT '[]',
  badge_emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 4. NEW COLUMNS ──────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS loyalty_tier TEXT DEFAULT 'Bronze';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorite_items UUID[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_spent NUMERIC(10,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMPTZ;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_redeemed INT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0;

-- Unique constraints for idempotent seeding
DO $$ BEGIN
  ALTER TABLE ingredients ADD CONSTRAINT ingredients_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE item_variants ADD CONSTRAINT item_variants_unique_combo UNIQUE (menu_item_id, variant_group, label);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ── 5. RLS POLICIES ─────────────────────────────────────────

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view ingredients" ON ingredients;
CREATE POLICY "Anyone can view ingredients" ON ingredients FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin can manage ingredients" ON ingredients;
CREATE POLICY "Admin can manage ingredients" ON ingredients FOR ALL USING (get_my_role() = 'admin');

ALTER TABLE menu_item_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view recipes" ON menu_item_ingredients;
CREATE POLICY "Anyone can view recipes" ON menu_item_ingredients FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin can manage recipes" ON menu_item_ingredients;
CREATE POLICY "Admin can manage recipes" ON menu_item_ingredients FOR ALL USING (get_my_role() = 'admin');

ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff and admin can view logs" ON inventory_logs;
CREATE POLICY "Staff and admin can view logs" ON inventory_logs FOR SELECT USING (get_my_role() IN ('staff','admin'));
DROP POLICY IF EXISTS "Staff and admin can insert logs" ON inventory_logs;
CREATE POLICY "Staff and admin can insert logs" ON inventory_logs FOR INSERT WITH CHECK (get_my_role() IN ('staff','admin'));

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view own shifts" ON shifts;
CREATE POLICY "Staff can view own shifts" ON shifts FOR SELECT USING (staff_id = auth.uid());
DROP POLICY IF EXISTS "Admin can view all shifts" ON shifts;
CREATE POLICY "Admin can view all shifts" ON shifts FOR SELECT USING (get_my_role() = 'admin');
DROP POLICY IF EXISTS "Staff can insert own shifts" ON shifts;
CREATE POLICY "Staff can insert own shifts" ON shifts FOR INSERT WITH CHECK (staff_id = auth.uid());
DROP POLICY IF EXISTS "Staff can update own shifts" ON shifts;
CREATE POLICY "Staff can update own shifts" ON shifts FOR UPDATE USING (staff_id = auth.uid());

ALTER TABLE loyalty_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view tiers" ON loyalty_tiers;
CREATE POLICY "Anyone can view tiers" ON loyalty_tiers FOR SELECT USING (true);

-- ── 6. TRIGGERS ─────────────────────────────────────────────

-- 6A: Auto-deduct inventory on order completion
CREATE OR REPLACE FUNCTION deduct_inventory_on_order_complete()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
  ingredient RECORD;
  selected_size TEXT;
  multiplier NUMERIC;
  qty_to_deduct NUMERIC;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    FOR item IN
      SELECT oi.menu_item_id, oi.quantity, oi.variants
      FROM order_items oi WHERE oi.order_id = NEW.id
    LOOP
      -- Extract size from variants JSONB array
      SELECT v->>'label' INTO selected_size
      FROM jsonb_array_elements(COALESCE(item.variants, '[]'::jsonb)) AS v
      WHERE v->>'variant_group' = 'size'
      LIMIT 1;

      FOR ingredient IN
        SELECT mii.ingredient_id, mii.quantity_used, mii.size_multipliers,
               i.current_stock, i.name
        FROM menu_item_ingredients mii
        JOIN ingredients i ON i.id = mii.ingredient_id
        WHERE mii.menu_item_id = item.menu_item_id
      LOOP
        multiplier := 1.0;
        IF selected_size IS NOT NULL AND ingredient.size_multipliers ? selected_size THEN
          multiplier := (ingredient.size_multipliers->>selected_size)::NUMERIC;
        END IF;

        qty_to_deduct := ingredient.quantity_used * multiplier * item.quantity;

        IF qty_to_deduct > 0 THEN
          UPDATE ingredients
          SET current_stock = GREATEST(0, current_stock - qty_to_deduct), updated_at = now()
          WHERE id = ingredient.ingredient_id;

          INSERT INTO inventory_logs (ingredient_id, change_amount, change_type, order_id, stock_after)
          VALUES (ingredient.ingredient_id, -qty_to_deduct, 'order_deduction', NEW.id,
                  GREATEST(0, ingredient.current_stock - qty_to_deduct));
        END IF;
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_order_complete_deduct_inventory ON orders;
CREATE TRIGGER on_order_complete_deduct_inventory
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION deduct_inventory_on_order_complete();

-- 6B: Auto-mark items unavailable when ingredient depleted
CREATE OR REPLACE FUNCTION check_stock_and_mark_unavailable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_stock <= 0 THEN
    UPDATE menu_items SET is_available = false
    WHERE id IN (SELECT menu_item_id FROM menu_item_ingredients WHERE ingredient_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_ingredient_depleted ON ingredients;
CREATE TRIGGER on_ingredient_depleted
  AFTER UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION check_stock_and_mark_unavailable();

-- 6C: Auto-update loyalty tier when points change
CREATE OR REPLACE FUNCTION update_loyalty_tier()
RETURNS TRIGGER AS $$
BEGIN
  NEW.loyalty_tier := CASE
    WHEN NEW.points >= 2000 THEN 'Gold'
    WHEN NEW.points >= 500  THEN 'Silver'
    ELSE 'Bronze'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_points_change_update_tier ON profiles;
CREATE TRIGGER on_points_change_update_tier
  BEFORE UPDATE OF points ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_loyalty_tier();

-- 6D: Updated award_points with tier multiplier
CREATE OR REPLACE FUNCTION award_points_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  points_to_award INT;
  tier TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' AND NEW.customer_id IS NOT NULL THEN
    SELECT loyalty_tier INTO tier FROM profiles WHERE id = NEW.customer_id;

    points_to_award := CASE
      WHEN tier = 'Gold' THEN FLOOR(NEW.total / 10 * 1.5)::INT
      ELSE FLOOR(NEW.total / 10)::INT
    END;

    UPDATE profiles SET
      points = points + points_to_award,
      total_orders = total_orders + 1,
      total_spent = COALESCE(total_spent, 0) + NEW.total,
      last_order_at = now()
    WHERE id = NEW.customer_id;

    UPDATE orders SET points_earned = points_to_award WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6E: Update guard_profile_mutation to protect new loyalty fields
CREATE OR REPLACE FUNCTION public.guard_profile_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor_role user_role;
BEGIN
  IF tg_op <> 'UPDATE' THEN RETURN NEW; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  actor_role := get_my_role();
  IF actor_role = 'admin' THEN RETURN NEW; END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  IF NEW.points IS DISTINCT FROM OLD.points
     OR NEW.total_orders IS DISTINCT FROM OLD.total_orders
     OR NEW.last_check_in IS DISTINCT FROM OLD.last_check_in
     OR NEW.total_spent IS DISTINCT FROM OLD.total_spent
     OR NEW.last_order_at IS DISTINCT FROM OLD.last_order_at
     OR NEW.loyalty_tier IS DISTINCT FROM OLD.loyalty_tier THEN
    RAISE EXCEPTION 'Only trusted backend processes can change loyalty fields';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Email must be changed through Supabase Auth';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at is immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 7. SEED: CATEGORIES ─────────────────────────────────────

INSERT INTO categories (id, name, description, sort_order) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Espresso',          'Arabica-Robusta blend espresso drinks',   1),
  ('10000000-0000-4000-8000-000000000002', 'Signature Drinks',  'House specialty coffee and non-coffee',    2),
  ('10000000-0000-4000-8000-000000000003', 'Frappes',           'Ice blended drinks',                      3),
  ('10000000-0000-4000-8000-000000000004', 'Milk Teas',         'Classic milk tea flavors',                 4),
  ('10000000-0000-4000-8000-000000000005', 'Refreshers',        'Sparkling fruit soda refreshers',          5),
  ('10000000-0000-4000-8000-000000000006', 'Croffles',          'Freshly baked croissant waffles',          6),
  ('10000000-0000-4000-8000-000000000007', 'Snacks',            'Savory sides and bites',                   7)
ON CONFLICT (id) DO NOTHING;

-- ── 8. SEED: MENU ITEMS ─────────────────────────────────────
-- Base price = Medium 16oz (most common size)

INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes, sort_order, tags) VALUES
-- ESPRESSO (base = Medium 16oz price)
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Americano',             'Pure espresso with hot water or over ice',          65, true, true,  3, 1,  '{}'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Coffee Latte',          'Smooth espresso with steamed milk',                 85, true, false, 5, 2,  '{}'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Spanish Latte',         'Espresso with condensed and fresh milk',            100, true, true,  5, 3,  '{}'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Vanilla Latte',         'Classic latte with vanilla syrup',                  100, true, false, 5, 4,  '{}'),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','French Vanilla',        'Rich double vanilla espresso latte',                100, true, false, 5, 5,  '{}'),
('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','Caramel Latte',         'Espresso with caramel and steamed milk',            100, true, false, 5, 6,  '{}'),
('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','Hazelnut Latte',        'Nutty hazelnut-infused latte',                     100, true, false, 5, 7,  '{}'),
('20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001','Macadamia Latte',       'Creamy macadamia nut latte',                       100, true, false, 5, 8,  '{}'),
('20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','Butterscotch Latte',    'Sweet butterscotch espresso latte',                100, true, false, 5, 9,  '{}'),
('20000000-0000-4000-8000-00000000000a','10000000-0000-4000-8000-000000000001','Aussie Latte',          'Double shot with extra creamy milk',                120, true, false, 5, 10, '{}'),
('20000000-0000-4000-8000-00000000000b','10000000-0000-4000-8000-000000000001','White Mocha Latte',     'Espresso with white chocolate mocha',              100, true, false, 5, 11, '{}'),
('20000000-0000-4000-8000-00000000000c','10000000-0000-4000-8000-000000000001','Cinnamon Cappuccino',   'Frothy cappuccino with cinnamon',                  100, true, false, 5, 12, '{}'),
-- SIGNATURE DRINKS (base = Medium 16oz)
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Caramel Macchiato',     'Layered espresso with caramel drizzle',            110, true, true,  5, 1,  '{}'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Caramel Mocha',         'Caramel and chocolate espresso blend',             110, true, false, 5, 2,  '{}'),
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Salted Caramel',        'Sweet and salty caramel espresso',                 110, true, false, 5, 3,  '{}'),
('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','Mocha',                 'Rich chocolate espresso with milk',                110, true, false, 5, 4,  '{}'),
('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','Cloud Hazelnut',        'Airy hazelnut cold foam espresso',                 110, true, false, 6, 5,  '{}'),
('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002','Tres Leche Shaken Espresso','Three-milk shaken espresso',                   110, true, false, 6, 6,  '{}'),
('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000002','Milo Shaken Espresso',  'Milo chocolate shaken espresso',                   110, true, false, 6, 7,  '{}'),
('30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000002','Hazelnut Mocha',        'Hazelnut and chocolate espresso',                  110, true, false, 5, 8,  '{}'),
('30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000002','Biscoff',               'Creamy Biscoff cookie butter latte',               130, true, true,  6, 9,  '{}'),
('30000000-0000-4000-8000-00000000000a','10000000-0000-4000-8000-000000000002','Cocoa Lava',            'Rich dark chocolate with milk',                    100, true, false, 5, 10, '{"non-coffee"}'),
('30000000-0000-4000-8000-00000000000b','10000000-0000-4000-8000-000000000002','Matcha Latte',          'Premium matcha green tea latte',                   100, true, true,  5, 11, '{"non-coffee"}'),
('30000000-0000-4000-8000-00000000000c','10000000-0000-4000-8000-000000000002','Strawberry Milk',       'Sweet strawberry milk drink',                       90, true, false, 4, 12, '{"non-coffee"}'),
('30000000-0000-4000-8000-00000000000d','10000000-0000-4000-8000-000000000002','Nom Yen (Pink Milk)',   'Thai-style pink milk',                              90, true, false, 4, 13, '{"non-coffee"}'),
-- FRAPPES NON-COFFEE (base = Medium 16oz)
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Vanilla Milkshake',     'Creamy vanilla ice blended',                       110, true, false, 6, 1,  '{"non-coffee","frappe"}'),
('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','Cookies & Cream Frappe','Cookies and cream ice blended',                    110, true, true,  6, 2,  '{"non-coffee","frappe"}'),
('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','Dark Chocolate Frappe', 'Rich dark chocolate frappe',                       110, true, false, 6, 3,  '{"non-coffee","frappe"}'),
('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','Matcha Frappe',         'Matcha green tea ice blended',                     110, true, false, 6, 4,  '{"non-coffee","frappe"}'),
('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000003','Strawberries & Cream',  'Strawberry cream frappe',                          110, true, false, 6, 5,  '{"non-coffee","frappe"}'),
-- FRAPPES COFFEE (base = Medium 16oz)
('40000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000003','Caramel Frappe',        'Caramel espresso ice blended',                     120, true, false, 6, 6,  '{"coffee","frappe"}'),
('40000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000003','Mocha Frappe',          'Mocha espresso ice blended',                       120, true, false, 6, 7,  '{"coffee","frappe"}'),
('40000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000003','Java Chip',             'Java chip espresso ice blended',                   120, true, false, 6, 8,  '{"coffee","frappe"}'),
('40000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000003','Salted Caramel Frappe', 'Salted caramel espresso frappe',                   120, true, false, 6, 9,  '{"coffee","frappe"}'),
('40000000-0000-4000-8000-00000000000a','10000000-0000-4000-8000-000000000003','Biscoff Frappe',        'Biscoff cookie butter frappe',                     130, true, false, 7, 10, '{"coffee","frappe"}'),
-- MILK TEAS (base = Medium 16oz)
('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Classic Milk Tea',      'Traditional black milk tea',                        55, true, true,  4, 1,  '{}'),
('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','Wintermelon Milk Tea',  'Wintermelon flavored milk tea',                     55, true, false, 4, 2,  '{}'),
('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','Okinawa Milk Tea',      'Okinawa brown sugar milk tea',                      55, true, false, 4, 3,  '{}'),
('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','Dark Chocolate Milk Tea','Dark chocolate milk tea',                           55, true, false, 4, 4,  '{}'),
('50000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004','Taro Milk Tea',         'Purple taro milk tea',                              55, true, false, 4, 5,  '{}'),
('50000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000004','Cookies & Cream Milk Tea','Cookies and cream milk tea',                       55, true, false, 4, 6,  '{}'),
-- REFRESHERS (base = Medium 16oz)
('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','Strawberry Soda',       'Sparkling strawberry refresher',                    70, true, false, 3, 1,  '{}'),
('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','Blueberry Soda',        'Sparkling blueberry refresher',                     70, true, false, 3, 2,  '{}'),
('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','Green Apple Soda',      'Sparkling green apple refresher',                   70, true, false, 3, 3,  '{}'),
('60000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005','Lychee Soda',           'Sparkling lychee refresher',                        70, true, false, 3, 4,  '{}'),
('60000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','Honey Peach Soda',      'Sparkling honey peach refresher',                   70, true, false, 3, 5,  '{}'),
-- CROFFLES
('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006','Just Croffle',          'Plain croffle with powdered sugar',                 100, true, true,  8, 1,  '{}'),
('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000006','S''mores Croffle',      'Croffle with marshmallows and chocolate drizzle',   125, true, false, 9, 2,  '{}'),
('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006','Banatella',             'Croffle with banana and Nutella',                   145, true, false, 9, 3,  '{}'),
('70000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000006','Biscoff Croffle',       'Croffle with Biscoff spread and biscuit',           160, true, false, 9, 4,  '{}'),
('70000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000006','Almond Nutella',        'Croffle with almonds and Nutella',                  125, true, false, 9, 5,  '{}'),
('70000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006','Ham & Cheese Croffle',  'Savory croffle with ham and mozzarella',            160, true, false, 9, 6,  '{}'),
-- SNACKS
('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','Flavored Fries',        'Crispy fries with your choice of seasoning',        85, true, false, 6, 1,  '{}'),
('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000007','Nachos',                'Coming soon',                                        0, false, false, 5, 2,  '{}'),
('80000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000007','Chicken Pop',           'Coming soon',                                        0, false, false, 5, 3,  '{}')
ON CONFLICT (id) DO NOTHING;

-- ── 9. SEED: SIZE VARIANTS ──────────────────────────────────
-- Espresso drinks: Hot 12oz / Medium 16oz (default) / Large 22oz

INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order) VALUES
-- Americano (Hot +10, Large +10)
('20000000-0000-4000-8000-000000000001','size','Hot 12oz',10,false,1),('20000000-0000-4000-8000-000000000001','size','Medium 16oz',0,true,2),('20000000-0000-4000-8000-000000000001','size','Large 22oz',10,false,3),
-- Coffee Latte (Hot +25, Large +15)
('20000000-0000-4000-8000-000000000002','size','Hot 12oz',25,false,1),('20000000-0000-4000-8000-000000000002','size','Medium 16oz',0,true,2),('20000000-0000-4000-8000-000000000002','size','Large 22oz',15,false,3),
-- Spanish Latte (Hot +20, Large +10)
('20000000-0000-4000-8000-000000000003','size','Hot 12oz',20,false,1),('20000000-0000-4000-8000-000000000003','size','Medium 16oz',0,true,2),('20000000-0000-4000-8000-000000000003','size','Large 22oz',10,false,3),
-- Vanilla Latte (Hot +20, Large +10)
('20000000-0000-4000-8000-000000000004','size','Hot 12oz',20,false,1),('20000000-0000-4000-8000-000000000004','size','Medium 16oz',0,true,2),('20000000-0000-4000-8000-000000000004','size','Large 22oz',10,false,3),
-- French Vanilla (Hot +20, Large +10)
('20000000-0000-4000-8000-000000000005','size','Hot 12oz',20,false,1),('20000000-0000-4000-8000-000000000005','size','Medium 16oz',0,true,2),('20000000-0000-4000-8000-000000000005','size','Large 22oz',10,false,3),
-- Caramel Latte (Hot +20, Large +10)
('20000000-0000-4000-8000-000000000006','size','Hot 12oz',20,false,1),('20000000-0000-4000-8000-000000000006','size','Medium 16oz',0,true,2),('20000000-0000-4000-8000-000000000006','size','Large 22oz',10,false,3),
-- Hazelnut Latte (Hot +20, Large +10)
('20000000-0000-4000-8000-000000000007','size','Hot 12oz',20,false,1),('20000000-0000-4000-8000-000000000007','size','Medium 16oz',0,true,2),('20000000-0000-4000-8000-000000000007','size','Large 22oz',10,false,3),
-- Macadamia Latte (Hot +20, Large +20)
('20000000-0000-4000-8000-000000000008','size','Hot 12oz',20,false,1),('20000000-0000-4000-8000-000000000008','size','Medium 16oz',0,true,2),('20000000-0000-4000-8000-000000000008','size','Large 22oz',20,false,3),
-- Butterscotch Latte (Hot +20, Large +20)
('20000000-0000-4000-8000-000000000009','size','Hot 12oz',20,false,1),('20000000-0000-4000-8000-000000000009','size','Medium 16oz',0,true,2),('20000000-0000-4000-8000-000000000009','size','Large 22oz',20,false,3),
-- Aussie Latte (NO HOT, Large +10)
('20000000-0000-4000-8000-00000000000a','size','Medium 16oz',0,true,1),('20000000-0000-4000-8000-00000000000a','size','Large 22oz',10,false,2),
-- White Mocha Latte (Hot +25, Large +20)
('20000000-0000-4000-8000-00000000000b','size','Hot 12oz',25,false,1),('20000000-0000-4000-8000-00000000000b','size','Medium 16oz',0,true,2),('20000000-0000-4000-8000-00000000000b','size','Large 22oz',20,false,3),
-- Cinnamon Cappuccino (Hot +25, Large +20)
('20000000-0000-4000-8000-00000000000c','size','Hot 12oz',25,false,1),('20000000-0000-4000-8000-00000000000c','size','Medium 16oz',0,true,2),('20000000-0000-4000-8000-00000000000c','size','Large 22oz',20,false,3),
-- SIGNATURE: Caramel Macchiato (Hot +20, Large +15)
('30000000-0000-4000-8000-000000000001','size','Hot 12oz',20,false,1),('30000000-0000-4000-8000-000000000001','size','Medium 16oz',0,true,2),('30000000-0000-4000-8000-000000000001','size','Large 22oz',15,false,3),
-- Caramel Mocha
('30000000-0000-4000-8000-000000000002','size','Hot 12oz',20,false,1),('30000000-0000-4000-8000-000000000002','size','Medium 16oz',0,true,2),('30000000-0000-4000-8000-000000000002','size','Large 22oz',15,false,3),
-- Salted Caramel
('30000000-0000-4000-8000-000000000003','size','Hot 12oz',20,false,1),('30000000-0000-4000-8000-000000000003','size','Medium 16oz',0,true,2),('30000000-0000-4000-8000-000000000003','size','Large 22oz',15,false,3),
-- Mocha
('30000000-0000-4000-8000-000000000004','size','Hot 12oz',20,false,1),('30000000-0000-4000-8000-000000000004','size','Medium 16oz',0,true,2),('30000000-0000-4000-8000-000000000004','size','Large 22oz',15,false,3),
-- Cloud Hazelnut
('30000000-0000-4000-8000-000000000005','size','Hot 12oz',20,false,1),('30000000-0000-4000-8000-000000000005','size','Medium 16oz',0,true,2),('30000000-0000-4000-8000-000000000005','size','Large 22oz',15,false,3),
-- Tres Leche SE (NO HOT)
('30000000-0000-4000-8000-000000000006','size','Medium 16oz',0,true,1),('30000000-0000-4000-8000-000000000006','size','Large 22oz',15,false,2),
-- Milo SE (NO HOT)
('30000000-0000-4000-8000-000000000007','size','Medium 16oz',0,true,1),('30000000-0000-4000-8000-000000000007','size','Large 22oz',15,false,2),
-- Hazelnut Mocha (Hot +20, Large +15)
('30000000-0000-4000-8000-000000000008','size','Hot 12oz',20,false,1),('30000000-0000-4000-8000-000000000008','size','Medium 16oz',0,true,2),('30000000-0000-4000-8000-000000000008','size','Large 22oz',15,false,3),
-- Biscoff sig (NO HOT, Large +15)
('30000000-0000-4000-8000-000000000009','size','Medium 16oz',0,true,1),('30000000-0000-4000-8000-000000000009','size','Large 22oz',15,false,2),
-- Cocoa Lava (Hot +20, Large +15)
('30000000-0000-4000-8000-00000000000a','size','Hot 12oz',20,false,1),('30000000-0000-4000-8000-00000000000a','size','Medium 16oz',0,true,2),('30000000-0000-4000-8000-00000000000a','size','Large 22oz',15,false,3),
-- Matcha Latte sig (Hot +20, Large +15)
('30000000-0000-4000-8000-00000000000b','size','Hot 12oz',20,false,1),('30000000-0000-4000-8000-00000000000b','size','Medium 16oz',0,true,2),('30000000-0000-4000-8000-00000000000b','size','Large 22oz',15,false,3),
-- Strawberry Milk (NO HOT, Large +10)
('30000000-0000-4000-8000-00000000000c','size','Medium 16oz',0,true,1),('30000000-0000-4000-8000-00000000000c','size','Large 22oz',10,false,2),
-- Nom Yen (NO HOT, Large +10)
('30000000-0000-4000-8000-00000000000d','size','Medium 16oz',0,true,1),('30000000-0000-4000-8000-00000000000d','size','Large 22oz',10,false,2),
-- FRAPPES NON-COFFEE (Medium/Large only, Large +15)
('40000000-0000-4000-8000-000000000001','size','Medium 16oz',0,true,1),('40000000-0000-4000-8000-000000000001','size','Large 22oz',15,false,2),
('40000000-0000-4000-8000-000000000002','size','Medium 16oz',0,true,1),('40000000-0000-4000-8000-000000000002','size','Large 22oz',15,false,2),
('40000000-0000-4000-8000-000000000003','size','Medium 16oz',0,true,1),('40000000-0000-4000-8000-000000000003','size','Large 22oz',15,false,2),
('40000000-0000-4000-8000-000000000004','size','Medium 16oz',0,true,1),('40000000-0000-4000-8000-000000000004','size','Large 22oz',15,false,2),
('40000000-0000-4000-8000-000000000005','size','Medium 16oz',0,true,1),('40000000-0000-4000-8000-000000000005','size','Large 22oz',15,false,2),
-- FRAPPES COFFEE (Large +10 except Biscoff +20)
('40000000-0000-4000-8000-000000000006','size','Medium 16oz',0,true,1),('40000000-0000-4000-8000-000000000006','size','Large 22oz',10,false,2),
('40000000-0000-4000-8000-000000000007','size','Medium 16oz',0,true,1),('40000000-0000-4000-8000-000000000007','size','Large 22oz',10,false,2),
('40000000-0000-4000-8000-000000000008','size','Medium 16oz',0,true,1),('40000000-0000-4000-8000-000000000008','size','Large 22oz',10,false,2),
('40000000-0000-4000-8000-000000000009','size','Medium 16oz',0,true,1),('40000000-0000-4000-8000-000000000009','size','Large 22oz',10,false,2),
('40000000-0000-4000-8000-00000000000a','size','Medium 16oz',0,true,1),('40000000-0000-4000-8000-00000000000a','size','Large 22oz',20,false,2),
-- MILK TEAS (Large +10)
('50000000-0000-4000-8000-000000000001','size','Medium 16oz',0,true,1),('50000000-0000-4000-8000-000000000001','size','Large 22oz',10,false,2),
('50000000-0000-4000-8000-000000000002','size','Medium 16oz',0,true,1),('50000000-0000-4000-8000-000000000002','size','Large 22oz',10,false,2),
('50000000-0000-4000-8000-000000000003','size','Medium 16oz',0,true,1),('50000000-0000-4000-8000-000000000003','size','Large 22oz',10,false,2),
('50000000-0000-4000-8000-000000000004','size','Medium 16oz',0,true,1),('50000000-0000-4000-8000-000000000004','size','Large 22oz',10,false,2),
('50000000-0000-4000-8000-000000000005','size','Medium 16oz',0,true,1),('50000000-0000-4000-8000-000000000005','size','Large 22oz',10,false,2),
('50000000-0000-4000-8000-000000000006','size','Medium 16oz',0,true,1),('50000000-0000-4000-8000-000000000006','size','Large 22oz',10,false,2),
-- REFRESHERS (Large +15)
('60000000-0000-4000-8000-000000000001','size','Medium 16oz',0,true,1),('60000000-0000-4000-8000-000000000001','size','Large 22oz',15,false,2),
('60000000-0000-4000-8000-000000000002','size','Medium 16oz',0,true,1),('60000000-0000-4000-8000-000000000002','size','Large 22oz',15,false,2),
('60000000-0000-4000-8000-000000000003','size','Medium 16oz',0,true,1),('60000000-0000-4000-8000-000000000003','size','Large 22oz',15,false,2),
('60000000-0000-4000-8000-000000000004','size','Medium 16oz',0,true,1),('60000000-0000-4000-8000-000000000004','size','Large 22oz',15,false,2),
('60000000-0000-4000-8000-000000000005','size','Medium 16oz',0,true,1),('60000000-0000-4000-8000-000000000005','size','Large 22oz',15,false,2),
-- FRIES: flavor variants
('80000000-0000-4000-8000-000000000001','flavor','BBQ',0,true,1),
('80000000-0000-4000-8000-000000000001','flavor','Cheese',0,false,2),
('80000000-0000-4000-8000-000000000001','flavor','Sour Cream',0,false,3)
ON CONFLICT (menu_item_id, variant_group, label) DO NOTHING;

-- ── 10. SEED: INGREDIENTS ───────────────────────────────────

INSERT INTO ingredients (id, name, unit, current_stock, min_stock_alert, cost_per_unit, supplier) VALUES
-- Coffee & Base
('90000000-0000-4000-8000-000000000001','Espresso Beans',     'g',   5000,  500, 1.50,'Local roaster'),
('90000000-0000-4000-8000-000000000002','Fresh Milk',          'ml', 20000, 2000, 0.08,'Dairy supplier'),
('90000000-0000-4000-8000-000000000003','Condensed Milk',      'ml',  5000,  500, 0.15,NULL),
('90000000-0000-4000-8000-000000000004','Evaporated Milk',     'ml',  3000,  300, 0.12,NULL),
-- Syrups
('90000000-0000-4000-8000-000000000005','Vanilla Syrup',       'ml',  3000,  300, 0.20,NULL),
('90000000-0000-4000-8000-000000000006','Caramel Syrup',       'ml',  3000,  300, 0.20,NULL),
('90000000-0000-4000-8000-000000000007','Hazelnut Syrup',      'ml',  2000,  200, 0.22,NULL),
('90000000-0000-4000-8000-000000000008','Butterscotch Syrup',  'ml',  1500,  150, 0.22,NULL),
('90000000-0000-4000-8000-000000000009','Macadamia Syrup',     'ml',  1500,  150, 0.25,NULL),
('90000000-0000-4000-8000-00000000000a','White Mocha Syrup',   'ml',  2000,  200, 0.25,NULL),
('90000000-0000-4000-8000-00000000000b','Biscoff Syrup',       'ml',  1000,  100, 0.35,NULL),
('90000000-0000-4000-8000-00000000000c','Strawberry Syrup',    'ml',  2000,  200, 0.18,NULL),
('90000000-0000-4000-8000-00000000000d','Blueberry Syrup',     'ml',  1500,  150, 0.18,NULL),
('90000000-0000-4000-8000-00000000000e','Lychee Syrup',        'ml',  1500,  150, 0.20,NULL),
('90000000-0000-4000-8000-00000000000f','Peach Syrup',         'ml',  1500,  150, 0.20,NULL),
('90000000-0000-4000-8000-000000000010','Green Apple Syrup',   'ml',  1500,  150, 0.18,NULL),
('90000000-0000-4000-8000-000000000011','Wintermelon Syrup',   'ml',  2000,  200, 0.18,NULL),
('90000000-0000-4000-8000-000000000012','Taro Syrup',          'ml',  2000,  200, 0.22,NULL),
('90000000-0000-4000-8000-000000000013','Okinawa Syrup',       'ml',  1500,  150, 0.22,NULL),
-- Powders
('90000000-0000-4000-8000-000000000014','Matcha Powder',       'g',   1000,  100, 1.20,NULL),
('90000000-0000-4000-8000-000000000015','Cocoa Powder',        'g',   1000,  100, 0.50,NULL),
('90000000-0000-4000-8000-000000000016','Milo Powder',         'g',   2000,  200, 0.45,NULL),
('90000000-0000-4000-8000-000000000017','Cookies & Cream Powder','g', 2000,  200, 0.60,NULL),
('90000000-0000-4000-8000-000000000018','Java Chip Powder',    'g',   1500,  150, 0.70,NULL),
('90000000-0000-4000-8000-000000000019','Cinnamon Powder',     'g',    500,   50, 0.80,NULL),
-- Frappe & Ice
('90000000-0000-4000-8000-00000000001a','Frappe Base Powder',  'g',   5000,  500, 0.40,NULL),
('90000000-0000-4000-8000-00000000001b','Ice Cubes',           'g',  10000, 1000, 0.01,NULL),
-- Tea & Soda
('90000000-0000-4000-8000-00000000001c','Black Tea',           'g',   2000,  200, 0.30,NULL),
('90000000-0000-4000-8000-00000000001d','Soda Water',          'ml', 15000, 1500, 0.05,NULL),
-- Croffles
('90000000-0000-4000-8000-00000000001e','Croffle Dough',       'pcs',  100,   20,25.00,NULL),
('90000000-0000-4000-8000-00000000001f','Nutella',             'g',   2000,  200, 0.80,NULL),
('90000000-0000-4000-8000-000000000020','Biscoff Spread',      'g',   1000,  100, 1.00,NULL),
('90000000-0000-4000-8000-000000000021','Banana',              'pcs',   50,   10, 8.00,NULL),
('90000000-0000-4000-8000-000000000022','Almonds',             'g',    500,   50, 1.20,NULL),
('90000000-0000-4000-8000-000000000023','Marshmallows',        'g',    500,   50, 0.60,NULL),
('90000000-0000-4000-8000-000000000024','Chocolate Drizzle',   'ml',  1000,  100, 0.40,NULL),
('90000000-0000-4000-8000-000000000025','Ham Slices',          'pcs',   50,   10,15.00,NULL),
('90000000-0000-4000-8000-000000000026','Mozzarella',          'g',    500,   50, 0.90,NULL),
('90000000-0000-4000-8000-000000000027','Powdered Sugar',      'g',   2000,  200, 0.05,NULL),
-- Snacks
('90000000-0000-4000-8000-000000000028','Potato Fries',        'g',   5000,  500, 0.15,NULL),
('90000000-0000-4000-8000-000000000029','BBQ Seasoning',       'g',    500,   50, 0.40,NULL),
('90000000-0000-4000-8000-00000000002a','Cheese Seasoning',    'g',    500,   50, 0.40,NULL),
('90000000-0000-4000-8000-00000000002b','Sour Cream Seasoning','g',    500,   50, 0.40,NULL),
-- Packaging
('90000000-0000-4000-8000-00000000002c','Cups Medium 16oz',    'pcs',  500,  100, 3.50,NULL),
('90000000-0000-4000-8000-00000000002d','Cups Large 22oz',     'pcs',  500,  100, 4.00,NULL),
('90000000-0000-4000-8000-00000000002e','Cups Hot 12oz',       'pcs',  300,   60, 3.00,NULL),
('90000000-0000-4000-8000-00000000002f','Lids',                'pcs', 1000,  200, 1.50,NULL),
('90000000-0000-4000-8000-000000000030','Straws',              'pcs', 1000,  200, 0.50,NULL),
('90000000-0000-4000-8000-000000000031','Paper Bags',          'pcs',  300,   50, 4.00,NULL)
ON CONFLICT (name) DO NOTHING;

-- ── 11. SEED: RECIPES (menu_item_ingredients) ───────────────
-- Abbreviations in comments: B=beans, M=milk, I=ice, CM=cup_med, CL=cup_lg, CH=cup_hot, L=lid, S=straw
-- Size multipliers: 3sz = {"Hot 12oz":0.75,"Large 22oz":1.3}  2sz = {"Large 22oz":1.3}
-- Cup multipliers: cm_3 = {"Hot 12oz":0,"Large 22oz":0}  cl_3 = {"Hot 12oz":0,"Medium 16oz":0}
--                  ch_3 = {"Medium 16oz":0,"Large 22oz":0}  cm_2 = {"Large 22oz":0}  cl_2 = {"Medium 16oz":0}

INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_used, size_multipliers) VALUES
-- ═══ ESPRESSO ═══

-- Americano (single shot 18g, no milk, just water + ice for iced)
('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',18,'{}'),
('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002f',1,'{}'),
('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),

-- Coffee Latte (double shot, milk)
('20000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001',36,'{}'),
('20000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002',200,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('20000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('20000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002f',1,'{}'),
('20000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),

-- Spanish Latte (espresso + condensed + fresh milk)
('20000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000001',36,'{}'),
('20000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000003',30,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000002',120,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('20000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('20000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002f',1,'{}'),
('20000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),

-- Vanilla Latte (latte + vanilla syrup 30ml)
('20000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000001',36,'{}'),
('20000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000002',200,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000005',30,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('20000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('20000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002f',1,'{}'),
('20000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),

-- French Vanilla (latte + double vanilla 45ml)
('20000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000001',36,'{}'),
('20000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000002',200,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000005',45,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('20000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('20000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002f',1,'{}'),
('20000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),

-- Caramel/Hazelnut/Macadamia/Butterscotch/White Mocha Lattes — same pattern, different syrup
-- Caramel Latte
('20000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000001',36,'{}'),
('20000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000002',200,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000006',30,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('20000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('20000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002f',1,'{}'),
('20000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Hazelnut Latte
('20000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000001',36,'{}'),
('20000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000002',200,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000007',30,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('20000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('20000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000002f',1,'{}'),
('20000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Macadamia Latte
('20000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000001',36,'{}'),
('20000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000002',200,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000009',30,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('20000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('20000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000002f',1,'{}'),
('20000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Butterscotch Latte
('20000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000001',36,'{}'),
('20000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000002',200,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000008',30,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('20000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('20000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000002f',1,'{}'),
('20000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Aussie Latte (NO HOT, 2 sizes only, extra milk 250ml)
('20000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-000000000001',36,'{}'),
('20000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-000000000002',250,'{"Large 22oz":1.3}'),
('20000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000001b',200,'{}'),
('20000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('20000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('20000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000002f',1,'{}'),
('20000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-000000000030',1,'{}'),
-- White Mocha Latte
('20000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-000000000001',36,'{}'),
('20000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-000000000002',200,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-00000000000a',30,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('20000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('20000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-00000000002f',1,'{}'),
('20000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Cinnamon Cappuccino
('20000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-000000000001',36,'{}'),
('20000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-000000000002',150,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('20000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-000000000019',3,'{}'),
('20000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('20000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('20000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('20000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-00000000002f',1,'{}'),
('20000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),

-- ═══ SIGNATURE DRINKS ═══

-- Caramel Macchiato (espresso + milk + caramel)
('30000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',36,'{}'),
('30000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002',200,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000006',30,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('30000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('30000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Caramel Mocha (espresso + milk + caramel + cocoa)
('30000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001',36,'{}'),
('30000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002',180,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000006',30,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000015',10,'{}'),
('30000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('30000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('30000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Salted Caramel (espresso + milk + caramel 45ml)
('30000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000001',36,'{}'),
('30000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000002',200,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000006',45,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('30000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('30000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Mocha (espresso + milk + cocoa 15g)
('30000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000001',36,'{}'),
('30000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000002',180,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000015',15,'{}'),
('30000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('30000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('30000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Cloud Hazelnut (espresso + milk + hazelnut)
('30000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000001',36,'{}'),
('30000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000002',200,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000007',30,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('30000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('30000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Tres Leche SE (NO HOT, espresso + 3 milks)
('30000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000001',36,'{}'),
('30000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000002',100,'{"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000003',30,'{"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000004',30,'{"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000001b',200,'{}'),
('30000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('30000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Milo SE (NO HOT, espresso + milo + milk)
('30000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000001',36,'{}'),
('30000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000016',15,'{}'),
('30000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000001b',200,'{}'),
('30000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('30000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Hazelnut Mocha (espresso + milk + hazelnut + cocoa)
('30000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000001',36,'{}'),
('30000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000002',180,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000007',30,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000015',10,'{}'),
('30000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('30000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('30000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Biscoff sig (NO HOT, espresso + milk + biscoff syrup + spread)
('30000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000001',36,'{}'),
('30000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000002',200,'{"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000000b',30,'{"Large 22oz":1.3}'),
('30000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000020',10,'{}'),
('30000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000001b',200,'{}'),
('30000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('30000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('30000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Cocoa Lava non-coffee (cocoa + milk + choco drizzle)
('30000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-000000000015',20,'{}'),
('30000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-000000000002',250,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-000000000024',15,'{}'),
('30000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('30000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('30000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Matcha Latte sig non-coffee (matcha + milk)
('30000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-000000000014',8,'{}'),
('30000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-000000000002',250,'{"Hot 12oz":0.75,"Large 22oz":1.3}'),
('30000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-00000000001b',200,'{"Hot 12oz":0}'),
('30000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-00000000002c',1,'{"Hot 12oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-00000000002d',1,'{"Hot 12oz":0,"Medium 16oz":0}'),
('30000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-00000000002e',1,'{"Medium 16oz":0,"Large 22oz":0}'),
('30000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-000000000030',1,'{"Hot 12oz":0}'),
-- Strawberry Milk (NO HOT, strawberry syrup + milk)
('30000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-00000000000c',45,'{"Large 22oz":1.3}'),
('30000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-000000000002',200,'{"Large 22oz":1.3}'),
('30000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-00000000001b',200,'{}'),
('30000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('30000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('30000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-00000000000c','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Nom Yen (NO HOT, fresh milk + condensed + evaporated + strawberry syrup)
('30000000-0000-4000-8000-00000000000d','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('30000000-0000-4000-8000-00000000000d','90000000-0000-4000-8000-000000000003',30,'{"Large 22oz":1.3}'),
('30000000-0000-4000-8000-00000000000d','90000000-0000-4000-8000-000000000004',30,'{"Large 22oz":1.3}'),
('30000000-0000-4000-8000-00000000000d','90000000-0000-4000-8000-00000000000c',15,'{}'),
('30000000-0000-4000-8000-00000000000d','90000000-0000-4000-8000-00000000001b',200,'{}'),
('30000000-0000-4000-8000-00000000000d','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('30000000-0000-4000-8000-00000000000d','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('30000000-0000-4000-8000-00000000000d','90000000-0000-4000-8000-00000000002f',1,'{}'),
('30000000-0000-4000-8000-00000000000d','90000000-0000-4000-8000-000000000030',1,'{}'),

-- ═══ FRAPPES NON-COFFEE ═══
-- Common: frappe_base(30g) + ice(200g) + milk(150ml) + cups + lid + straw + specific flavor

-- Vanilla Milkshake
('40000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000001a',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000001b',200,'{}'),
('40000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000005',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('40000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('40000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002f',1,'{}'),
('40000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Cookies & Cream Frappe
('40000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000001a',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000001b',200,'{}'),
('40000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000017',20,'{}'),
('40000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('40000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('40000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002f',1,'{}'),
('40000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Dark Chocolate Frappe
('40000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000001a',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000001b',200,'{}'),
('40000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000015',15,'{}'),
('40000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('40000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('40000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002f',1,'{}'),
('40000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Matcha Frappe
('40000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000001a',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000001b',200,'{}'),
('40000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000014',8,'{}'),
('40000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('40000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('40000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002f',1,'{}'),
('40000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Strawberries & Cream Frappe
('40000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000001a',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000001b',200,'{}'),
('40000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000000c',45,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('40000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('40000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002f',1,'{}'),
('40000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000030',1,'{}'),

-- ═══ FRAPPES COFFEE ═══
-- Common: espresso(36g) + frappe_base(30g) + ice(200g) + milk(150ml) + cups + lid + straw

-- Caramel Frappe
('40000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000001',36,'{}'),
('40000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000001a',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000001b',200,'{}'),
('40000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000006',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('40000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('40000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002f',1,'{}'),
('40000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Mocha Frappe
('40000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000001',36,'{}'),
('40000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000001a',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000001b',200,'{}'),
('40000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000015',15,'{}'),
('40000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('40000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('40000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-00000000002f',1,'{}'),
('40000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Java Chip
('40000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000001',36,'{}'),
('40000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000001a',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000001b',200,'{}'),
('40000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000018',20,'{}'),
('40000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('40000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('40000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-00000000002f',1,'{}'),
('40000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Salted Caramel Frappe
('40000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000001',36,'{}'),
('40000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000001a',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000001b',200,'{}'),
('40000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000006',45,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('40000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('40000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-00000000002f',1,'{}'),
('40000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Biscoff Frappe
('40000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-000000000001',36,'{}'),
('40000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000001a',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000001b',200,'{}'),
('40000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000000b',30,'{"Large 22oz":1.3}'),
('40000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-000000000020',10,'{}'),
('40000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('40000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('40000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000002f',1,'{}'),
('40000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-000000000030',1,'{}'),

-- ═══ MILK TEAS ═══
-- Common: tea_black(5g) + milk(150ml) + ice(200g) + cups + lid + straw

-- Classic
('50000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000001c',5,'{}'),
('50000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('50000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000001b',200,'{}'),
('50000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('50000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('50000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002f',1,'{}'),
('50000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Wintermelon
('50000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000001c',5,'{}'),
('50000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('50000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000011',30,'{"Large 22oz":1.3}'),
('50000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000001b',200,'{}'),
('50000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('50000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('50000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002f',1,'{}'),
('50000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Okinawa
('50000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000001c',5,'{}'),
('50000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('50000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000013',30,'{"Large 22oz":1.3}'),
('50000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000001b',200,'{}'),
('50000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('50000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('50000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002f',1,'{}'),
('50000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Dark Choco Milk Tea
('50000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000001c',5,'{}'),
('50000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('50000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000015',10,'{}'),
('50000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000001b',200,'{}'),
('50000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('50000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('50000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002f',1,'{}'),
('50000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Taro
('50000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000001c',5,'{}'),
('50000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('50000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000012',30,'{"Large 22oz":1.3}'),
('50000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000001b',200,'{}'),
('50000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('50000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('50000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002f',1,'{}'),
('50000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Cookies & Cream Milk Tea
('50000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000001c',5,'{}'),
('50000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000002',150,'{"Large 22oz":1.3}'),
('50000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000017',15,'{}'),
('50000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000001b',200,'{}'),
('50000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('50000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('50000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000002f',1,'{}'),
('50000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000030',1,'{}'),

-- ═══ REFRESHERS ═══
-- Common: soda_water(200ml) + ice(150g) + cups + lid + straw

-- Strawberry Soda
('60000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000001d',200,'{"Large 22oz":1.3}'),
('60000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000000c',45,'{"Large 22oz":1.3}'),
('60000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000001b',150,'{}'),
('60000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('60000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('60000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000002f',1,'{}'),
('60000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Blueberry Soda
('60000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000001d',200,'{"Large 22oz":1.3}'),
('60000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000000d',45,'{"Large 22oz":1.3}'),
('60000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000001b',150,'{}'),
('60000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('60000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('60000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000002f',1,'{}'),
('60000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Green Apple Soda
('60000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000001d',200,'{"Large 22oz":1.3}'),
('60000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000010',45,'{"Large 22oz":1.3}'),
('60000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000001b',150,'{}'),
('60000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('60000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('60000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000002f',1,'{}'),
('60000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Lychee Soda
('60000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000001d',200,'{"Large 22oz":1.3}'),
('60000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000000e',45,'{"Large 22oz":1.3}'),
('60000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000001b',150,'{}'),
('60000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('60000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('60000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000002f',1,'{}'),
('60000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000030',1,'{}'),
-- Honey Peach Soda
('60000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000001d',200,'{"Large 22oz":1.3}'),
('60000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000000f',45,'{"Large 22oz":1.3}'),
('60000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000001b',150,'{}'),
('60000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002c',1,'{"Large 22oz":0}'),
('60000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002d',1,'{"Medium 16oz":0}'),
('60000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000002f',1,'{}'),
('60000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000030',1,'{}'),

-- ═══ CROFFLES ═══
-- Common: croffle_dough(1pc) + powdered_sugar(5g) + paper_bag(1pc)

-- Just Croffle
('70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-00000000001e',1,'{}'),
('70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000027',5,'{}'),
('70000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000031',1,'{}'),
-- S'mores (+ marshmallows 20g + choco drizzle 15ml)
('70000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-00000000001e',1,'{}'),
('70000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000027',5,'{}'),
('70000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000023',20,'{}'),
('70000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000024',15,'{}'),
('70000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000031',1,'{}'),
-- Banatella (+ banana 1pc + nutella 30g)
('70000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000001e',1,'{}'),
('70000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000027',5,'{}'),
('70000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000021',1,'{}'),
('70000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-00000000001f',30,'{}'),
('70000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000031',1,'{}'),
-- Biscoff Croffle (+ biscoff spread 30g)
('70000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000001e',1,'{}'),
('70000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000027',5,'{}'),
('70000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000020',30,'{}'),
('70000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000031',1,'{}'),
-- Almond Nutella (+ almonds 15g + nutella 30g)
('70000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000001e',1,'{}'),
('70000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000027',5,'{}'),
('70000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000022',15,'{}'),
('70000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-00000000001f',30,'{}'),
('70000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000031',1,'{}'),
-- Ham & Cheese (+ ham 2pcs + mozzarella 30g)
('70000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-00000000001e',1,'{}'),
('70000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000025',2,'{}'),
('70000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000026',30,'{}'),
('70000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000031',1,'{}'),

-- ═══ SNACKS ═══
-- Flavored Fries (potato_fries 150g + paper_bag)
('80000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000028',150,'{}'),
('80000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000031',1,'{}')

ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;

-- ── 12. SEED: LOYALTY TIERS ─────────────────────────────────

INSERT INTO loyalty_tiers (id, name, min_points, color, badge_emoji, perks) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Bronze', 0,    '#cd7f32', '🥉', '["Earn 1 point per ₱10 spent", "Birthday bonus: 50 points"]'),
  ('a0000000-0000-4000-8000-000000000002', 'Silver', 500,  '#c0c0c0', '🥈', '["Earn 1 point per ₱10 spent", "Birthday bonus: 100 points", "5% discount on every order", "Early access to new menu items"]'),
  ('a0000000-0000-4000-8000-000000000003', 'Gold',   2000, '#ffd700', '🥇', '["Earn 1.5 points per ₱10 spent", "Birthday bonus: 200 points", "10% discount on every order", "Free upsize every 5th order", "Priority order queue"]')
ON CONFLICT (id) DO NOTHING;

-- ── 13. REALTIME PUBLICATIONS ───────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE ingredients;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE shifts;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 14. INDEXES ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ingredients_active ON ingredients(is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_ingredient ON inventory_logs(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created ON inventory_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_staff ON shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_clock_in ON shifts(clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_menu_item_ingredients_item ON menu_item_ingredients(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_ingredients_ingredient ON menu_item_ingredients(ingredient_id);

-- ── DONE ────────────────────────────────────────────────────
