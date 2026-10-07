-- ============================================================
-- Migration Part 1: CafeOS Platform Overhaul — Enum & Schema
-- Run FIRST in Supabase SQL Editor
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. ADD 'pickup' TO ORDER TYPE ENUM (must commit separately)
-- ═══════════════════════════════════════════════════════════════

ALTER TYPE order_type ADD VALUE IF NOT EXISTS 'pickup';

-- ═══════════════════════════════════════════════════════════════
-- 2. ORDERS TABLE: New columns for cached pickup
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_confirmation_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_expires_at
  ON orders (expires_at) WHERE expires_at IS NOT NULL;

-- Update non-negative amounts constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_non_negative_amounts_chk;
ALTER TABLE orders ADD CONSTRAINT orders_non_negative_amounts_chk
  CHECK (subtotal >= 0 AND total >= 0 AND points_earned >= 0 AND total <= subtotal + COALESCE(delivery_fee, 0));

-- ═══════════════════════════════════════════════════════════════
-- 3. MENU ITEM & CATEGORY: Archive instead of delete
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE item_status AS ENUM ('active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS status item_status NOT NULL DEFAULT 'active';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS status item_status NOT NULL DEFAULT 'active';

-- Recipe requirement flag
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS recipe_required BOOLEAN NOT NULL DEFAULT true;

-- ═══════════════════════════════════════════════════════════════
-- 4. ITEM VARIANT: Per-item applicability
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE item_variants ADD COLUMN IF NOT EXISTS applicable_items JSONB DEFAULT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 5. NOTIFICATIONS TABLE
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('stock_alert', 'order_update', 'promo', 'system', 'voucher');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type notification_type NOT NULL DEFAULT 'system',
  is_read BOOLEAN NOT NULL DEFAULT false,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own notifications" ON notifications;
CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

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
-- 6. STAFF CLOCK-IN/OUT TABLE
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

DROP POLICY IF EXISTS "Admin sees all clock entries" ON clock_entries;
CREATE POLICY "Admin sees all clock entries"
  ON clock_entries FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Staff sees own clock entries" ON clock_entries;
CREATE POLICY "Staff sees own clock entries"
  ON clock_entries FOR SELECT
  USING (auth.uid() = staff_id);

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
-- 7. ADMIN VOUCHER MANAGEMENT
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS target_tier TEXT,
  ADD COLUMN IF NOT EXISTS target_users JSONB,
  ADD COLUMN IF NOT EXISTS frequency_limit INT,
  ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS voucher_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
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
