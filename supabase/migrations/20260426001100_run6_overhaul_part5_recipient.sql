-- ============================================================
-- Migration: Add delivery recipient details to orders
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_name TEXT,
  ADD COLUMN IF NOT EXISTS delivery_phone TEXT;
