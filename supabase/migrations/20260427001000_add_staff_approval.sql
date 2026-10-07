-- Migration: Add is_approved column to profiles for staff approval workflow
-- Existing staff and admin accounts are auto-approved.
-- New staff sign-ups default to unapproved until admin confirms.
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Step 1: Add the column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Auto-approve ALL existing accounts
-- (Using a single UPDATE to avoid column reference issues)
UPDATE public.profiles
  SET is_approved = true;

-- Step 3: Add comment for documentation
COMMENT ON COLUMN public.profiles.is_approved IS 'Staff accounts require admin approval before POS access. Customers are always approved.';

-- Verify it worked:
SELECT id, email, role, is_approved FROM public.profiles LIMIT 10;
