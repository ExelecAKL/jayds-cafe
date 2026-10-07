-- ============================================================
-- PART 1 of 3: Tables, Columns, RLS, Ingredients, Tiers
-- Run this FIRST
-- ============================================================

-- 1. NEW COLUMNS
DO $col$ BEGIN
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='discount') THEN
    ALTER TABLE orders ADD COLUMN discount numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='points_redeemed') THEN
    ALTER TABLE orders ADD COLUMN points_redeemed integer NOT NULL DEFAULT 0;
  END IF;
END $col$;

-- 2. NEW TABLES
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

CREATE TABLE IF NOT EXISTS menu_item_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_used numeric NOT NULL DEFAULT 1,
  size_multipliers jsonb NOT NULL DEFAULT '{"Regular":1,"Medium":1.3,"Large":1.6}',
  UNIQUE(menu_item_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS variant_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_label text NOT NULL,
  variant_group text NOT NULL,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_used numeric NOT NULL DEFAULT 1,
  replaces_ingredient_id uuid REFERENCES ingredients(id),
  UNIQUE(variant_label, variant_group, ingredient_id)
);

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

CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  min_points integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#cd7f32',
  perks jsonb NOT NULL DEFAULT '[]',
  badge_emoji text NOT NULL DEFAULT '🥉',
  created_at timestamptz DEFAULT now()
);

-- 3. RLS
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_tiers ENABLE ROW LEVEL SECURITY;

DO $rls$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='ingredients_read') THEN
    CREATE POLICY ingredients_read ON ingredients FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='ingredients_write') THEN
    CREATE POLICY ingredients_write ON ingredients FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('staff','admin'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='recipes_read') THEN
    CREATE POLICY recipes_read ON menu_item_ingredients FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='recipes_write') THEN
    CREATE POLICY recipes_write ON menu_item_ingredients FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('staff','admin'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='variant_ing_read') THEN
    CREATE POLICY variant_ing_read ON variant_ingredients FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='variant_ing_write') THEN
    CREATE POLICY variant_ing_write ON variant_ingredients FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('staff','admin'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='inv_logs_read') THEN
    CREATE POLICY inv_logs_read ON inventory_logs FOR SELECT USING (
      EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('staff','admin'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='inv_logs_insert') THEN
    CREATE POLICY inv_logs_insert ON inventory_logs FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('staff','admin'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='shifts_read') THEN
    CREATE POLICY shifts_read ON shifts FOR SELECT USING (
      staff_id=auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='shifts_write') THEN
    CREATE POLICY shifts_write ON shifts FOR ALL USING (
      staff_id=auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='tiers_read') THEN
    CREATE POLICY tiers_read ON loyalty_tiers FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='tiers_admin') THEN
    CREATE POLICY tiers_admin ON loyalty_tiers FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin')
    );
  END IF;
END $rls$;

