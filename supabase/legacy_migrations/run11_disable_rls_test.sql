-- run11_disable_rls_test.sql
-- TEMPORARILY disable Row Level Security on menu_items to isolate the bug
ALTER TABLE menu_items DISABLE ROW LEVEL SECURITY;
