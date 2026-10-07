-- Allow menu items to be uncategorized
ALTER TABLE menu_items ALTER COLUMN category_id DROP NOT NULL;
