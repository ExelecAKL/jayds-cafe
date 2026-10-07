-- ============================================================
-- ORDER CLEANUP — Wipes all test orders & related data
-- Does NOT touch tables, columns, functions, triggers, or menu
-- Safe to run anytime to reset order data
-- ============================================================

-- 1. Delete in dependency order (children first)
DELETE FROM guest_receipts;
DELETE FROM pickup_tokens;
DELETE FROM void_tokens;
DELETE FROM order_status_history;
DELETE FROM order_items;
DELETE FROM inventory_logs;
DELETE FROM orders;

-- 2. Reset order number sequence (optional — starts fresh from ORD-0001)
-- Comment this out if you want to keep the counter going
ALTER SEQUENCE order_number_seq RESTART WITH 1;

-- 3. Verify everything is clean
SELECT 'orders' AS table_name, COUNT(*) AS remaining FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL
SELECT 'order_status_history', COUNT(*) FROM order_status_history
UNION ALL
SELECT 'pickup_tokens', COUNT(*) FROM pickup_tokens
UNION ALL
SELECT 'void_tokens', COUNT(*) FROM void_tokens
UNION ALL
SELECT 'guest_receipts', COUNT(*) FROM guest_receipts;

-- All counts should be 0 ✅
