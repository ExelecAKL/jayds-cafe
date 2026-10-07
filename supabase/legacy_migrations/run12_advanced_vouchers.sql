-- ============================================================
-- PART 12: Advanced Vouchers System
-- Adds item-specific targeting, application modes, and max caps
-- ============================================================

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS applicable_item_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS application_mode TEXT DEFAULT 'whole_order',
  ADD COLUMN IF NOT EXISTS max_discount_amount NUMERIC;

-- Ensure application_mode is strictly 'whole_order' or 'selected_items'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_application_mode_check'
    ) THEN
        ALTER TABLE vouchers ADD CONSTRAINT vouchers_application_mode_check
        CHECK (application_mode IN ('whole_order', 'selected_items'));
    END IF;
END $$;

SELECT 'PART 12 COMPLETE: Advanced Vouchers columns added' AS status;
