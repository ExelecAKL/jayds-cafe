-- ============================================================
-- PART 4: QR System + Guest Receipts
-- Run AFTER Parts 1-3
-- ============================================================

-- 1. Void tokens (admin-generated, one-time use QR for voiding orders)
CREATE TABLE IF NOT EXISTS void_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  created_by uuid REFERENCES profiles(id),
  used_by uuid REFERENCES profiles(id),
  used_at timestamptz,
  order_id uuid REFERENCES orders(id),
  expires_at timestamptz NOT NULL,
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2. Pickup tokens (customer QR for confirming pickup)
CREATE TABLE IF NOT EXISTS pickup_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 3. Guest receipts (temporary, auto-expire after 30 days)
CREATE TABLE IF NOT EXISTS guest_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  receipt_token text NOT NULL UNIQUE,
  receipt_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '30 days')
);

-- 4. RLS policies
ALTER TABLE void_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_receipts ENABLE ROW LEVEL SECURITY;

DO $rls4$ BEGIN
  -- void_tokens: admin can manage, staff can read
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='void_tokens_admin') THEN
    CREATE POLICY void_tokens_admin ON void_tokens FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='void_tokens_staff_read') THEN
    CREATE POLICY void_tokens_staff_read ON void_tokens FOR SELECT USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='void_tokens_staff_use') THEN
    CREATE POLICY void_tokens_staff_use ON void_tokens FOR UPDATE USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin'))
    );
  END IF;

  -- pickup_tokens: customers can read own, staff can read all
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='pickup_tokens_customer') THEN
    CREATE POLICY pickup_tokens_customer ON pickup_tokens FOR SELECT USING (
      EXISTS (SELECT 1 FROM orders WHERE orders.id = pickup_tokens.order_id AND orders.customer_id = auth.uid())
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='pickup_tokens_insert') THEN
    CREATE POLICY pickup_tokens_insert ON pickup_tokens FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM orders WHERE orders.id = pickup_tokens.order_id AND orders.customer_id = auth.uid())
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='pickup_tokens_staff') THEN
    CREATE POLICY pickup_tokens_staff ON pickup_tokens FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin'))
    );
  END IF;

  -- guest_receipts: public read by token (no auth needed), staff can manage
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='guest_receipts_public_read') THEN
    CREATE POLICY guest_receipts_public_read ON guest_receipts FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='guest_receipts_staff_write') THEN
    CREATE POLICY guest_receipts_staff_write ON guest_receipts FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin'))
    );
  END IF;
END $rls4$;

-- 5. Auto-generate pickup token when order is created
CREATE OR REPLACE FUNCTION generate_pickup_token()
RETURNS TRIGGER AS $fn_pickup$
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    INSERT INTO pickup_tokens (order_id, token_hash)
    VALUES (NEW.id, encode(gen_random_bytes(32), 'hex'))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn_pickup$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_generate_pickup_token ON orders;
CREATE TRIGGER trg_generate_pickup_token
  AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION generate_pickup_token();

-- 6. Cleanup expired guest receipts (run on every order completion)
CREATE OR REPLACE FUNCTION cleanup_expired_receipts()
RETURNS TRIGGER AS $fn_cleanup$
BEGIN
  DELETE FROM guest_receipts WHERE expires_at < now();
  RETURN NEW;
END;
$fn_cleanup$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cleanup_receipts ON orders;
CREATE TRIGGER trg_cleanup_receipts
  AFTER UPDATE ON orders FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION cleanup_expired_receipts();

-- 7. Void order function (validates token, voids order atomically)
CREATE OR REPLACE FUNCTION void_order_with_token(
  p_order_id uuid,
  p_token_hash text,
  p_staff_id uuid
) RETURNS jsonb AS $fn_void$
DECLARE
  v_token RECORD;
BEGIN
  -- Find valid token
  SELECT * INTO v_token FROM void_tokens
  WHERE token_hash = p_token_hash
    AND is_used = false
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired void token');
  END IF;

  -- Mark token as used
  UPDATE void_tokens
  SET is_used = true, used_by = p_staff_id, used_at = now(), order_id = p_order_id
  WHERE id = v_token.id;

  -- Cancel the order
  UPDATE orders SET status = 'cancelled' WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'message', 'Order voided successfully');
END;
$fn_void$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'PART 4 COMPLETE: void_tokens, pickup_tokens, guest_receipts tables + triggers + void function' AS status;