-- 4. SEED INGREDIENTS
INSERT INTO ingredients (name, unit, current_stock, min_stock_alert, cost_per_unit, supplier) VALUES
  ('Espresso Beans','g',5000,500,0.80,'Local Roaster'),
  ('Instant Coffee Powder','g',2000,200,0.30,'Local Roaster'),
  ('Whole Milk','ml',10000,1000,0.05,'Dairy Fresh'),
  ('Oat Milk','ml',3000,300,0.12,'Plant Milk PH'),
  ('Coconut Milk','ml',2000,200,0.08,'Coco Farm'),
  ('Condensed Milk','ml',3000,300,0.08,'Alaska'),
  ('Evaporated Milk','ml',2000,200,0.06,'Alaska'),
  ('Whipped Cream','ml',2000,200,0.10,'Dairy Fresh'),
  ('Cream Cheese','g',1000,100,0.45,'Dairy Fresh'),
  ('Vanilla Syrup','ml',2000,200,0.15,'Sweet Co'),
  ('Caramel Syrup','ml',2000,200,0.18,'Sweet Co'),
  ('Hazelnut Syrup','ml',1500,200,0.20,'Sweet Co'),
  ('Brown Sugar Syrup','ml',3000,300,0.12,'Sweet Co'),
  ('Butterscotch Syrup','ml',1500,150,0.22,'Sweet Co'),
  ('Macadamia Syrup','ml',1000,100,0.25,'Sweet Co'),
  ('French Vanilla Syrup','ml',1500,150,0.18,'Sweet Co'),
  ('White Mocha Sauce','ml',1500,150,0.30,'Sweet Co'),
  ('Salted Caramel Sauce','ml',1500,150,0.25,'Sweet Co'),
  ('Simple Syrup','ml',3000,300,0.05,'In-house'),
  ('Matcha Powder','g',1000,100,2.50,'Tea Import PH'),
  ('Chocolate Powder','g',2000,200,0.60,'Choco PH'),
  ('Milo Powder','g',2000,200,0.40,'Nestle'),
  ('Taro Powder','g',1000,100,1.20,'Tea Import PH'),
  ('Ube Powder','g',500,50,3.00,'Local Supplier'),
  ('Wintermelon Powder','g',1000,100,0.90,'Tea Import PH'),
  ('Cinnamon Powder','g',500,50,1.50,'Spice House'),
  ('Cookies Crumble','g',1000,100,1.00,'Generic'),
  ('Strawberry Puree','ml',1000,100,0.30,'Fruit Supply'),
  ('Mango Puree','ml',1000,100,0.25,'Fruit Supply'),
  ('Blueberry Puree','ml',1000,100,0.35,'Fruit Supply'),
  ('Green Apple Puree','ml',1000,100,0.30,'Fruit Supply'),
  ('Lychee Puree','ml',1000,100,0.35,'Fruit Supply'),
  ('Honey Peach Puree','ml',1000,100,0.30,'Fruit Supply'),
  ('Black Tea Bags','pcs',500,50,3.00,'Tea Import PH'),
  ('Nom Yen Mix','g',500,50,2.00,'Thai Import'),
  ('Tapioca Pearls (raw)','g',3000,300,0.15,'Boba Supply PH'),
  ('Coffee Jelly','g',2000,200,0.20,'In-house'),
  ('Nata de Coco','g',2000,200,0.10,'Local Supplier'),
  ('Chocolate Chips','g',1000,100,1.20,'Choco PH'),
  ('Nutella','g',500,50,2.50,'Ferrero'),
  ('Biscoff Spread','g',500,50,3.00,'Lotus'),
  ('Marshmallows','g',1000,100,0.80,'Sweet Co'),
  ('Banana','pcs',100,20,5.00,'Market'),
  ('Almonds (sliced)','g',500,50,2.00,'Nut Supply'),
  ('Cup 12oz (Hot)','pcs',500,50,3.00,'Pack Supplier'),
  ('Cup 16oz','pcs',500,50,3.50,'Pack Supplier'),
  ('Cup 22oz','pcs',500,50,4.50,'Pack Supplier'),
  ('Lid (flat)','pcs',1000,100,1.00,'Pack Supplier'),
  ('Lid (dome)','pcs',500,50,1.50,'Pack Supplier'),
  ('Straw','pcs',1000,100,0.50,'Pack Supplier'),
  ('Ice','g',20000,2000,0.01,'Ice Plant'),
  ('Soda Water','ml',5000,500,0.03,'Beverage Supply'),
  ('Croffle Dough','pcs',100,15,15.00,'In-house'),
  ('Ham Slice','pcs',100,15,8.00,'Deli Supply'),
  ('Cheese Slice','pcs',100,15,6.00,'Dairy Fresh'),
  ('Powdered Sugar','g',1000,100,0.10,'Baking Supply'),
  ('French Fries (frozen)','g',5000,500,0.08,'Potato Supply'),
  ('BBQ Seasoning','g',500,50,0.50,'Spice House'),
  ('Cheese Seasoning','g',500,50,0.60,'Spice House'),
  ('Sour Cream Seasoning','g',500,50,0.55,'Spice House'),
  ('Frying Oil','ml',5000,500,0.04,'Market')
ON CONFLICT (name) DO NOTHING;

-- 5. SEED LOYALTY TIERS
INSERT INTO loyalty_tiers (name, min_points, color, perks, badge_emoji) VALUES
  ('Bronze',0,'#cd7f32','["Earn 1 pt per P10 spent","Birthday greeting","Order history tracking"]'::jsonb,'🥉'),
  ('Silver',500,'#c0c0c0','["1.2x point multiplier","Priority queue","Free size upgrade monthly","Early access to new items"]'::jsonb,'🥈'),
  ('Gold',2000,'#ffd700','["1.5x point multiplier","Free drink monthly","Exclusive Gold events","VIP support","10% birthday discount"]'::jsonb,'🥇')
ON CONFLICT (name) DO NOTHING;

SELECT 'PART 1 COMPLETE: ' || (SELECT count(*) FROM ingredients) || ' ingredients, ' || (SELECT count(*) FROM loyalty_tiers) || ' tiers' AS status;
