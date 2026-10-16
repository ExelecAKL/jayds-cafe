-- Prune impossible configurations before optional-choice enumeration.
CREATE OR REPLACE FUNCTION public.inv_any_configuration_available(p_item uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE config jsonb; defaults jsonb;
BEGIN

 -- A missing mandatory base ingredient cannot be repaired by enumerating options.
 -- Use the smallest configured size, and skip ingredients any option can replace.
 IF EXISTS(SELECT 1 FROM menu_items m WHERE m.id=p_item AND (m.status<>'active' OR NOT m.manually_available)) THEN RETURN false; END IF;
 IF (SELECT enforcement_enabled FROM inventory_settings WHERE id) AND EXISTS(
  SELECT 1 FROM menu_item_ingredients r JOIN ingredients i ON i.id=r.ingredient_id
  WHERE r.menu_item_id=p_item
  AND NOT EXISTS(SELECT 1 FROM variant_ingredients vi JOIN item_variants iv ON iv.menu_item_id=p_item AND iv.variant_group=vi.variant_group AND iv.label=vi.variant_label WHERE vi.replaces_ingredient_id=r.ingredient_id)
  AND (NOT i.is_active OR COALESCE((SELECT sum(GREATEST(0,b.quantity-b.reserved)) FROM stock_batches b WHERE b.ingredient_id=r.ingredient_id AND (b.expires_on IS NULL OR b.expires_on>=inv_business_date())),0)
   <r.quantity_used*COALESCE((SELECT min(COALESCE((r.size_multipliers->>v.label)::numeric,1)) FROM item_variants v WHERE v.menu_item_id=p_item AND v.variant_group='size'),1))
 ) THEN RETURN false; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('variant_group',variant_group,'label',label)),'[]') INTO defaults FROM item_variants WHERE menu_item_id=p_item AND is_default;
 IF (NOT EXISTS(SELECT 1 FROM item_variants WHERE menu_item_id=p_item AND variant_group='size') OR EXISTS(SELECT 1 FROM jsonb_array_elements(defaults) x WHERE x->>'variant_group'='size')) AND (get_item_availability(p_item,defaults)->>'available')::boolean THEN RETURN true; END IF;
 -- Try optional substitutions as well as sizes when the default recipe is sold out.
 FOR config IN WITH RECURSIVE groups AS (
   SELECT variant_group,row_number() OVER(ORDER BY variant_group)::integer n FROM item_variants WHERE menu_item_id=p_item GROUP BY variant_group
 ), choices(n,config) AS (
   SELECT 0,'[]'::jsonb
   UNION ALL SELECT g.n,c.config||v.choice FROM choices c JOIN groups g ON g.n=c.n+1 CROSS JOIN LATERAL (
     SELECT jsonb_build_array(jsonb_build_object('variant_group',iv.variant_group,'label',iv.label)) choice FROM item_variants iv WHERE iv.menu_item_id=p_item AND iv.variant_group=g.variant_group
     UNION ALL SELECT '[]'::jsonb WHERE g.variant_group<>'size'
   ) v
 ) SELECT c.config FROM choices c WHERE c.n=(SELECT count(*) FROM groups) LOOP
   IF (get_item_availability(p_item,config)->>'available')::boolean THEN RETURN true; END IF;
 END LOOP;
 RETURN false;
END $$;
