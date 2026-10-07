-- run9_unbrick_admin.sql
-- Fixes broken Admin DDL restrictions created by security_hardening.sql
-- Restores INSERT, UPDATE, DELETE (FOR ALL) capabilities to the Admin UI
-- Bypasses the broken get_my_role() function by evaluating the profiles table directly.

BEGIN;

-- 1. Unbrick Categories
DROP POLICY IF EXISTS "Admin can update categories" ON categories;
DROP POLICY IF EXISTS "Admin manages categories" ON categories;
CREATE POLICY "Admin manages categories" ON categories
  FOR ALL USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' )
  WITH CHECK ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' );

-- 2. Unbrick Menu Items
DROP POLICY IF EXISTS "Admin can update menu items" ON menu_items;
DROP POLICY IF EXISTS "Admin manages menu items" ON menu_items;
CREATE POLICY "Admin manages menu items" ON menu_items
  FOR ALL USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' )
  WITH CHECK ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' );

-- 3. Unbrick Item Variants
DROP POLICY IF EXISTS "Admin can update item variants" ON item_variants;
DROP POLICY IF EXISTS "Admin manages variants" ON item_variants;
CREATE POLICY "Admin manages variants" ON item_variants
  FOR ALL USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' )
  WITH CHECK ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' );

-- 4. Unbrick Vouchers
DROP POLICY IF EXISTS "Admin can update vouchers" ON vouchers;
DROP POLICY IF EXISTS "Admin manages vouchers" ON vouchers;
CREATE POLICY "Admin manages vouchers" ON vouchers
  FOR ALL USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' )
  WITH CHECK ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' );

-- 5. Unbrick Inventory (Ingredients + Recipes)
DROP POLICY IF EXISTS "ingredients_write" ON ingredients;
DROP POLICY IF EXISTS "Admin manages ingredients" ON ingredients;
CREATE POLICY "Admin manages ingredients" ON ingredients
  FOR ALL USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' )
  WITH CHECK ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' );

DROP POLICY IF EXISTS "recipes_write" ON menu_item_ingredients;
DROP POLICY IF EXISTS "Admin manages recipes" ON menu_item_ingredients;
CREATE POLICY "Admin manages recipes" ON menu_item_ingredients
  FOR ALL USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' )
  WITH CHECK ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' );

DROP POLICY IF EXISTS "variant_ing_write" ON variant_ingredients;
DROP POLICY IF EXISTS "Admin manages variant recipes" ON variant_ingredients;
CREATE POLICY "Admin manages variant recipes" ON variant_ingredients
  FOR ALL USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' )
  WITH CHECK ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' );

-- 6. Unbrick Loyalty Tiers and Inventory Logs
DROP POLICY IF EXISTS "tiers_admin" ON loyalty_tiers;
DROP POLICY IF EXISTS "Admin manages loyalty tiers" ON loyalty_tiers;
CREATE POLICY "Admin manages loyalty tiers" ON loyalty_tiers
  FOR ALL USING ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' )
  WITH CHECK ( (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin' );

DROP POLICY IF EXISTS "inv_logs_insert" ON inventory_logs;
DROP POLICY IF EXISTS "Staff and Admin can insert logs" ON inventory_logs;
CREATE POLICY "Staff and Admin can insert logs" ON inventory_logs
  FOR INSERT WITH CHECK ( (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'staff') );

COMMIT;
