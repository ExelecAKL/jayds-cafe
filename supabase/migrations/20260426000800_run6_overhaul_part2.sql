-- ============================================================
-- Migration Part 2: CafeOS Platform Overhaul — Data Migration
-- Run AFTER Part 1 has been committed successfully
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. TEMPORARILY DISABLE ORDER GUARD TRIGGER
-- ═══════════════════════════════════════════════════════════════

-- The guard_order_mutation trigger blocks order_type changes
-- from client sessions. Disable it for the migration.
ALTER TABLE orders DISABLE TRIGGER protect_order_mutation;

-- ═══════════════════════════════════════════════════════════════
-- 2. MIGRATE HISTORICAL ORDER DATA: dine_in/takeout → pickup
-- ═══════════════════════════════════════════════════════════════

UPDATE orders SET order_type = 'pickup' WHERE order_type IN ('dine_in', 'takeout');

-- ═══════════════════════════════════════════════════════════════
-- 3. RE-ENABLE ORDER GUARD TRIGGER
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE orders ENABLE TRIGGER protect_order_mutation;

-- ═══════════════════════════════════════════════════════════════
-- 4. VERIFY
-- ═══════════════════════════════════════════════════════════════

SELECT enumlabel FROM pg_enum WHERE enumtypid = 'order_type'::regtype ORDER BY enumsortorder;

SELECT 'Orders migrated to pickup' AS check_name,
       COUNT(*) AS count
FROM orders WHERE order_type = 'pickup';
