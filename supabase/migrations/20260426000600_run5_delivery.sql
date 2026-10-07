-- ============================================================
-- Migration: Add delivery support (Lalamove integration)
-- Run in Supabase SQL Editor after run4_qr_guests.sql
-- ============================================================

-- 1. Add delivery columns to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS lalamove_order_id TEXT,
  ADD COLUMN IF NOT EXISTS lalamove_quotation_id TEXT,
  ADD COLUMN IF NOT EXISTS lalamove_status TEXT;

-- 2. Add 'delivery' as valid order_type (update check constraint if exists)
-- The app TypeScript already supports 'delivery' — this ensures DB consistency
DO $$
BEGIN
  -- Drop old constraint if it exists
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;

  -- Add updated constraint
  ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
    CHECK (order_type IN ('dine_in', 'takeout', 'delivery'));
EXCEPTION WHEN OTHERS THEN
  -- Constraint may not exist, that's fine
  NULL;
END $$;

-- 3. Index for Lalamove order lookups
CREATE INDEX IF NOT EXISTS idx_orders_lalamove_order_id
  ON orders (lalamove_order_id) WHERE lalamove_order_id IS NOT NULL;

-- 4. Saved delivery addresses table
CREATE TABLE IF NOT EXISTS saved_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  address TEXT NOT NULL,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for saved_addresses
ALTER TABLE saved_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own addresses" ON saved_addresses;
CREATE POLICY "Users can manage own addresses"
  ON saved_addresses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_saved_addresses_user_id ON saved_addresses (user_id);

-- 5. Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('delivery_address', 'delivery_fee', 'lalamove_order_id', 'lalamove_status')
ORDER BY column_name;
