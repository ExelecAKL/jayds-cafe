-- ============================================================
-- CafeOS — Supabase Database Schema
-- Full SQL migration with tables, enums, RLS, triggers, seed data
-- ============================================================

-- ── ENUMS ───────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('customer', 'staff', 'admin');
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled');
CREATE TYPE order_type AS ENUM ('dine_in', 'takeout');
CREATE TYPE payment_method AS ENUM ('cash', 'maya');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- ── PROFILES ────────────────────────────────────────────────

CREATE TABLE profiles (
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

-- Customers can read/update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Staff and admin can view all profiles
CREATE POLICY "Staff and admin can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('staff', 'admin')
    )
  );

-- Admin can update any profile (role assignment)
CREATE POLICY "Admin can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── AUTO-CREATE PROFILE ON SIGNUP ───────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── CATEGORIES ──────────────────────────────────────────────

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Anyone can read active categories
CREATE POLICY "Anyone can read categories"
  ON categories FOR SELECT
  USING (true);

-- Admin can manage categories
CREATE POLICY "Admin can insert categories"
  ON categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update categories"
  ON categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete categories"
  ON categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── MENU ITEMS ──────────────────────────────────────────────

CREATE TABLE menu_items (
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

-- Anyone can read available menu items
CREATE POLICY "Anyone can read menu items"
  ON menu_items FOR SELECT
  USING (true);

-- Admin can manage menu items
CREATE POLICY "Admin can insert menu items"
  ON menu_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update menu items"
  ON menu_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete menu items"
  ON menu_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── ITEM VARIANTS ───────────────────────────────────────────

CREATE TABLE item_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  variant_group TEXT NOT NULL, -- e.g., 'size', 'sugar_level', 'add_on'
  label TEXT NOT NULL,         -- e.g., 'Large', '50%', 'Extra Shot'
  price_modifier DECIMAL(10, 2) NOT NULL DEFAULT 0, -- added to base price
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE item_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read item variants"
  ON item_variants FOR SELECT
  USING (true);

CREATE POLICY "Admin can insert item variants"
  ON item_variants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update item variants"
  ON item_variants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete item variants"
  ON item_variants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── ORDER NUMBER SEQUENCE ───────────────────────────────────

CREATE SEQUENCE order_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'ORD-' || LPAD(nextval('order_number_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ── ORDERS ──────────────────────────────────────────────────

CREATE TABLE orders (
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
  staff_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Customers can view their own orders
CREATE POLICY "Customers can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = customer_id);

-- Customers can insert their own orders
CREATE POLICY "Customers can insert own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Staff and admin can view all orders
CREATE POLICY "Staff and admin can view all orders"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('staff', 'admin')
    )
  );

-- Staff and admin can insert orders (manual order entry)
CREATE POLICY "Staff and admin can insert orders"
  ON orders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('staff', 'admin')
    )
  );

-- Staff and admin can update orders (status changes)
CREATE POLICY "Staff and admin can update orders"
  ON orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('staff', 'admin')
    )
  );

-- ── ORDER ITEMS ─────────────────────────────────────────────

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,           -- snapshot at time of order
  price DECIMAL(10, 2) NOT NULL, -- snapshot at time of order
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  variants JSONB DEFAULT '[]'::jsonb, -- snapshot of selected variants
  subtotal DECIMAL(10, 2) NOT NULL, -- price * quantity + variant modifiers
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Customers can view their own order items
CREATE POLICY "Customers can view own order items"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.customer_id = auth.uid()
    )
  );

-- Customers can insert their own order items
CREATE POLICY "Customers can insert own order items"
  ON order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.customer_id = auth.uid()
    )
  );

-- Staff and admin can view all order items
CREATE POLICY "Staff and admin can view all order items"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('staff', 'admin')
    )
  );

-- Staff and admin can insert order items
CREATE POLICY "Staff and admin can insert order items"
  ON order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('staff', 'admin')
    )
  );

-- ── ORDER STATUS HISTORY ────────────────────────────────────

CREATE TABLE order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  previous_status order_status,
  new_status order_status NOT NULL,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- Customers can view their own order status history
CREATE POLICY "Customers can view own order status history"
  ON order_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_status_history.order_id
      AND orders.customer_id = auth.uid()
    )
  );

-- Staff and admin can view all order status history
CREATE POLICY "Staff and admin can view all order status history"
  ON order_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('staff', 'admin')
    )
  );

-- Staff and admin can insert order status history
CREATE POLICY "Staff and admin can insert order status history"
  ON order_status_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('staff', 'admin')
    )
  );

