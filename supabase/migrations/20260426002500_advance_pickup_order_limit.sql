-- Tracks active advance pickup orders so a customer or guest session can have
-- at most 3 unscanned cash pickup confirmation QRs at a time.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS advance_order_key TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_active_advance_pickups
  ON orders(advance_order_key, expires_at)
  WHERE pickup_confirmation_hash IS NOT NULL
    AND order_type = 'pickup'
    AND payment_method = 'cash'
    AND payment_status = 'pending'
    AND status = 'pending';
