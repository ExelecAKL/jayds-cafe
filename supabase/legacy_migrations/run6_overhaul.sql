-- ============================================================
-- Migration: CafeOS Platform Overhaul (Phase 1)
-- Run in Supabase SQL Editor after run5_delivery.sql
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. ORDER TYPE CONSOLIDATION: dine_in/takeout/mobile_order → pickup
-- ═══════════════════════════════════════════════════════════════

-- Add 'pickup' to the enum
ALTER TYPE order_type ADD VALUE IF NOT EXISTS 'pickup';

-- Migrate historical data (dine_in & takeout → pickup)
-- Note: must be run AFTER the ALTER TYPE commits
UPDATE orders SET order_type = 'pickup' WHERE order_type IN ('dine_in', 'takeout');

-- Add new columns for cached pickup orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_confirmation_hash TEXT;

-- Index for expiry cleanup
CREATE INDEX IF NOT EXISTS idx_orders_expires_at
  ON orders (expires_at) WHERE expires_at IS NOT NULL;

-- Update non-negative amounts constraint to handle delivery
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_non_negative_amounts_chk;
ALTER TABLE orders ADD CONSTRAINT orders_non_negative_amounts_chk
  CHECK (subtotal >= 0 AND total >= 0 AND points_earned >= 0 AND total <= subtotal + COALESCE(delivery_fee, 0));

-- ═══════════════════════════════════════════════════════════════
-- 2. MENU ITEM & CATEGORY: Archive instead of delete
-- ═══════════════════════════════════════════════════════════════

-- Create status enum
DO $$ BEGIN
  CREATE TYPE item_status AS ENUM ('active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS status item_status NOT NULL DEFAULT 'active';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS status item_status NOT NULL DEFAULT 'active';

-- Recipe requirement flag
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS recipe_required BOOLEAN NOT NULL DEFAULT true;

-- ═══════════════════════════════════════════════════════════════
-- 3. ITEM VARIANT: Per-item applicability
-- ═══════════════════════════════════════════════════════════════

-- If null, variant applies to all items in category (backward compatible)
ALTER TABLE item_variants ADD COLUMN IF NOT EXISTS applicable_items JSONB DEFAULT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 4. NOTIFICATIONS TABLE
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('stock_alert', 'order_update', 'promo', 'system', 'voucher');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- null = broadcast
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type notification_type NOT NULL DEFAULT 'system',
  is_read BOOLEAN NOT NULL DEFAULT false,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users see their own notifications + broadcasts
DROP POLICY IF EXISTS "Users see own notifications" ON notifications;
CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Users can mark their own as read
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin/system can insert
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR user_id IS NULL
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 5. STAFF CLOCK-IN/OUT TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clock_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  total_hours NUMERIC(6,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clock_entries ENABLE ROW LEVEL SECURITY;

-- Admin can see all clock entries
DROP POLICY IF EXISTS "Admin sees all clock entries" ON clock_entries;
CREATE POLICY "Admin sees all clock entries"
  ON clock_entries FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Staff can see their own
DROP POLICY IF EXISTS "Staff sees own clock entries" ON clock_entries;
CREATE POLICY "Staff sees own clock entries"
  ON clock_entries FOR SELECT
  USING (auth.uid() = staff_id);

-- Staff can clock in/out themselves
DROP POLICY IF EXISTS "Staff manages own clock entries" ON clock_entries;
CREATE POLICY "Staff manages own clock entries"
  ON clock_entries FOR INSERT
  WITH CHECK (auth.uid() = staff_id);

DROP POLICY IF EXISTS "Staff updates own clock entries" ON clock_entries;
CREATE POLICY "Staff updates own clock entries"
  ON clock_entries FOR UPDATE
  USING (auth.uid() = staff_id);

CREATE INDEX IF NOT EXISTS idx_clock_entries_staff ON clock_entries (staff_id, clock_in DESC);

-- ═══════════════════════════════════════════════════════════════
-- 6. ADMIN VOUCHER MANAGEMENT TABLE
-- ═══════════════════════════════════════════════════════════════

-- Enhance existing vouchers table with admin deployment features
ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS target_tier TEXT,           -- null = all members
  ADD COLUMN IF NOT EXISTS target_users JSONB,         -- specific user IDs
  ADD COLUMN IF NOT EXISTS frequency_limit INT,        -- max X per user
  ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ;

-- Voucher claims table (tracks per-user voucher usage + expiry)
CREATE TABLE IF NOT EXISTS voucher_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,           -- perishable voucher logic
  used_at TIMESTAMPTZ,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  UNIQUE(voucher_id, user_id, claimed_at)
);

ALTER TABLE voucher_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own voucher claims" ON voucher_claims;
CREATE POLICY "Users see own voucher claims"
  ON voucher_claims FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin manages voucher claims" ON voucher_claims;
CREATE POLICY "Admin manages voucher claims"
  ON voucher_claims FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "System inserts voucher claims" ON voucher_claims;
CREATE POLICY "System inserts voucher claims"
  ON voucher_claims FOR INSERT
  WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_voucher_claims_user ON voucher_claims (user_id);
CREATE INDEX IF NOT EXISTS idx_voucher_claims_voucher ON voucher_claims (voucher_id);

-- ═══════════════════════════════════════════════════════════════
-- 7. VERIFY ALL CHANGES
-- ═══════════════════════════════════════════════════════════════

-- Check new enum values
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'order_type'::regtype ORDER BY enumsortorder;

-- Check new columns on orders
SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders' AND column_name IN ('expires_at', 'pickup_confirmation_hash')
ORDER BY column_name;

-- Check new tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('notifications', 'clock_entries', 'voucher_claims')
ORDER BY table_name;
