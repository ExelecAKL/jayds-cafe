-- Account QR for branch POS linking and order source identification.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_qr_hash TEXT;

UPDATE profiles
SET account_qr_hash = encode(gen_random_bytes(32), 'hex')
WHERE account_qr_hash IS NULL;

ALTER TABLE profiles
  ALTER COLUMN account_qr_hash SET DEFAULT encode(gen_random_bytes(32), 'hex');

ALTER TABLE profiles
  ALTER COLUMN account_qr_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_account_qr_hash
  ON profiles(account_qr_hash);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_source TEXT NOT NULL DEFAULT 'app';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_source_chk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_order_source_chk
      CHECK (order_source IN ('app', 'pos'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_order_source
  ON orders(order_source);

CREATE OR REPLACE FUNCTION public.guard_profile_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role user_role;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  actor_role := get_my_role();

  IF actor_role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;

  IF NEW.points IS DISTINCT FROM OLD.points
     OR NEW.total_orders IS DISTINCT FROM OLD.total_orders
     OR NEW.last_check_in IS DISTINCT FROM OLD.last_check_in THEN
    RAISE EXCEPTION 'Only trusted backend processes can change loyalty fields';
  END IF;

  IF NEW.account_qr_hash IS DISTINCT FROM OLD.account_qr_hash THEN
    RAISE EXCEPTION 'Account QR cannot be changed from client sessions';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Email must be changed through Supabase Auth';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_order_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role user_role;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  actor_role := get_my_role();

  IF actor_role NOT IN ('staff', 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.order_type IS DISTINCT FROM OLD.order_type
     OR NEW.order_source IS DISTINCT FROM OLD.order_source
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.points_earned IS DISTINCT FROM OLD.points_earned
     OR NEW.maya_checkout_id IS DISTINCT FROM OLD.maya_checkout_id
     OR NEW.maya_payment_id IS DISTINCT FROM OLD.maya_payment_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Protected order fields cannot be changed from client sessions';
  END IF;

  IF OLD.payment_method = 'maya'
     AND NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    RAISE EXCEPTION 'Only the trusted backend can update Maya payment status';
  END IF;

  RETURN NEW;
END;
$$;
