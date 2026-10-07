-- ============================================================
-- CafeOS — Master Setup (safe to re-run)
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- ── ENUMS (safe: errors ignored if they already exist) ──────

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('customer', 'staff', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_type AS ENUM ('dine_in', 'takeout');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'maya');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── PROFILES ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'customer',
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Points columns (from points migration)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_orders INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_check_in DATE;

-- ── RLS HELPER FUNCTION (fixes recursion) ───────────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Drop all old profile policies then recreate
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Staff and admin can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admin can update any profile" ON profiles;
DROP POLICY IF EXISTS "Allow profile insert on signup" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Staff and admin can view all profiles"
  ON profiles FOR SELECT USING (get_my_role() IN ('staff', 'admin'));

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Admin can update any profile"
  ON profiles FOR UPDATE USING (get_my_role() = 'admin');

CREATE POLICY "Service role can insert profiles"
  ON profiles FOR INSERT WITH CHECK (true);

-- ── AUTO-CREATE PROFILE ON SIGNUP ───────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── CATEGORIES ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read categories" ON categories;
CREATE POLICY "Anyone can read categories" ON categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin can insert categories" ON categories;
CREATE POLICY "Admin can insert categories" ON categories FOR INSERT
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admin can update categories" ON categories;
CREATE POLICY "Admin can update categories" ON categories FOR UPDATE
  USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admin can delete categories" ON categories;
CREATE POLICY "Admin can delete categories" ON categories FOR DELETE
  USING (get_my_role() = 'admin');

-- ── MENU ITEMS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  prep_time_minutes INT NOT NULL DEFAULT 10,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

DROP POLICY IF EXISTS "Anyone can read menu items" ON menu_items;
CREATE POLICY "Anyone can read menu items" ON menu_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin can insert menu items" ON menu_items;
CREATE POLICY "Admin can insert menu items" ON menu_items FOR INSERT
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admin can update menu items" ON menu_items;
CREATE POLICY "Admin can update menu items" ON menu_items FOR UPDATE
  USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admin can delete menu items" ON menu_items;
CREATE POLICY "Admin can delete menu items" ON menu_items FOR DELETE
  USING (get_my_role() = 'admin');

-- ── ITEM VARIANTS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS item_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  variant_group TEXT NOT NULL,
  label TEXT NOT NULL,
  price_modifier DECIMAL(10, 2) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE item_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read item variants" ON item_variants;
CREATE POLICY "Anyone can read item variants" ON item_variants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin can insert item variants" ON item_variants;
CREATE POLICY "Admin can insert item variants" ON item_variants FOR INSERT
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admin can update item variants" ON item_variants;
CREATE POLICY "Admin can update item variants" ON item_variants FOR UPDATE
  USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admin can delete item variants" ON item_variants;
CREATE POLICY "Admin can delete item variants" ON item_variants FOR DELETE
  USING (get_my_role() = 'admin');

