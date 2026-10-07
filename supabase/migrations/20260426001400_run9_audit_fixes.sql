-- ============================================================
-- AUDIT FIXES MIGRATION
-- Run in Supabase SQL Editor after all previous migrations
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- FIX 5: Stock re-enable trigger checks ALL ingredients
-- ═══════════════════════════════════════════════════════════════

-- The old trigger re-enabled a menu item when ANY single ingredient
-- moved above zero, ignoring whether OTHER required ingredients
-- were still out of stock. This rewrites it to check ALL ingredients.

CREATE OR REPLACE FUNCTION check_stock_and_mark_unavailable()
RETURNS TRIGGER AS $$
DECLARE
  item_row RECORD;
  all_stocked BOOLEAN;
BEGIN
  -- When an ingredient runs out: mark dependent items unavailable
  IF NEW.current_stock <= 0 AND OLD.current_stock > 0 THEN
    UPDATE menu_items SET is_available = false
    WHERE id IN (
      SELECT DISTINCT mii.menu_item_id
      FROM menu_item_ingredients mii
      WHERE mii.ingredient_id = NEW.id
    );

  -- When an ingredient is restocked: only re-enable if ALL required ingredients are stocked
  ELSIF NEW.current_stock > 0 AND OLD.current_stock <= 0 THEN
    FOR item_row IN
      SELECT DISTINCT mii.menu_item_id
      FROM menu_item_ingredients mii
      WHERE mii.ingredient_id = NEW.id
    LOOP
      -- Check if ALL ingredients for this menu item have stock > 0
      SELECT NOT EXISTS (
        SELECT 1
        FROM menu_item_ingredients mii2
        JOIN ingredients ing ON ing.id = mii2.ingredient_id
        WHERE mii2.menu_item_id = item_row.menu_item_id
          AND ing.current_stock <= 0
      ) INTO all_stocked;

      IF all_stocked THEN
        UPDATE menu_items SET is_available = true
        WHERE id = item_row.menu_item_id AND status = 'active';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger already exists, function is replaced in-place

-- ═══════════════════════════════════════════════════════════════
-- FIX 6: Atomic restock RPC (prevents race conditions)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION restock_ingredient(
  p_ingredient_id UUID,
  p_amount NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS TABLE(new_stock NUMERIC) AS $$
DECLARE
  result_stock NUMERIC;
BEGIN
  -- Atomic increment
  UPDATE ingredients
  SET current_stock = current_stock + p_amount,
      updated_at = now()
  WHERE id = p_ingredient_id
  RETURNING current_stock INTO result_stock;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient not found: %', p_ingredient_id;
  END IF;

  -- Log the restock
  INSERT INTO inventory_logs (ingredient_id, change_amount, change_type, notes, stock_after)
  VALUES (p_ingredient_id, p_amount, 'restock', p_note, result_stock);

  RETURN QUERY SELECT result_stock;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- FIX 2: Points deduction RPC (atomic, prevents over-spending)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION deduct_points(
  p_user_id UUID,
  p_amount INT
)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET points = points - p_amount,
      updated_at = now()
  WHERE id = p_user_id AND points >= p_amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient points for user %', p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- FIX 8: Unique constraint on active menu item names
-- ═══════════════════════════════════════════════════════════════

-- Partial unique index: only active items must have unique names.
-- Archived items can share names with active items.
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_name_unique
  ON menu_items (lower(name))
  WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════

SELECT 'AUDIT FIXES APPLIED' AS result,
  (SELECT count(*) FROM pg_proc WHERE proname = 'restock_ingredient') AS restock_rpc,
  (SELECT count(*) FROM pg_proc WHERE proname = 'deduct_points') AS deduct_rpc,
  (SELECT count(*) FROM pg_indexes WHERE indexname = 'idx_menu_items_name_unique') AS unique_idx;
