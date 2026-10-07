-- ============================================================
-- Migration: Auto-cancel unpaid/expired orders & store Maya URL
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add `maya_checkout_url` to easily resume payments
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS maya_checkout_url TEXT;

-- 2. Ensure pg_cron extension exists for automated background jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- 3. Schedule the background auto-cancellation job every minute
-- This targets:
--   a) Maya orders that are unpaid and beyond 30 mins (expires_at)
--   b) Cash Pickup cached orders that haven't been scanned beyond 30 mins
SELECT cron.schedule('auto-cancel-expired-orders', '* * * * *', $$
  -- Mark cancelled
  UPDATE orders
  SET 
    status = 'cancelled',
    notes = COALESCE(notes, '') || E'\n[SYSTEM CANCELLED: Expired after 30 mins]'
  WHERE status IN ('pending', 'confirmed')
    AND payment_status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now();
$$);
