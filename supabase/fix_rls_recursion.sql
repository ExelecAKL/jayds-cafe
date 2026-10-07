-- ============================================================
-- Fix: Infinite recursion in profiles RLS policies
-- The "Staff can view all profiles" policy queries profiles
-- table inside its own USING clause → infinite recursion.
-- Fix: Use a SECURITY DEFINER function to break the cycle.
-- ============================================================

-- Step 1: Create a helper function that bypasses RLS to get current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Step 2: Drop the broken policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Staff and admin can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admin can update any profile" ON profiles;
DROP POLICY IF EXISTS "Allow profile insert on signup" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;

-- Step 3: Recreate policies using the helper function (no recursion)

-- Anyone can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Staff and admin can view ALL profiles (uses function, not sub-select)
CREATE POLICY "Staff and admin can view all profiles"
  ON profiles FOR SELECT
  USING (get_my_role() IN ('staff', 'admin'));

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admin can update any profile
CREATE POLICY "Admin can update any profile"
  ON profiles FOR UPDATE
  USING (get_my_role() = 'admin');

-- Allow trigger to insert profiles on signup
CREATE POLICY "Service role can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- Also fix any orders policies that reference profiles
-- ============================================================

DROP POLICY IF EXISTS "Staff can view all orders" ON orders;
DROP POLICY IF EXISTS "Staff can update orders" ON orders;

CREATE POLICY "Staff can view all orders"
  ON orders FOR SELECT
  USING (get_my_role() IN ('staff', 'admin'));

CREATE POLICY "Staff can update orders"
  ON orders FOR UPDATE
  USING (get_my_role() IN ('staff', 'admin'));
