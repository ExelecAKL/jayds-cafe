-- PART 13: Menu item tags
-- Ensures admin-created menu items can persist the customer-facing item type
-- label (coffee, non-coffee, food) used by customer menu cards.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

UPDATE public.menu_items
SET tags = '{}'
WHERE tags IS NULL;

ALTER TABLE public.menu_items
  ALTER COLUMN tags SET DEFAULT '{}',
  ALTER COLUMN tags SET NOT NULL;

SELECT 'PART 13 COMPLETE: menu item tags column ensured' AS status;