-- ── AUTO-LOG STATUS CHANGES ────────────────────────────────

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

CREATE TRIGGER on_order_status_change
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- ── AUTO-UPDATE TIMESTAMPS ──────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── ENABLE REALTIME ─────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE order_status_history;

-- ── INDEXES ─────────────────────────────────────────────────

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX idx_menu_items_category_id ON menu_items(category_id);
CREATE INDEX idx_item_variants_menu_item_id ON item_variants(menu_item_id);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Categories
INSERT INTO categories (id, name, description, sort_order) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Drinks', 'Hot and cold beverages', 1),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Food', 'Rice meals and snacks', 2),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Pastries', 'Freshly baked goods', 3),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567804', 'Specials', 'Limited-time offerings', 4);

-- Menu Items: Drinks
INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes) VALUES
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Café Americano', 'Rich espresso with hot water', 120.00, true, true, 5),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567802', 'a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Vanilla Latte', 'Espresso with steamed milk and vanilla syrup', 150.00, true, true, 7),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567803', 'a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Iced Mocha', 'Chocolate espresso with cold milk and ice', 160.00, true, false, 5),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567804', 'a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Matcha Latte', 'Premium Japanese matcha with steamed milk', 170.00, true, true, 7),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567805', 'a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'Caramel Frappuccino', 'Blended coffee with caramel drizzle', 180.00, true, false, 8);

-- Menu Items: Food
INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes) VALUES
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567806', 'a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Chicken Pesto Panini', 'Grilled chicken with basil pesto on ciabatta', 220.00, true, true, 12),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567807', 'a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Club Sandwich', 'Triple-layer with ham, egg, and veggies', 200.00, true, false, 10),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567808', 'a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'Garlic Butter Rice Bowl', 'Garlic fried rice with grilled pork belly', 250.00, true, false, 15);

-- Menu Items: Pastries
INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes) VALUES
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567809', 'a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Butter Croissant', 'Flaky, golden French-style croissant', 95.00, true, true, 3),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567810', 'a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Blueberry Muffin', 'Moist muffin loaded with blueberries', 110.00, true, false, 3),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567811', 'a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'Chocolate Chip Cookie', 'Crispy outside, chewy inside', 75.00, true, false, 2);

-- Menu Items: Specials
INSERT INTO menu_items (id, category_id, name, description, price, is_available, is_featured, prep_time_minutes) VALUES
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567812', 'a1b2c3d4-e5f6-7890-abcd-ef1234567804', 'Ube Latte', 'Purple yam latte — a Filipino classic', 175.00, true, true, 7),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567813', 'a1b2c3d4-e5f6-7890-abcd-ef1234567804', 'Mango Graham Frappe', 'Creamy blended mango with crushed graham', 185.00, true, true, 8);

-- Item Variants: Sizes for drinks
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
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567805', 'size', 'Large (16oz)', 30.00, false, 2);

-- Item Variants: Sugar levels for drinks
INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order) VALUES
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'sugar_level', '100% Sugar', 0, true, 1),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'sugar_level', '75% Sugar', 0, false, 2),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'sugar_level', '50% Sugar', 0, false, 3),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'sugar_level', '25% Sugar', 0, false, 4),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'sugar_level', 'No Sugar', 0, false, 5);

-- Item Variants: Add-ons for drinks
INSERT INTO item_variants (menu_item_id, variant_group, label, price_modifier, is_default, sort_order) VALUES
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'add_on', 'Extra Shot', 30.00, false, 1),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'add_on', 'Oat Milk', 40.00, false, 2),
  ('b1b2c3d4-e5f6-7890-abcd-ef1234567801', 'add_on', 'Whipped Cream', 20.00, false, 3);

-- ============================================================
-- VOUCHERS TABLE
-- ============================================================

CREATE TABLE vouchers (
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

-- Anyone can read active vouchers (for validation)
CREATE POLICY "Anyone can read active vouchers"
  ON vouchers FOR SELECT
  USING (is_active = true);

-- Admin can manage vouchers
CREATE POLICY "Admin can insert vouchers"
  ON vouchers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can update vouchers"
  ON vouchers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete vouchers"
  ON vouchers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE INDEX idx_vouchers_code ON vouchers(code);

-- Seed sample vouchers
INSERT INTO vouchers (code, description, discount_type, discount_value, min_order_amount) VALUES
  ('WELCOME10', '10% off your first order', 'percentage', 10, 0),
  ('FLAT50', '₱50 off orders above ₱300', 'fixed', 50, 300),
  ('ZSTUDY', '15% off for students (min ₱100)', 'percentage', 15, 100);

