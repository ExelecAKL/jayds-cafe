-- ============================================================
-- PART 3 of 3: Triggers + Guard + Verification
-- Run this LAST (after Parts 1 and 2 succeed)
-- ============================================================

-- 1. SMART DEDUCTION: base recipe + variant add-ons
CREATE OR REPLACE FUNCTION deduct_inventory_on_order_complete()
RETURNS TRIGGER AS $fn1$
DECLARE
  item RECORD;
  recipe RECORD;
  vi RECORD;
  size_label text;
  multiplier numeric;
  deduct_qty numeric;
  v_variant jsonb;
  v_label text;
  v_group text;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    FOR item IN
      SELECT oi.menu_item_id, oi.quantity, oi.variants
      FROM order_items oi WHERE oi.order_id = NEW.id
    LOOP
      -- Determine size label from variants
      size_label := 'Medium 16oz';
      IF item.variants IS NOT NULL AND jsonb_typeof(item.variants) = 'array' THEN
        SELECT v->>'label' INTO size_label
        FROM jsonb_array_elements(item.variants) v
        WHERE v->>'variant_group' = 'size'
        LIMIT 1;
        IF size_label IS NULL THEN size_label := 'Medium 16oz'; END IF;
      END IF;

      -- Phase 1: Deduct BASE recipe ingredients (with size multiplier)
      FOR recipe IN
        SELECT mii.ingredient_id, mii.quantity_used, mii.size_multipliers
        FROM menu_item_ingredients mii
        WHERE mii.menu_item_id = item.menu_item_id
      LOOP
        multiplier := COALESCE((recipe.size_multipliers->>size_label)::numeric, 1);
        deduct_qty := recipe.quantity_used * multiplier * item.quantity;

        UPDATE ingredients
        SET current_stock = GREATEST(0, current_stock - deduct_qty), updated_at = now()
        WHERE id = recipe.ingredient_id;

        INSERT INTO inventory_logs (ingredient_id, change_amount, change_type, order_id, stock_after)
        SELECT recipe.ingredient_id, -deduct_qty, 'order_deduction', NEW.id,
               (SELECT current_stock FROM ingredients WHERE id = recipe.ingredient_id);
      END LOOP;

      -- Phase 2: Deduct VARIANT-specific ingredients (add-ons, packaging, sugar)
      IF item.variants IS NOT NULL AND jsonb_typeof(item.variants) = 'array' THEN
        FOR v_variant IN SELECT * FROM jsonb_array_elements(item.variants) LOOP
          v_label := v_variant->>'label';
          v_group := v_variant->>'variant_group';

          FOR vi IN
            SELECT ving.ingredient_id, ving.quantity_used
            FROM variant_ingredients ving
            WHERE ving.variant_label = v_label
              AND (ving.variant_group = v_group OR v_group IS NULL)
          LOOP
            deduct_qty := vi.quantity_used * item.quantity;

            UPDATE ingredients
            SET current_stock = GREATEST(0, current_stock - deduct_qty), updated_at = now()
            WHERE id = vi.ingredient_id;

            INSERT INTO inventory_logs (ingredient_id, change_amount, change_type, order_id, notes, stock_after)
            SELECT vi.ingredient_id, -deduct_qty, 'order_deduction', NEW.id,
                   'variant: ' || v_label,
                   (SELECT current_stock FROM ingredients WHERE id = vi.ingredient_id);
          END LOOP;
        END LOOP;
      END IF;

    END LOOP;
  END IF;
  RETURN NEW;
END;
$fn1$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_deduct_inventory ON orders;
CREATE TRIGGER trg_deduct_inventory
  AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION deduct_inventory_on_order_complete();

-- 2. Auto-toggle availability when stock = 0
CREATE OR REPLACE FUNCTION check_stock_and_mark_unavailable()
RETURNS TRIGGER AS $fn2$
BEGIN
  IF NEW.current_stock <= 0 AND OLD.current_stock > 0 THEN
    UPDATE menu_items SET is_available = false
    WHERE id IN (SELECT DISTINCT mii.menu_item_id FROM menu_item_ingredients mii WHERE mii.ingredient_id = NEW.id);
  ELSIF NEW.current_stock > 0 AND OLD.current_stock <= 0 THEN
    UPDATE menu_items SET is_available = true
    WHERE id IN (SELECT DISTINCT mii.menu_item_id FROM menu_item_ingredients mii WHERE mii.ingredient_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$fn2$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_stock_availability ON ingredients;
CREATE TRIGGER trg_stock_availability
  AFTER UPDATE ON ingredients FOR EACH ROW EXECUTE FUNCTION check_stock_and_mark_unavailable();

-- 3. Award points (tier-aware multiplier)
CREATE OR REPLACE FUNCTION award_points_on_completion()
RETURNS TRIGGER AS $fn3$
DECLARE
  base_points integer;
  multiplier numeric;
  tier text;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.customer_id IS NOT NULL THEN
    base_points := GREATEST(1, floor(NEW.total / 10));
    SELECT loyalty_tier INTO tier FROM profiles WHERE id = NEW.customer_id;
    CASE tier
      WHEN 'Gold' THEN multiplier := 1.5;
      WHEN 'Silver' THEN multiplier := 1.2;
      ELSE multiplier := 1.0;
    END CASE;
    UPDATE profiles
    SET points = points + floor(base_points * multiplier),
        total_spent = total_spent + NEW.total,
        total_orders = total_orders + 1,
        last_order_at = now(),
        updated_at = now()
    WHERE id = NEW.customer_id;
    UPDATE orders SET points_earned = floor(base_points * multiplier) WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$fn3$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_award_points ON orders;
CREATE TRIGGER trg_award_points
  AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION award_points_on_completion();

-- 4. Auto-upgrade loyalty tier
CREATE OR REPLACE FUNCTION update_loyalty_tier()
RETURNS TRIGGER AS $fn4$
DECLARE
  new_tier text;
BEGIN
  SELECT name INTO new_tier
  FROM loyalty_tiers
  WHERE min_points <= NEW.points
  ORDER BY min_points DESC
  LIMIT 1;
  IF new_tier IS NOT NULL AND new_tier IS DISTINCT FROM NEW.loyalty_tier THEN
    NEW.loyalty_tier := new_tier;
  END IF;
  RETURN NEW;
END;
$fn4$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_tier ON profiles;
CREATE TRIGGER trg_update_tier
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_loyalty_tier();

-- 5. Update guard_profile_mutation
CREATE OR REPLACE FUNCTION guard_profile_mutation()
RETURNS TRIGGER AS $fn5$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.points IS DISTINCT FROM OLD.points
     OR NEW.total_orders IS DISTINCT FROM OLD.total_orders
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.loyalty_tier IS DISTINCT FROM OLD.loyalty_tier
     OR NEW.total_spent IS DISTINCT FROM OLD.total_spent
  THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
      RAISE EXCEPTION 'Cannot modify protected profile fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn5$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. VERIFICATION
SELECT
  'ALL DONE' AS result,
  (SELECT count(*) FROM loyalty_tiers) AS tiers,
  (SELECT count(*) FROM ingredients) AS ingredients,
  (SELECT count(*) FROM menu_item_ingredients) AS base_recipes,
  (SELECT count(*) FROM variant_ingredients) AS variant_maps,
  (SELECT count(*) FROM item_variants WHERE variant_group = 'add_on') AS addon_variants;
