-- Explicit thesis/demo setup only. Never run as an automatic production migration.
-- User confirmed that existing database quantities are the demo's starting stock.
-- These four SAMPLE recipes use the current stock master; they are not certified
-- café recipes. Portions follow the older frappe templates and existing demo
-- flavor stock. Purchasing, prices, existing recipes and history are untouched.
BEGIN;
SELECT pg_advisory_xact_lock(8712342);
LOCK TABLE public.orders,public.ingredients,public.stock_batches,public.menu_items,
 public.menu_item_ingredients,public.item_variants,public.variant_ingredients,
 public.stocktakes,public.stock_movements IN SHARE ROW EXCLUSIVE MODE;
DO $demo$
DECLARE actor uuid; item record; line record; stock uuid; count_id uuid;
 milk_sizes jsonb := '{"Medium 16oz":1,"Large 22oz":1.3}';
BEGIN
 IF (SELECT enforcement_enabled FROM public.inventory_settings WHERE id) THEN RETURN; END IF;
 IF (SELECT count(*) FROM public.profiles WHERE role='admin' AND is_approved)<>1 THEN
  RAISE EXCEPTION 'Identify the approved Admin before running the demo setup';
 END IF;
 SELECT id INTO actor FROM public.profiles WHERE role='admin' AND is_approved;
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 PERFORM public.inv_require_admin();
 IF EXISTS(SELECT 1 FROM public.orders WHERE status IN ('pending','confirmed','preparing','ready') AND NOT is_parked) THEN
  RAISE EXCEPTION 'Finish active orders before demo activation';
 END IF;
 FOR item IN SELECT * FROM (VALUES
  ('e3000000-0000-4000-a000-000000000002'::uuid,'Cookies & Cream'),
  ('e3000000-0000-4000-a000-000000000005'::uuid,'Strawberries & Cream'),
  ('e3000000-0000-4000-a000-000000000008'::uuid,'Java Chip'),
  ('e3000000-0000-4000-a000-00000000000a'::uuid,'Biscoff Frappe')
 ) AS products(id,name) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.menu_items WHERE id=item.id AND name=item.name) THEN
   RAISE EXCEPTION 'Expected demo product is missing or renamed: %',item.name;
  END IF;
  -- Preserve a recipe entered by an Admin instead of replacing it.
  IF EXISTS(SELECT 1 FROM public.menu_item_ingredients WHERE menu_item_id=item.id) THEN CONTINUE; END IF;
  FOR line IN SELECT 'Whole Milk' name,150::numeric quantity,milk_sizes sizes
   UNION ALL SELECT 'Ice',200,'{}'::jsonb
   UNION ALL SELECT name,quantity,sizes FROM (VALUES
    ('Cookies & Cream','Cookies Crumble',20::numeric,'{}'::jsonb),
    ('Strawberries & Cream','Strawberry Puree',45::numeric,milk_sizes),
    ('Java Chip','Espresso Beans',36::numeric,'{}'::jsonb),
    ('Java Chip','Chocolate Chips',20::numeric,'{}'::jsonb),
    ('Biscoff Frappe','Espresso Beans',36::numeric,'{}'::jsonb),
    ('Biscoff Frappe','Biscoff Spread',30::numeric,milk_sizes),
    ('Biscoff Frappe','Cookies Crumble',10::numeric,'{}'::jsonb)
   ) AS flavors(product,name,quantity,sizes) WHERE product=item.name
  LOOP
   SELECT id INTO stock FROM public.ingredients WHERE name=line.name AND is_active;
   IF NOT FOUND THEN RAISE EXCEPTION 'Demo ingredient unavailable: %',line.name; END IF;
   INSERT INTO public.menu_item_ingredients(menu_item_id,ingredient_id,quantity_used,size_multipliers)
    VALUES(item.id,stock,line.quantity,line.sizes);
  END LOOP;
  INSERT INTO public.admin_audit(actor_id,action,entity,entity_id,reason)
   VALUES(actor,'thesis_demo_recipe','menu_items',item.id,
    'Sample recipe for thesis demonstration; validate actual portions before café production. Packaging uses existing size-option requirements.');
 END LOOP;
 FOR item IN SELECT i.* FROM public.ingredients i WHERE i.is_active AND NOT EXISTS(
  SELECT 1 FROM public.stocktakes s WHERE s.ingredient_id=i.id AND s.state='posted' AND s.counted=i.current_stock
  AND NOT EXISTS(SELECT 1 FROM public.stock_movements m WHERE m.ingredient_id=i.id AND m.created_at>s.created_at AND m.source_id IS DISTINCT FROM s.id))
 ORDER BY i.id LOOP
  INSERT INTO public.stocktakes(ingredient_id,expected,counted,version,reason,actor_id)
   VALUES(item.id,item.current_stock,item.current_stock,item.stock_version,
    'Thesis demo opening stock: existing database quantity, authorized by owner; not a physical shelf count.',actor)
   RETURNING id INTO count_id;
  PERFORM public.inv_post_stocktake(count_id);
 END LOOP;
 PERFORM public.inv_activate(true);
 INSERT INTO public.admin_audit(actor_id,action,entity,reason,after_data)
  VALUES(actor,'thesis_demo_activation','inventory_settings',
   'Owner authorized existing quantities as thesis/demo opening stock. Actual physical quantities and sample recipes require verification before café production.',
   jsonb_build_object('enforcement_enabled',true,'physical_count_claimed',false,'historical_orders_deducted',false));
END $demo$;
COMMIT;
