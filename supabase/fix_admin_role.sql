-- ============================================================
-- EMERGENCY: Restore admin role (bypass trigger guard)
-- Run in Supabase SQL Editor
-- ============================================================

-- Step 1: Temporarily disable the guard trigger
ALTER TABLE profiles DISABLE TRIGGER protect_profile_mutation;

-- Step 2: Restore admin role
UPDATE profiles SET role = 'admin' WHERE email = 'admin@cafeos.ph';

-- Step 3: Re-enable the guard trigger
ALTER TABLE profiles ENABLE TRIGGER protect_profile_mutation;

-- Step 4: Verify
SELECT id, email, full_name, role FROM profiles WHERE email = 'admin@cafeos.ph';
