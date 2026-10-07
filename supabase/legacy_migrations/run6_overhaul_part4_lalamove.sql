-- ============================================================
-- Migration: Add missing lalamove_share_link column
-- Run after run6_overhaul_part3_addons.sql
-- ============================================================

-- Add the missing column
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS lalamove_share_link TEXT;

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name LIKE 'lalamove%'
ORDER BY column_name;
