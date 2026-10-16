-- Forward-only catalog corrections. Historical orders and recorded stock requirements are immutable.
WITH eligible AS (
 SELECT m.id FROM menu_items m WHERE regexp_replace(lower(m.name),'[^a-z]','','g') IN
 ('coffeelatte','spanishlatte','vanillalatte','caramellatte','aussielatte','hazelnutlatte','macadamialatte','butterscotchlatte','whitemochalatte')
 AND EXISTS(SELECT 1 FROM item_variants v WHERE v.menu_item_id=m.id AND v.variant_group='milk_sub')
)
UPDATE item_variants SET is_default=false WHERE variant_group='milk_sub' AND menu_item_id IN(SELECT id FROM eligible);
INSERT INTO item_variants(menu_item_id,variant_group,label,price_modifier,is_default,sort_order)
SELECT m.id,'milk_sub','Whole Milk',0,true,-1 FROM menu_items m
WHERE regexp_replace(lower(m.name),'[^a-z]','','g') IN
 ('coffeelatte','spanishlatte','vanillalatte','caramellatte','aussielatte','hazelnutlatte','macadamialatte','butterscotchlatte','whitemochalatte')
 AND EXISTS(SELECT 1 FROM item_variants v WHERE v.menu_item_id=m.id AND v.variant_group='milk_sub')
 AND NOT EXISTS(SELECT 1 FROM item_variants v WHERE v.menu_item_id=m.id AND v.variant_group='milk_sub' AND v.label='Whole Milk');
UPDATE item_variants v SET is_default=true,price_modifier=0,sort_order=-1 FROM menu_items m
WHERE v.menu_item_id=m.id AND v.variant_group='milk_sub' AND v.label='Whole Milk'
 AND regexp_replace(lower(m.name),'[^a-z]','','g') IN
 ('coffeelatte','spanishlatte','vanillalatte','caramellatte','aussielatte','hazelnutlatte','macadamialatte','butterscotchlatte','whitemochalatte');
DELETE FROM menu_item_ingredients r USING menu_items m,ingredients i
WHERE r.menu_item_id=m.id AND r.ingredient_id=i.id AND
 ((regexp_replace(lower(m.name),'[^a-z]','','g')='americano' AND regexp_replace(lower(i.name),'[^a-z]','','g')='wholemilk')
 OR (regexp_replace(lower(m.name),'[^a-z]','','g')='matchalatte' AND regexp_replace(lower(i.name),'[^a-z]','','g')='espressobeans'));

ALTER FUNCTION public.inv_save_menu(uuid,jsonb,jsonb,jsonb) RENAME TO inv_save_menu_before_default_checks;
REVOKE ALL ON FUNCTION public.inv_save_menu_before_default_checks(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.inv_save_menu(p_id uuid,p_item jsonb,p_recipes jsonb,p_variants jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM inv_require_admin();
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_variants) v GROUP BY v->>'variant_group',trim(v->>'label') HAVING count(*)>1) THEN RAISE EXCEPTION 'Option labels must be unique within their group'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_variants) v WHERE v->>'variant_group'<>'add_on' GROUP BY v->>'variant_group' HAVING count(*) FILTER(WHERE (v->>'is_default')::boolean)<>1) THEN RAISE EXCEPTION 'Choose exactly one default in every required option group'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_variants) v WHERE v->>'variant_group'='add_on' AND (v->>'is_default')::boolean) THEN RAISE EXCEPTION 'Add-ons cannot be selected by default'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_variants) v WHERE v->>'variant_group'='milk_sub') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_variants) v WHERE v->>'variant_group'='milk_sub' AND v->>'label'='Whole Milk' AND (v->>'is_default')::boolean AND (v->>'price_modifier')::numeric=0) THEN RAISE EXCEPTION 'Whole Milk must be the included milk default'; END IF;
 RETURN inv_save_menu_before_default_checks(p_id,p_item,p_recipes,p_variants);
END $$;
REVOKE ALL ON FUNCTION public.inv_save_menu(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inv_save_menu(uuid,jsonb,jsonb,jsonb) TO authenticated,service_role;

ALTER FUNCTION public.get_published_catalog() RENAME TO get_published_catalog_before_milk_labels;
REVOKE ALL ON FUNCTION public.get_published_catalog_before_milk_labels() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_published_catalog() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=get_published_catalog_before_milk_labels();
 RETURN jsonb_set(result,'{menuItems}',COALESCE((SELECT jsonb_agg(item||jsonb_build_object('included_milk',
  (SELECT 'Whole Milk' FROM menu_item_ingredients r JOIN ingredients i ON i.id=r.ingredient_id WHERE r.menu_item_id=(item->>'id')::uuid AND regexp_replace(lower(i.name),'[^a-z]','','g')='wholemilk' LIMIT 1))) FROM jsonb_array_elements(result->'menuItems') item),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.get_published_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_catalog() TO anon,authenticated,service_role;