-- ── ORDER NUMBER SEQUENCE ───────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'ORD-' || LPAD(nextval('order_number_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ── ORDERS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE DEFAULT generate_order_number(),
  customer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status order_status NOT NULL DEFAULT 'pending',
  order_type order_type NOT NULL DEFAULT 'dine_in',
  payment_method payment_method NOT NULL DEFAULT 'cash',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  maya_checkout_id TEXT,
  maya_payment_id TEXT,
  points_earned INT NOT NULL DEFAULT 0,
  staff_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- In case it already existed without points_earned
ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_earned INT NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS "Customers can view own orders" ON orders;
CREATE POLICY "Customers can view own orders" ON orders FOR SELECT
  USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can insert own orders" ON orders;
CREATE POLICY "Customers can insert own orders" ON orders FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Staff and admin can view all orders" ON orders;
DROP POLICY IF EXISTS "Staff can view all orders" ON orders;
CREATE POLICY "Staff can view all orders" ON orders FOR SELECT
  USING (get_my_role() IN ('staff', 'admin'));

DROP POLICY IF EXISTS "Staff and admin can insert orders" ON orders;
CREATE POLICY "Staff and admin can insert orders" ON orders FOR INSERT
  WITH CHECK (get_my_role() IN ('staff', 'admin'));

DROP POLICY IF EXISTS "Staff and admin can update orders" ON orders;
DROP POLICY IF EXISTS "Staff can update orders" ON orders;
CREATE POLICY "Staff can update orders" ON orders FOR UPDATE
  USING (get_my_role() IN ('staff', 'admin'));

-- ── ORDER ITEMS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  variants JSONB DEFAULT '[]'::jsonb,
  subtotal DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own order items" ON order_items;
CREATE POLICY "Customers can view own order items" ON order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.customer_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Customers can insert own order items" ON order_items;
CREATE POLICY "Customers can insert own order items" ON order_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.customer_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Staff and admin can view all order items" ON order_items;
CREATE POLICY "Staff and admin can view all order items" ON order_items FOR SELECT
  USING (get_my_role() IN ('staff', 'admin'));

DROP POLICY IF EXISTS "Staff and admin can insert order items" ON order_items;
CREATE POLICY "Staff and admin can insert order items" ON order_items FOR INSERT
  WITH CHECK (get_my_role() IN ('staff', 'admin'));

-- ── ORDER STATUS HISTORY ────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  previous_status order_status,
  new_status order_status NOT NULL,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own order status history" ON order_status_history;
CREATE POLICY "Customers can view own order status history" ON order_status_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_status_history.order_id AND orders.customer_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Staff and admin can view all order status history" ON order_status_history;
CREATE POLICY "Staff and admin can view all order status history" ON order_status_history FOR SELECT
  USING (get_my_role() IN ('staff', 'admin'));

DROP POLICY IF EXISTS "Staff and admin can insert order status history" ON order_status_history;
CREATE POLICY "Staff and admin can insert order status history" ON order_status_history FOR INSERT
  WITH CHECK (get_my_role() IN ('staff', 'admin'));

-- ── TRIGGERS ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_order_status_change ON orders;
CREATE TRIGGER on_order_status_change
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_menu_items_updated_at ON menu_items;
CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Points award trigger
CREATE OR REPLACE FUNCTION award_points_on_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.customer_id IS NOT NULL THEN
    UPDATE profiles SET
      points = points + NEW.points_earned,
      total_orders = total_orders + 1
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_order_completed ON orders;
CREATE TRIGGER on_order_completed
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION award_points_on_completion();

-- ── REALTIME ────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE order_status_history;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── INDEXES ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_item_variants_menu_item_id ON item_variants(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);

-- ── VOUCHERS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10, 2) NOT NULL,
  min_order_amount DECIMAL(10, 2) DEFAULT 0,
  max_uses INT DEFAULT NULL,
  uses_count INT DEFAULT 0,
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active vouchers" ON vouchers;
CREATE POLICY "Anyone can read active vouchers" ON vouchers FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admin can insert vouchers" ON vouchers;
CREATE POLICY "Admin can insert vouchers" ON vouchers FOR INSERT
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admin can update vouchers" ON vouchers;
CREATE POLICY "Admin can update vouchers" ON vouchers FOR UPDATE
  USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admin can delete vouchers" ON vouchers;
CREATE POLICY "Admin can delete vouchers" ON vouchers FOR DELETE
  USING (get_my_role() = 'admin');

-- ── SEED DATA (skip duplicates) ─────────────────────────────

INSERT INTO categories (id, name, description, sort_order) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Drinks', 'Hot and cold beverages', 1),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Food', 'Rice meals and snacks', 2),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Pastries', 'Freshly baked goods', 3),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567804', 'Specials', 'Limited-time offerings', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes) VALUES
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Cafe Americano', 'Rich espresso with hot water', 120.00, true, true, 5),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567802', 'a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Vanilla Latte', 'Espresso with steamed milk and vanilla syrup', 150.00, true, true, 7),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567803', 'a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Iced Mocha', 'Chocolate espresso with cold milk and ice', 160.00, true, false, 5),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567804', 'a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Matcha Latte', 'Premium Japanese matcha with steamed milk', 170.00, true, true, 7),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567805', 'a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Caramel Frappuccino', 'Blended coffee with caramel drizzle', 180.00, true, false, 8),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567806', 'a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Chicken Pesto Panini', 'Grilled chicken with basil pesto on ciabatta', 220.00, true, true, 12),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567807', 'a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Club Sandwich', 'Triple-layer with ham, egg, and veggies', 200.00, true, false, 10),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567808', 'a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Garlic Butter Rice Bowl', 'Garlic fried rice with grilled pork belly', 250.00, true, false, 15),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567809', 'a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Butter Croissant', 'Flaky, golden French-style croissant', 95.00, true, true, 3),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567810', 'a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Blueberry Muffin', 'Moist muffin loaded with blueberries', 110.00, true, false, 3),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567811', 'a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Chocolate Chip Cookie', 'Crispy outside, chewy inside', 75.00, true, false, 2),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567812', 'a1b2c3d4-e5f6-7890-abcd-ef1234567804', 'Ube Latte', 'Purple yam latte — a Filipino classic', 175.00, true, true, 7),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567813', 'a1b2c3d4-e5f6-7890-abcd-ef1234567804', 'Mango Graham Frappe', 'Creamy blended mango with crushed graham', 185.00, true, true, 8)
ON CONFLICT (id) DO NOTHING;

INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order) VALUES
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'size', 'Regular (12oz)', 0, true, 1),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'size', 'Large (16oz)', 30.00, false, 2),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567802', 'size', 'Regular (12oz)', 0, true, 1),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567802', 'size', 'Large (16oz)', 30.00, false, 2),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567803', 'size', 'Regular (12oz)', 0, true, 1),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567803', 'size', 'Large (16oz)', 30.00, false, 2),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567804', 'size', 'Regular (12oz)', 0, true, 1),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567804', 'size', 'Large (16oz)', 30.00, false, 2),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567805', 'size', 'Regular (12oz)', 0, true, 1),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567805', 'size', 'Large (16oz)', 30.00, false, 2),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'sugar_level', '100% Sugar', 0, true, 1),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'sugar_level', '75% Sugar', 0, false, 2),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'sugar_level', '50% Sugar', 0, false, 3),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'sugar_level', '25% Sugar', 0, false, 4),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'sugar_level', 'No Sugar', 0, false, 5),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'add_on', 'Extra Shot', 30.00, false, 1),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'add_on', 'Oat Milk', 40.00, false, 2),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'add_on', 'Whipped Cream', 20.00, false, 3)
ON CONFLICT DO NOTHING;

INSERT INTO vouchers (code, description, discount_type, discount_value, min_order_amount) VALUES
  ('WELCOME10', '10% off your first order', 'percentage', 10, 0),
  ('FLAT50', '₱50 off orders above ₱300', 'fixed', 50, 300),
  ('ZSTUDY', '15% off for students (min ₱100)', 'percentage', 15, 100)
ON CONFLICT (code) DO NOTHING;

-- ── DONE ────────────────────────────────────────────────────
-- â”€â”€ SECURITY HARDENING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
CREATE POLICY "Service role can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admin can update any profile" ON profiles;
CREATE POLICY "Admin can update any profile"
  ON profiles FOR UPDATE
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Staff can update orders" ON orders;
DROP POLICY IF EXISTS "Staff and admin can update orders" ON orders;
CREATE POLICY "Staff can update orders"
  ON orders FOR UPDATE
  USING (get_my_role() IN ('staff', 'admin'))
  WITH CHECK (get_my_role() IN ('staff', 'admin'));

DROP POLICY IF EXISTS "Admin can update categories" ON categories;
CREATE POLICY "Admin can update categories" ON categories FOR UPDATE
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admin can update menu items" ON menu_items;
CREATE POLICY "Admin can update menu items" ON menu_items FOR UPDATE
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admin can update item variants" ON item_variants;
CREATE POLICY "Admin can update item variants" ON item_variants FOR UPDATE
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admin can update vouchers" ON vouchers;
CREATE POLICY "Admin can update vouchers" ON vouchers FOR UPDATE
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.guard_profile_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role user_role;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Allow trusted nested trigger updates such as loyalty awards on order completion.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  actor_role := get_my_role();

  IF actor_role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;

  IF NEW.points IS DISTINCT FROM OLD.points
     OR NEW.total_orders IS DISTINCT FROM OLD.total_orders
     OR NEW.last_check_in IS DISTINCT FROM OLD.last_check_in THEN
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

DROP TRIGGER IF EXISTS protect_profile_mutation ON profiles;
CREATE TRIGGER protect_profile_mutation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_mutation();

CREATE OR REPLACE FUNCTION public.guard_order_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role user_role;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  actor_role := get_my_role();

  IF actor_role NOT IN ('staff', 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.order_type IS DISTINCT FROM OLD.order_type
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.points_earned IS DISTINCT FROM OLD.points_earned
     OR NEW.maya_checkout_id IS DISTINCT FROM OLD.maya_checkout_id
     OR NEW.maya_payment_id IS DISTINCT FROM OLD.maya_payment_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Protected order fields cannot be changed from client sessions';
  END IF;

  IF OLD.payment_method = 'maya'
     AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    RAISE EXCEPTION 'Only the trusted backend can update Maya payment status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_order_mutation ON orders;
CREATE TRIGGER protect_order_mutation
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_mutation();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_email_not_blank_chk'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_email_not_blank_chk
      CHECK (length(trim(email)) > 3);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_email_format_chk'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_email_format_chk
      CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_phone_digits_chk'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_phone_digits_chk
      CHECK (
        phone IS NULL
        OR length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 10 AND 15
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_non_negative_amounts_chk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_non_negative_amounts_chk
      CHECK (subtotal >= 0 AND total >= 0 AND points_earned >= 0 AND total <= subtotal);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_maya_checkout_id_scope_chk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_maya_checkout_id_scope_chk
      CHECK (maya_checkout_id IS NULL OR payment_method = 'maya');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_maya_payment_id_scope_chk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_maya_payment_id_scope_chk
      CHECK (maya_payment_id IS NULL OR payment_method = 'maya');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_code_format_chk'
  ) THEN
    ALTER TABLE vouchers
      ADD CONSTRAINT vouchers_code_format_chk
      CHECK (code = upper(code) AND code ~ '^[A-Z0-9_-]{3,32}$');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_discount_valid_chk'
  ) THEN
    ALTER TABLE vouchers
      ADD CONSTRAINT vouchers_discount_valid_chk
      CHECK (
        discount_value > 0
        AND min_order_amount >= 0
        AND (max_uses IS NULL OR max_uses > 0)
        AND (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
      );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_order_status_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_points_on_completion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_profile_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_order_mutation() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon, authenticated, service_role;

-- All tables, RLS policies, triggers, and seed data are ready.
