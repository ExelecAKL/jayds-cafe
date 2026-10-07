-- ============================================================
-- PART 10: Void PIN System
-- Replaces QR tokens with a global 6-digit PIN and Audit Log
-- ============================================================

-- 1. Create a global store settings table
CREATE TABLE IF NOT EXISTS store_settings (
  id text PRIMARY KEY DEFAULT 'global',
  void_pin text NOT NULL DEFAULT '123456',
  updated_at timestamptz DEFAULT now()
);

-- Seed the initial row
INSERT INTO store_settings (id, void_pin) VALUES ('global', '123456') ON CONFLICT DO NOTHING;

-- RLS for store_settings
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

DO $rls_settings$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='store_settings_admin') THEN
    CREATE POLICY store_settings_admin ON store_settings FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
END $rls_settings$;

-- 2. Create void_logs table to strictly audit voids
CREATE TABLE IF NOT EXISTS void_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  staff_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- RLS for void_logs
ALTER TABLE void_logs ENABLE ROW LEVEL SECURITY;

DO $rls_void_logs$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='void_logs_admin_read') THEN
    CREATE POLICY void_logs_admin_read ON void_logs FOR SELECT USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='void_logs_staff_insert') THEN
    CREATE POLICY void_logs_staff_insert ON void_logs FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff', 'admin'))
    );
  END IF;
END $rls_void_logs$;

-- 3. Replace the old `void_order_with_token` with `void_order_with_pin`
CREATE OR REPLACE FUNCTION void_order_with_pin(
  p_order_id uuid,
  p_pin text,
  p_staff_id uuid
) RETURNS jsonb AS $fn_void_pin$
DECLARE
  v_correct_pin text;
BEGIN
  -- Get the global void PIN
  SELECT void_pin INTO v_correct_pin FROM store_settings WHERE id = 'global';
  
  -- Fallback if table somehow missing row
  IF v_correct_pin IS NULL THEN
      v_correct_pin := '123456';
  END IF;

  -- Verify PIN
  IF p_pin != v_correct_pin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid Manager PIN');
  END IF;

  -- Cancel the order
  UPDATE orders SET status = 'cancelled' WHERE id = p_order_id;

  -- Insert audit log
  INSERT INTO void_logs (order_id, staff_id) VALUES (p_order_id, p_staff_id);

  RETURN jsonb_build_object('success', true, 'message', 'Order voided successfully');
END;
$fn_void_pin$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'PART 10 COMPLETE: Void PIN system and Audit Logs initialized' AS status;
