-- run10_ultimate_unbrick.sql
-- Overrides silent RLS failure caused by standard subqueries.
-- Standard subqueries like (SELECT role FROM profiles) fail silently if the profiles table itself is locked.
-- We must use a SECURITY DEFINER function to pierce through RLS and accurately verify admin status!

BEGIN;

-- Create an indestructible, RLS-piercing Admin verifier
CREATE OR REPLACE FUNCTION public.is_true_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Explicitly allow frontend calls to this function
GRANT EXECUTE ON FUNCTION public.is_true_admin() TO authenticated;

-- 1. Unbrick Categories
DROP POLICY IF EXISTS "Admin can update categories" ON categories;
DROP POLICY IF EXISTS "Admin manages categories" ON categories;
CREATE POLICY "Admin manages categories" ON categories
  FOR ALL USING ( public.is_true_admin() )
  WITH CHECK  ( public.is_true_admin() );

-- 2. Unbrick Menu Items
DROP POLICY IF EXISTS "Admin can update menu items" ON menu_items;
DROP POLICY IF EXISTS "Admin manages menu items" ON menu_items;
CREATE POLICY "Admin manages menu items" ON menu_items
  FOR ALL USING ( public.is_true_admin() )
  WITH CHECK  ( public.is_true_admin() );

-- 3. Unbrick Item Variants
DROP POLICY IF EXISTS "Admin can update item variants" ON item_variants;
DROP POLICY IF EXISTS "Admin manages variants" ON item_variants;
CREATE POLICY "Admin manages variants" ON item_variants
  FOR ALL USING ( public.is_true_admin() )
  WITH CHECK  ( public.is_true_admin() );

-- 4. Unbrick Vouchers
DROP POLICY IF EXISTS "Admin can update vouchers" ON vouchers;
DROP POLICY IF EXISTS "Admin manages vouchers" ON vouchers;
CREATE POLICY "Admin manages vouchers" ON vouchers
  FOR ALL USING ( public.is_true_admin() )
  WITH CHECK  ( public.is_true_admin() );

-- 5. Unbrick Inventory (Ingredients + Recipes)
DROP POLICY IF EXISTS "ingredients_write" ON ingredients;
DROP POLICY IF EXISTS "Admin manages ingredients" ON ingredients;
CREATE POLICY "Admin manages ingredients" ON ingredients
  FOR ALL USING ( public.is_true_admin() )
  WITH CHECK  ( public.is_true_admin() );

DROP POLICY IF EXISTS "recipes_write" ON menu_item_ingredients;
DROP POLICY IF EXISTS "Admin manages recipes" ON menu_item_ingredients;
CREATE POLICY "Admin manages recipes" ON menu_item_ingredients
  FOR ALL USING ( public.is_true_admin() )
  WITH CHECK  ( public.is_true_admin() );

DROP POLICY IF EXISTS "variant_ing_write" ON variant_ingredients;
DROP POLICY IF EXISTS "Admin manages variant recipes" ON variant_ingredients;
CREATE POLICY "Admin manages variant recipes" ON variant_ingredients
  FOR ALL USING ( public.is_true_admin() )
  WITH CHECK  ( public.is_true_admin() );

-- 6. Unbrick Loyalty Tiers
DROP POLICY IF EXISTS "tiers_admin" ON loyalty_tiers;
DROP POLICY IF EXISTS "Admin manages loyalty tiers" ON loyalty_tiers;
CREATE POLICY "Admin manages loyalty tiers" ON loyalty_tiers
  FOR ALL USING ( public.is_true_admin() )
  WITH CHECK  ( public.is_true_admin() );

COMMIT;
