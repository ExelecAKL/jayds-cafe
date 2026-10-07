-- Jayds single-branch operations. Enforcement stays OFF until an admin reconciles stock.
CREATE TABLE public.inventory_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK(id), enforcement_enabled boolean NOT NULL DEFAULT false,
  branch_name text NOT NULL DEFAULT 'Jayds Café · Main branch', catalog_version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.inventory_settings(id) VALUES(true);
CREATE TABLE public.catalog_state(id boolean PRIMARY KEY DEFAULT true CHECK(id), version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.catalog_state(id) VALUES(true);
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
  contact_name text, email text, phone text, lead_time_days integer NOT NULL DEFAULT 3 CHECK(lead_time_days>=0),
  notes text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ingredients
  ADD COLUMN stock_kind text NOT NULL DEFAULT 'ingredient' CHECK(stock_kind IN ('ingredient','packaging','finished_good')),
  ADD COLUMN sku text UNIQUE, ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id),
  ADD COLUMN pack_size numeric NOT NULL DEFAULT 1 CHECK(pack_size>0),
  ADD COLUMN min_purchase_packs integer NOT NULL DEFAULT 1 CHECK(min_purchase_packs>=1),
  ADD COLUMN lead_time_days integer NOT NULL DEFAULT 3 CHECK(lead_time_days>=0),
  ADD COLUMN safety_days integer NOT NULL DEFAULT 2 CHECK(safety_days>=0),
  ADD COLUMN review_days integer NOT NULL DEFAULT 7 CHECK(review_days>=1),
  ADD COLUMN max_stock numeric CHECK(max_stock>=0), ADD COLUMN stock_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.menu_items ADD COLUMN manually_available boolean;
ALTER TABLE public.variant_ingredients ADD COLUMN size_multipliers jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.orders ADD COLUMN inventory_managed boolean NOT NULL DEFAULT false,
  ADD COLUMN inventory_consumed boolean NOT NULL DEFAULT false, ADD COLUMN stock_conflict boolean NOT NULL DEFAULT false,
  ADD COLUMN is_parked boolean NOT NULL DEFAULT false, ADD COLUMN idempotency_key text UNIQUE,
  ADD COLUMN request_fingerprint text, ADD COLUMN rewards_returned boolean NOT NULL DEFAULT false,
  ADD COLUMN redeemed_voucher_id uuid REFERENCES public.vouchers(id);
-- Initialize only new flags without rewriting original timestamps or replaying legacy events.
-- Pause existing user UPDATE triggers solely for these backfills, then restore exact modes.
DO $preserve_existing_records$
DECLARE saved jsonb; t record;
BEGIN
 SELECT COALESCE(jsonb_agg(jsonb_build_object('table_name',c.relname,'trigger_name',g.tgname,'mode',g.tgenabled)),'[]') INTO saved
 FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('menu_items','orders') AND NOT g.tgisinternal AND (g.tgtype & 16)<>0 AND g.tgenabled<>'D';
 FOR t IN SELECT * FROM jsonb_to_recordset(saved) AS x(table_name text,trigger_name text,mode text) LOOP
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I',t.table_name,t.trigger_name);
 END LOOP;
 UPDATE public.menu_items SET manually_available=is_available;
 UPDATE public.orders SET is_parked=true WHERE notes LIKE '[PARKED]%';
 UPDATE public.orders SET rewards_returned=true WHERE status='cancelled';
 FOR t IN SELECT * FROM jsonb_to_recordset(saved) AS x(table_name text,trigger_name text,mode text) LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE %s TRIGGER %I',t.table_name,CASE t.mode WHEN 'A' THEN 'ALWAYS' WHEN 'R' THEN 'REPLICA' ELSE '' END,t.trigger_name);
 END LOOP;
END $preserve_existing_records$;
ALTER TABLE public.menu_items ALTER COLUMN manually_available SET DEFAULT true, ALTER COLUMN manually_available SET NOT NULL;
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number text NOT NULL UNIQUE DEFAULT ('PO-'||substr(gen_random_uuid()::text,1,8)),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id), status text NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','approved','ordered','partial','received','cancelled')),
  expected_on date, notes text, generated boolean NOT NULL DEFAULT false, manually_edited boolean NOT NULL DEFAULT false,
  actor_id uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_automatic_draft_per_supplier ON public.purchase_orders(supplier_id) WHERE generated AND NOT manually_edited AND status='draft';
CREATE TABLE public.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id),
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id), quantity numeric NOT NULL CHECK(quantity>0),
  received_quantity numeric NOT NULL DEFAULT 0 CHECK(received_quantity>=0 AND received_quantity<=quantity),
  unit_cost numeric NOT NULL CHECK(unit_cost>=0), UNIQUE(purchase_order_id,ingredient_id)
);
CREATE TABLE public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_order_id uuid REFERENCES public.purchase_orders(id),
  reference text NOT NULL, idempotency_key uuid NOT NULL UNIQUE, fingerprint text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.stock_batches (
  -- Quantity is recorded in the stock item's base unit.
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
  batch_code text NOT NULL, quantity numeric NOT NULL CHECK(quantity>=0), reserved numeric NOT NULL DEFAULT 0 CHECK(reserved>=0),
  unit_cost numeric NOT NULL CHECK(unit_cost>=0), expires_on date, received_at timestamptz NOT NULL DEFAULT now(),
  receipt_id uuid REFERENCES public.goods_receipts(id)
);
CREATE INDEX batches_fefo ON public.stock_batches(ingredient_id, expires_on, received_at);
CREATE UNIQUE INDEX unique_supplier_delivery_reference ON public.goods_receipts(purchase_order_id,lower(trim(reference))) WHERE purchase_order_id IS NOT NULL;
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
  batch_id uuid REFERENCES public.stock_batches(id), quantity numeric NOT NULL,
  movement_type text NOT NULL CHECK(movement_type IN ('opening','receipt','consumption','waste','count','legacy','disposition')),
  balance_after numeric NOT NULL, actor_id uuid REFERENCES public.profiles(id), reason text NOT NULL,
  order_id uuid REFERENCES public.orders(id), source_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movements_item_time ON public.stock_movements(ingredient_id,created_at DESC);
CREATE TABLE public.order_stock_requirements (
  order_id uuid NOT NULL REFERENCES public.orders(id), ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
  quantity numeric NOT NULL CHECK(quantity>0), unit_cost numeric NOT NULL DEFAULT 0 CHECK(unit_cost>=0), PRIMARY KEY(order_id,ingredient_id)
);
CREATE TABLE public.stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id),
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id), batch_id uuid NOT NULL REFERENCES public.stock_batches(id),
  quantity numeric NOT NULL CHECK(quantity>0), unit_cost numeric NOT NULL CHECK(unit_cost>=0),
  state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','consumed','released'))
);
CREATE INDEX reservation_order ON public.stock_reservations(order_id,state);
CREATE TABLE public.stocktakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
  expected numeric NOT NULL, counted numeric NOT NULL CHECK(counted>=0), version bigint NOT NULL,
  reason text NOT NULL, state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','posted')),
  actor_id uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.inventory_forecasts (
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id), horizon integer NOT NULL CHECK(horizon IN (7,14,30)),
  demand numeric NOT NULL, daily_demand numeric NOT NULL, history_days integer NOT NULL,
  method text NOT NULL, historical_estimate boolean NOT NULL, calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(ingredient_id,horizon)
);
CREATE TABLE public.admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES public.profiles(id),
  action text NOT NULL, entity text NOT NULL, entity_id uuid, before_data jsonb, after_data jsonb,
  reason text, created_at timestamptz NOT NULL DEFAULT now()
);
-- Preserve legacy balances and logs; these lots make no claim about unknown expiry dates.
INSERT INTO public.stock_batches(ingredient_id,batch_code,quantity,unit_cost)
SELECT id,'Opening balance · reconcile before activation',GREATEST(current_stock,0),GREATEST(cost_per_unit,0) FROM public.ingredients;
INSERT INTO public.stock_movements(ingredient_id,batch_id,quantity,movement_type,balance_after,reason)
SELECT ingredient_id,id,quantity,'opening',quantity,'Imported balance; physical reconciliation required' FROM public.stock_batches;

CREATE FUNCTION public.inv_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(auth.role()='service_role',false) OR (session_user='postgres' AND auth.role() IS NULL) OR EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin');
$$;
CREATE FUNCTION public.inv_require_admin() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT inv_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF; END $$;
CREATE FUNCTION public.inv_business_date() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Manila')::date $$;
CREATE FUNCTION public.inv_bump_catalog() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF current_setting('jayds.catalog_bumped',true)='1' THEN RETURN NULL; END IF;
 PERFORM set_config('jayds.catalog_bumped','1',true);
 UPDATE catalog_state SET version=version+1,updated_at=now() WHERE id; RETURN NULL;
END $$;
CREATE TRIGGER inv_catalog_items AFTER INSERT OR UPDATE OR DELETE ON public.menu_items FOR EACH STATEMENT EXECUTE FUNCTION public.inv_bump_catalog();
CREATE TRIGGER inv_catalog_categories AFTER INSERT OR UPDATE OR DELETE ON public.categories FOR EACH STATEMENT EXECUTE FUNCTION public.inv_bump_catalog();
CREATE TRIGGER inv_catalog_variants AFTER INSERT OR UPDATE OR DELETE ON public.item_variants FOR EACH STATEMENT EXECUTE FUNCTION public.inv_bump_catalog();
CREATE TRIGGER inv_catalog_recipes AFTER INSERT OR UPDATE OR DELETE ON public.menu_item_ingredients FOR EACH STATEMENT EXECUTE FUNCTION public.inv_bump_catalog();
CREATE TRIGGER inv_catalog_variant_recipes AFTER INSERT OR UPDATE OR DELETE ON public.variant_ingredients FOR EACH STATEMENT EXECUTE FUNCTION public.inv_bump_catalog();
CREATE TRIGGER inv_catalog_stock AFTER INSERT OR UPDATE OR DELETE ON public.ingredients FOR EACH STATEMENT EXECUTE FUNCTION public.inv_bump_catalog();
CREATE FUNCTION public.inv_batch_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target uuid:=COALESCE(NEW.ingredient_id,OLD.ingredient_id); previous text:=COALESCE(current_setting('jayds.stock_sync',true),'');
BEGIN
  IF previous='1' THEN RETURN NULL; END IF;
  PERFORM set_config('jayds.stock_sync','1',true);
  UPDATE ingredients SET current_stock=(SELECT COALESCE(sum(quantity),0) FROM stock_batches WHERE ingredient_id=target),
    cost_per_unit=COALESCE((SELECT sum(quantity*unit_cost)/NULLIF(sum(quantity),0) FROM stock_batches WHERE ingredient_id=target),cost_per_unit),
    stock_version=stock_version+1,updated_at=now() WHERE id=target;
  PERFORM set_config('jayds.stock_sync',previous,true);
  RETURN NULL;
END $$;
CREATE TRIGGER inv_batch_sync AFTER INSERT OR UPDATE OR DELETE ON public.stock_batches FOR EACH ROW EXECUTE FUNCTION public.inv_batch_sync();
-- Mirror pre-activation legacy deductions into lots; do not bypass the new ledger after activation.
CREATE FUNCTION public.inv_legacy_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE delta numeric:=NEW.current_stock-OLD.current_stock; b record; remaining numeric; take numeric; previous text:=COALESCE(current_setting('jayds.stock_sync',true),'');
BEGIN
  IF previous='1' OR delta=0 THEN RETURN NEW; END IF;
  IF (SELECT enforcement_enabled FROM inventory_settings WHERE id) THEN RAISE EXCEPTION 'Use stock movement operations'; END IF;
  PERFORM set_config('jayds.stock_sync','1',true);
  IF delta>0 THEN INSERT INTO stock_batches(ingredient_id,batch_code,quantity,unit_cost) VALUES(NEW.id,'Legacy receipt',delta,NEW.cost_per_unit);
  ELSE
    remaining:=-delta;
    FOR b IN SELECT * FROM stock_batches WHERE ingredient_id=NEW.id AND quantity>0 ORDER BY expires_on NULLS LAST,received_at,id FOR UPDATE LOOP
      take:=LEAST(b.quantity,remaining); UPDATE stock_batches SET quantity=quantity-take WHERE id=b.id;
      remaining:=remaining-take; EXIT WHEN remaining<=0;
    END LOOP;
  END IF;
  INSERT INTO stock_movements(ingredient_id,quantity,movement_type,balance_after,actor_id,reason)
  VALUES(NEW.id,delta,'legacy',NEW.current_stock,auth.uid(),'Legacy stock change before enforcement');
  PERFORM set_config('jayds.stock_sync',previous,true);
  NEW.stock_version:=OLD.stock_version+1;
  RETURN NEW;
END $$;
CREATE TRIGGER inv_legacy_sync BEFORE UPDATE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.inv_legacy_sync();
CREATE FUNCTION public.inv_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit records are append-only'; END $$;
CREATE TRIGGER inv_movements_immutable BEFORE UPDATE OR DELETE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.inv_immutable();
CREATE TRIGGER inv_audit_immutable BEFORE UPDATE OR DELETE ON public.admin_audit FOR EACH ROW EXECUTE FUNCTION public.inv_immutable();
CREATE FUNCTION public.inv_audit_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO admin_audit(actor_id,action,entity,entity_id,before_data,after_data)
VALUES(auth.uid(),TG_OP,TG_TABLE_NAME,COALESCE(NEW.id,OLD.id),CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END); RETURN NULL; END $$;
CREATE TRIGGER inv_audit_menu AFTER INSERT OR UPDATE OR DELETE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.inv_audit_change();
CREATE TRIGGER inv_audit_suppliers AFTER INSERT OR UPDATE OR DELETE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.inv_audit_change();
CREATE TRIGGER inv_audit_purchasing AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.inv_audit_change();
CREATE TRIGGER inv_audit_recipes AFTER INSERT OR UPDATE OR DELETE ON public.menu_item_ingredients FOR EACH ROW EXECUTE FUNCTION public.inv_audit_change();

CREATE VIEW public.stock_overview WITH(security_invoker=true) AS
SELECT i.*,COALESCE(b.reserved,0) reserved_stock,COALESCE(b.available,0) available_stock,
  COALESCE(p.incoming,0) incoming_stock,COALESCE(b.stock_value,0) stock_value,COALESCE(b.expiring,0) expiring_stock
FROM ingredients i
LEFT JOIN LATERAL(SELECT sum(reserved) reserved,
  sum(CASE WHEN expires_on IS NULL OR expires_on>=inv_business_date() THEN GREATEST(0,quantity-reserved) ELSE 0 END) available,
  sum(quantity*unit_cost) stock_value,
  sum(CASE WHEN expires_on<=inv_business_date()+14 THEN quantity ELSE 0 END) expiring
  FROM stock_batches WHERE ingredient_id=i.id) b ON true
LEFT JOIN LATERAL(SELECT sum(l.quantity-l.received_quantity) incoming FROM purchase_order_lines l JOIN purchase_orders p ON p.id=l.purchase_order_id
  WHERE l.ingredient_id=i.id AND p.status IN ('approved','ordered','partial') AND (p.expected_on IS NULL OR p.expected_on<=inv_business_date()+i.lead_time_days+i.safety_days+i.review_days)) p ON true;

-- Exact requirements: size scaling, additive options, and replacement packaging/ingredients.
CREATE FUNCTION public.inv_requirements(p_item uuid,p_variants jsonb DEFAULT '[]',p_quantity numeric DEFAULT 1)
RETURNS TABLE(ingredient_id uuid,quantity numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH size AS(SELECT COALESCE((SELECT v->>'label' FROM jsonb_array_elements(p_variants) v WHERE v->>'variant_group'='size' LIMIT 1),'Medium 16oz') label),
selected AS(SELECT vi.* FROM variant_ingredients vi WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p_variants) v
  WHERE v->>'label'=vi.variant_label AND v->>'variant_group'=vi.variant_group)),
base AS(SELECT m.ingredient_id,m.quantity_used*COALESCE((m.size_multipliers->>(SELECT label FROM size))::numeric,1) qty FROM menu_item_ingredients m
  WHERE m.menu_item_id=p_item AND NOT EXISTS(SELECT 1 FROM selected s WHERE s.replaces_ingredient_id=m.ingredient_id)),
extra AS(SELECT s.ingredient_id,s.quantity_used*COALESCE((s.size_multipliers->>(SELECT label FROM size))::numeric,
  (SELECT (r.size_multipliers->>(SELECT label FROM size))::numeric FROM menu_item_ingredients r WHERE r.menu_item_id=p_item AND r.ingredient_id=s.replaces_ingredient_id),1) qty
  FROM selected s WHERE NOT EXISTS(SELECT 1 FROM selected replacement WHERE replacement.replaces_ingredient_id=s.ingredient_id AND replacement.id<>s.id)),
combined AS(SELECT * FROM base UNION ALL SELECT * FROM extra)
SELECT c.ingredient_id,sum(c.qty)*p_quantity FROM combined c GROUP BY c.ingredient_id HAVING sum(c.qty)>0;
$$;
CREATE FUNCTION public.get_item_availability(p_item uuid,p_variants jsonb DEFAULT '[]',p_quantity integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m menu_items; cfg boolean; maximum numeric:=2147483647; r record; free numeric; count_required integer:=0;
BEGIN
  SELECT * INTO m FROM menu_items WHERE id=p_item AND status='active';
  IF NOT FOUND OR NOT m.manually_available OR (m.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM categories WHERE id=m.category_id AND is_active AND status='active')) THEN
    RETURN jsonb_build_object('available',false,'max_quantity',0,'reason','Unavailable');
  END IF;
  IF jsonb_typeof(p_variants)<>'array' OR p_quantity<1 THEN RAISE EXCEPTION 'Invalid configuration'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_variants) v WHERE NOT EXISTS(SELECT 1 FROM item_variants iv WHERE iv.menu_item_id=p_item AND iv.label=v->>'label' AND iv.variant_group=v->>'variant_group')) THEN
    RETURN jsonb_build_object('available',false,'max_quantity',0,'reason','Customization changed'); END IF;
  SELECT enforcement_enabled INTO cfg FROM inventory_settings WHERE id;
  IF NOT cfg THEN RETURN jsonb_build_object('available',m.is_available,'max_quantity',2147483647,'reason',CASE WHEN NOT m.is_available THEN 'Sold out' END); END IF;
  FOR r IN SELECT * FROM inv_requirements(p_item,p_variants,1) LOOP
    count_required:=count_required+1;
    SELECT COALESCE(sum(GREATEST(0,quantity-reserved)),0) INTO free FROM stock_batches
      WHERE ingredient_id=r.ingredient_id AND (expires_on IS NULL OR expires_on>=inv_business_date()) AND EXISTS(SELECT 1 FROM ingredients WHERE id=r.ingredient_id AND is_active);
    maximum:=LEAST(maximum,floor(free/r.quantity));
  END LOOP;
  IF count_required=0 THEN RETURN jsonb_build_object('available',false,'max_quantity',0,'reason','Stock setup required'); END IF;
  RETURN jsonb_build_object('available',maximum>=p_quantity,'max_quantity',maximum,'reason',CASE WHEN maximum<p_quantity THEN 'Insufficient stock' END);
END $$;
CREATE FUNCTION public.inv_any_configuration_available(p_item uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE config jsonb; defaults jsonb;
BEGIN
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
CREATE FUNCTION public.get_published_catalog() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object('version',(SELECT version FROM catalog_state WHERE id),'updated_at',(SELECT updated_at FROM catalog_state WHERE id),
 'categories',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sort_order) FROM categories c WHERE c.is_active AND c.status='active'),'[]'::jsonb),
 'menuItems',COALESCE((SELECT jsonb_agg(
   (to_jsonb(m)-'manually_available') || jsonb_build_object('is_available',a.sellable,
    'availability_reason',CASE WHEN NOT a.sellable THEN CASE WHEN NOT m.manually_available THEN 'Unavailable' ELSE 'Sold out' END END,
    'category',(SELECT to_jsonb(c) FROM categories c WHERE c.id=m.category_id),
    'variants',COALESCE((SELECT jsonb_agg(to_jsonb(v) || jsonb_build_object('is_available',(get_item_availability(m.id,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('variant_group',d.variant_group,'label',d.label)) FROM item_variants d WHERE d.menu_item_id=m.id AND d.is_default AND d.variant_group<>v.variant_group),'[]'::jsonb)
      ||jsonb_build_array(jsonb_build_object('variant_group',v.variant_group,'label',v.label)))->>'available')::boolean) ORDER BY v.sort_order) FROM item_variants v WHERE v.menu_item_id=m.id),'[]'::jsonb)) ORDER BY m.sort_order)
 FROM menu_items m CROSS JOIN LATERAL(SELECT inv_any_configuration_available(m.id) sellable) a
 WHERE m.status='active' AND (m.category_id IS NULL OR EXISTS(SELECT 1 FROM categories WHERE id=m.category_id AND is_active AND status='active'))),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.inv_release(p_order uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
  PERFORM 1 FROM ingredients WHERE id IN(SELECT ingredient_id FROM stock_reservations WHERE order_id=p_order AND state='reserved') ORDER BY id FOR UPDATE;
  FOR r IN SELECT * FROM stock_reservations WHERE order_id=p_order AND state='reserved' ORDER BY ingredient_id,batch_id FOR UPDATE LOOP
    UPDATE stock_batches SET reserved=reserved-r.quantity WHERE id=r.batch_id;
    UPDATE stock_reservations SET state='released' WHERE id=r.id;
  END LOOP;
END $$;
CREATE FUNCTION public.inv_reserve(p_order uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; b record; remaining numeric; take numeric;
BEGIN
  PERFORM 1 FROM ingredients WHERE id IN(SELECT ingredient_id FROM order_stock_requirements WHERE order_id=p_order) ORDER BY id FOR UPDATE;
  FOR r IN SELECT * FROM order_stock_requirements WHERE order_id=p_order ORDER BY ingredient_id LOOP
    IF NOT EXISTS(SELECT 1 FROM ingredients WHERE id=r.ingredient_id AND is_active) THEN RAISE EXCEPTION 'Stock item is inactive'; END IF;
    remaining:=r.quantity;
    FOR b IN SELECT * FROM stock_batches WHERE ingredient_id=r.ingredient_id AND quantity>reserved AND (expires_on IS NULL OR expires_on>=inv_business_date())
      ORDER BY expires_on NULLS LAST,received_at,id FOR UPDATE LOOP
      take:=LEAST(remaining,b.quantity-b.reserved);
      UPDATE stock_batches SET reserved=reserved+take WHERE id=b.id;
      INSERT INTO stock_reservations(order_id,ingredient_id,batch_id,quantity,unit_cost) VALUES(p_order,r.ingredient_id,b.id,take,b.unit_cost);
      remaining:=remaining-take; EXIT WHEN remaining<=0;
    END LOOP;
    IF remaining>0 THEN RAISE EXCEPTION 'Insufficient stock for %',(SELECT name FROM ingredients WHERE id=r.ingredient_id) USING ERRCODE='P0001'; END IF;
  END LOOP;
END $$;
CREATE FUNCTION public.inv_consume(p_order uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
  IF (SELECT inventory_consumed FROM orders WHERE id=p_order) THEN RETURN; END IF;
  -- Reallocation includes expired or count-conflicted reservations, and rolls back completely on shortage.
  PERFORM inv_release(p_order); PERFORM inv_reserve(p_order);
  FOR r IN SELECT * FROM stock_reservations WHERE order_id=p_order AND state='reserved' ORDER BY ingredient_id,batch_id FOR UPDATE LOOP
    UPDATE stock_batches SET quantity=quantity-r.quantity,reserved=reserved-r.quantity WHERE id=r.batch_id;
    INSERT INTO stock_movements(ingredient_id,batch_id,quantity,movement_type,balance_after,order_id,actor_id,reason)
    SELECT r.ingredient_id,r.batch_id,-r.quantity,'consumption',current_stock,p_order,auth.uid(),'Preparation started' FROM ingredients WHERE id=r.ingredient_id;
    UPDATE stock_reservations SET state='consumed' WHERE id=r.id;
  END LOOP;
  UPDATE orders SET inventory_consumed=true,stock_conflict=false WHERE id=p_order;
END $$;
CREATE FUNCTION public.inv_order_lifecycle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- Loyalty completion also writes this row; lock it before stock to match submission order.
  IF NEW.customer_id IS NOT NULL AND NEW.status IN ('preparing','ready','completed') THEN PERFORM 1 FROM profiles WHERE id=NEW.customer_id FOR UPDATE; END IF;
  IF NOT NEW.inventory_managed THEN RETURN NULL; END IF;
  IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN
    PERFORM inv_release(NEW.id);
    IF NEW.inventory_consumed THEN
      INSERT INTO stock_movements(ingredient_id,quantity,movement_type,balance_after,order_id,actor_id,reason)
      SELECT ingredient_id,0,'disposition',i.current_stock,NEW.id,auth.uid(),'Cancelled after preparation; consumed stock retained'
      FROM order_stock_requirements r JOIN ingredients i ON i.id=r.ingredient_id WHERE order_id=NEW.id;
    END IF;
  ELSIF NEW.status IN ('preparing','ready','completed') AND NOT NEW.inventory_consumed THEN
    IF NEW.payment_status<>'paid' THEN RAISE EXCEPTION 'Confirm payment before preparation'; END IF;
    IF NEW.is_parked THEN RAISE EXCEPTION 'Resume the parked order before preparation'; END IF;
    PERFORM inv_consume(NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER inv_order_lifecycle AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.inv_order_lifecycle();
-- Remove the zero-stock auto-enable behavior. Manual enablement is never changed by a receipt.
DROP TRIGGER IF EXISTS trg_stock_availability ON public.ingredients;
-- Existing completion deduction executes only on orders created before enforcement.
CREATE FUNCTION public.inv_legacy_order_gate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.inventory_managed AND NEW.status='completed' THEN RETURN NULL; END IF;
  RETURN NEW;
END $$;
-- Recreate the legacy trigger with a WHEN guard; its function and historical logs remain intact.
DROP TRIGGER IF EXISTS trg_deduct_inventory ON public.orders;
CREATE TRIGGER trg_deduct_inventory AFTER UPDATE ON public.orders FOR EACH ROW WHEN (NOT NEW.inventory_managed) EXECUTE FUNCTION public.deduct_inventory_on_order_complete();

CREATE FUNCTION public.inv_post_movement(p_item uuid,p_quantity numeric,p_kind text,p_reason text,p_cost numeric DEFAULT 0,p_batch text DEFAULT NULL,p_expiry date DEFAULT NULL,p_key uuid DEFAULT gen_random_uuid())
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE receipt uuid; b record; remaining numeric; take numeric; v_fingerprint text; actor uuid:=auth.uid();
BEGIN
 PERFORM inv_require_admin();
 IF p_quantity::text IN ('NaN','Infinity','-Infinity') OR p_quantity<=0 OR p_cost<0 OR p_cost::text IN ('NaN','Infinity','-Infinity') OR length(trim(p_reason))=0 OR p_kind NOT IN ('receipt','waste') THEN RAISE EXCEPTION 'Valid quantity, cost and reason are required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 v_fingerprint:=md5(jsonb_build_array(p_item,p_quantity,p_kind,p_reason,p_cost,p_batch,p_expiry)::text);
 SELECT id INTO receipt FROM goods_receipts WHERE idempotency_key=p_key AND fingerprint=v_fingerprint;
 IF FOUND THEN RETURN receipt; END IF;
 IF EXISTS(SELECT 1 FROM goods_receipts WHERE idempotency_key=p_key) THEN RAISE EXCEPTION 'Request key reused with different data'; END IF;
 PERFORM 1 FROM orders WHERE id IN(SELECT order_id FROM order_stock_requirements WHERE ingredient_id=p_item) AND inventory_managed AND NOT inventory_consumed AND status IN ('pending','confirmed') ORDER BY id FOR UPDATE;
 PERFORM 1 FROM ingredients WHERE id=p_item FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;
 INSERT INTO goods_receipts(reference,idempotency_key,fingerprint,actor_id) VALUES(p_reason,p_key,v_fingerprint,actor) RETURNING id INTO receipt;
 IF p_kind='receipt' THEN
   INSERT INTO stock_batches(ingredient_id,batch_code,quantity,unit_cost,expires_on,receipt_id)
   VALUES(p_item,COALESCE(NULLIF(p_batch,''),'Receipt '||substr(receipt::text,1,8)),p_quantity,p_cost,p_expiry,receipt) RETURNING id INTO b;
   INSERT INTO stock_movements(ingredient_id,batch_id,quantity,movement_type,balance_after,actor_id,reason,source_id)
   SELECT p_item,b.id,p_quantity,'receipt',current_stock,actor,p_reason,receipt FROM ingredients WHERE id=p_item;
 ELSE
   remaining:=p_quantity;
   FOR b IN SELECT * FROM stock_batches WHERE ingredient_id=p_item AND quantity>0 ORDER BY expires_on NULLS LAST,received_at,id FOR UPDATE LOOP
     take:=LEAST(remaining,b.quantity); UPDATE stock_batches SET quantity=quantity-take WHERE id=b.id;
     INSERT INTO stock_movements(ingredient_id,batch_id,quantity,movement_type,balance_after,actor_id,reason,source_id)
     SELECT p_item,b.id,-take,'waste',current_stock,actor,p_reason,receipt FROM ingredients WHERE id=p_item;
     remaining:=remaining-take; EXIT WHEN remaining<=0;
   END LOOP;
   IF remaining>0 THEN RAISE EXCEPTION 'Waste exceeds physical stock'; END IF;
 END IF;
 PERFORM inv_reconcile_reservations(p_item);
 RETURN receipt;
END $$;
CREATE OR REPLACE FUNCTION public.restock_ingredient(p_ingredient_id uuid,p_amount numeric,p_note text DEFAULT NULL) RETURNS TABLE(new_stock numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM inv_post_movement(p_ingredient_id,p_amount,'receipt',COALESCE(NULLIF(p_note,''),'Manual receipt'),(SELECT cost_per_unit FROM ingredients WHERE id=p_ingredient_id));
RETURN QUERY SELECT current_stock FROM ingredients WHERE id=p_ingredient_id; END $$;

CREATE FUNCTION public.inv_post_stocktake(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s stocktakes; i ingredients; b record; delta numeric; remaining numeric; take numeric;
BEGIN
 PERFORM inv_require_admin(); SELECT * INTO s FROM stocktakes WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stocktake not found'; END IF;
 IF s.state='posted' THEN RETURN; END IF;
 PERFORM 1 FROM orders WHERE id IN(SELECT order_id FROM order_stock_requirements WHERE ingredient_id=s.ingredient_id) AND inventory_managed AND NOT inventory_consumed AND status IN ('pending','confirmed') ORDER BY id FOR UPDATE;
 SELECT * INTO i FROM ingredients WHERE id=s.ingredient_id FOR UPDATE;
 IF i.stock_version<>s.version THEN RAISE EXCEPTION 'Stock changed after counting. Recount this item.'; END IF;
 IF length(trim(s.reason))=0 THEN RAISE EXCEPTION 'Count reason required'; END IF;
 delta:=s.counted-i.current_stock;
 IF delta>0 THEN INSERT INTO stock_batches(ingredient_id,batch_code,quantity,unit_cost) VALUES(i.id,'Count surplus',delta,i.cost_per_unit);
 ELSIF delta<0 THEN
   remaining:=-delta;
   FOR b IN SELECT * FROM stock_batches WHERE ingredient_id=i.id AND quantity>0 ORDER BY expires_on NULLS LAST,received_at,id FOR UPDATE LOOP
     take:=LEAST(remaining,b.quantity); UPDATE stock_batches SET quantity=quantity-take WHERE id=b.id; remaining:=remaining-take; EXIT WHEN remaining<=0;
   END LOOP;
 END IF;
 INSERT INTO stock_movements(ingredient_id,quantity,movement_type,balance_after,actor_id,reason,source_id)
 VALUES(i.id,delta,'count',s.counted,auth.uid(),s.reason,s.id);
 UPDATE stocktakes SET state='posted',actor_id=auth.uid() WHERE id=s.id;
 PERFORM inv_reconcile_reservations(s.ingredient_id);
END $$;

CREATE FUNCTION public.inv_save_menu(p_id uuid,p_item jsonb,p_recipes jsonb,p_variants jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved uuid:=COALESCE(p_id,gen_random_uuid()); line jsonb;
BEGIN
 PERFORM inv_require_admin(); PERFORM pg_advisory_xact_lock(8712342);
 IF trim(COALESCE(p_item->>'name',''))='' OR (p_item->>'price')::numeric IS NULL OR (p_item->>'price')::numeric<0 OR (p_item->>'price')::numeric::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Valid name and price required'; END IF;
 IF jsonb_typeof(p_recipes) IS DISTINCT FROM 'array' OR jsonb_typeof(p_variants) IS DISTINCT FROM 'array' OR COALESCE((p_item->>'prep_time_minutes')::integer,10)<0 THEN RAISE EXCEPTION 'Valid recipes, options and preparation time required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_variants) x GROUP BY x->>'variant_group',x->>'label' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_variants) x WHERE trim(COALESCE(x->>'label',''))='' OR COALESCE((x->>'price_modifier')::numeric,0)<0 OR (x->>'price_modifier')::numeric::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Distinct valid option labels and prices required'; END IF;
 IF COALESCE((p_item->>'manually_available')::boolean,true) AND (SELECT enforcement_enabled FROM inventory_settings WHERE id) AND jsonb_array_length(p_recipes)=0 THEN RAISE EXCEPTION 'Add stock requirements before enabling this product'; END IF;
 INSERT INTO menu_items(id,name,description,price,category_id,image_url,is_available,manually_available,is_featured,recipe_required,prep_time_minutes,tags)
 VALUES(saved,p_item->>'name',p_item->>'description',(p_item->>'price')::numeric,NULLIF(p_item->>'category_id','')::uuid,p_item->>'image_url',
 COALESCE((p_item->>'manually_available')::boolean,true),COALESCE((p_item->>'manually_available')::boolean,true),COALESCE((p_item->>'is_featured')::boolean,false),true,
 COALESCE((p_item->>'prep_time_minutes')::integer,10),ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_item->'tags','[]'))))
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,price=EXCLUDED.price,category_id=EXCLUDED.category_id,image_url=EXCLUDED.image_url,
 is_available=EXCLUDED.is_available,manually_available=EXCLUDED.manually_available,is_featured=EXCLUDED.is_featured,prep_time_minutes=EXCLUDED.prep_time_minutes,tags=EXCLUDED.tags,updated_at=now();
 DELETE FROM menu_item_ingredients WHERE menu_item_id=saved;
 FOR line IN SELECT * FROM jsonb_array_elements(p_recipes) LOOP
   IF (line->>'quantity_used')::numeric IS NULL OR (line->>'quantity_used')::numeric<=0 OR (line->>'quantity_used')::numeric::text IN ('NaN','Infinity','-Infinity') OR EXISTS(SELECT 1 FROM jsonb_each_text(COALESCE(line->'size_multipliers','{}'::jsonb)) x WHERE x.value::numeric<=0 OR x.value::numeric::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Recipe quantities must be positive'; END IF;
   INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used,size_multipliers)
   VALUES(saved,(line->>'ingredient_id')::uuid,(line->>'quantity_used')::numeric,COALESCE(line->'size_multipliers','{}'::jsonb));
 END LOOP;
 DELETE FROM item_variants WHERE menu_item_id=saved AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_variants) v WHERE v->>'variant_group'=item_variants.variant_group AND v->>'label'=item_variants.label);
 FOR line IN SELECT * FROM jsonb_array_elements(p_variants) LOOP
   IF NOT EXISTS(SELECT 1 FROM item_variants WHERE menu_item_id=saved AND variant_group=line->>'variant_group' AND label=line->>'label') THEN
     INSERT INTO item_variants(menu_item_id,variant_group,label,price_modifier,is_default,sort_order)
     VALUES(saved,line->>'variant_group',line->>'label',COALESCE((line->>'price_modifier')::numeric,0),COALESCE((line->>'is_default')::boolean,false),COALESCE((line->>'sort_order')::integer,0));
   ELSE
     UPDATE item_variants SET price_modifier=COALESCE((line->>'price_modifier')::numeric,0),is_default=COALESCE((line->>'is_default')::boolean,false),sort_order=COALESCE((line->>'sort_order')::integer,0) WHERE menu_item_id=saved AND variant_group=line->>'variant_group' AND label=line->>'label';
   END IF;
 END LOOP;
 RETURN saved;
END $$;

CREATE FUNCTION public.inv_save_po(p_id uuid,p_supplier uuid,p_expected date,p_notes text,p_lines jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved uuid:=COALESCE(p_id,gen_random_uuid()); line jsonb; state text;
BEGIN
 PERFORM inv_require_admin();
 IF p_id IS NOT NULL THEN SELECT status INTO state FROM purchase_orders WHERE id=p_id FOR UPDATE; IF NOT FOUND OR state<>'draft' THEN RAISE EXCEPTION 'Only drafts can be edited'; END IF; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'Add at least one purchase item'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE (x->>'quantity')::numeric IS NULL OR (x->>'quantity')::numeric<=0 OR (x->>'quantity')::numeric::text IN ('NaN','Infinity','-Infinity') OR (x->>'unit_cost')::numeric IS NULL OR (x->>'unit_cost')::numeric<0 OR (x->>'unit_cost')::numeric::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Finite positive purchase quantities and nonnegative costs required'; END IF;
 INSERT INTO purchase_orders(id,supplier_id,expected_on,notes,actor_id,manually_edited) VALUES(saved,p_supplier,p_expected,p_notes,auth.uid(),true)
 ON CONFLICT(id) DO UPDATE SET supplier_id=EXCLUDED.supplier_id,expected_on=EXCLUDED.expected_on,notes=EXCLUDED.notes,manually_edited=true,actor_id=auth.uid();
 DELETE FROM purchase_order_lines WHERE purchase_order_id=saved;
 FOR line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
   INSERT INTO purchase_order_lines(purchase_order_id,ingredient_id,quantity,unit_cost)
   VALUES(saved,(line->>'ingredient_id')::uuid,(line->>'quantity')::numeric,(line->>'unit_cost')::numeric);
 END LOOP;
 RETURN saved;
END $$;
CREATE FUNCTION public.inv_po_transition(p_id uuid,p_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE state text;
BEGIN
 PERFORM inv_require_admin(); SELECT status INTO state FROM purchase_orders WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
 IF NOT ((state='draft' AND p_status='approved') OR (state='approved' AND p_status='ordered') OR (state IN ('draft','approved','ordered','partial') AND p_status='cancelled')) THEN RAISE EXCEPTION 'Invalid purchase order transition'; END IF;
 IF p_status='approved' AND NOT EXISTS(SELECT 1 FROM purchase_order_lines WHERE purchase_order_id=p_id) THEN RAISE EXCEPTION 'Purchase order is empty'; END IF;
 UPDATE purchase_orders SET status=p_status,actor_id=auth.uid() WHERE id=p_id;
END $$;
CREATE FUNCTION public.inv_receive_po(p_id uuid,p_reference text,p_lines jsonb,p_key uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE po purchase_orders; line jsonb; l purchase_order_lines; receipt uuid; batch uuid; v_fingerprint text;
BEGIN
 PERFORM inv_require_admin(); PERFORM pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 v_fingerprint:=md5(jsonb_build_array(p_id,p_reference,p_lines)::text);
 SELECT id INTO receipt FROM goods_receipts WHERE idempotency_key=p_key AND fingerprint=v_fingerprint;
 IF FOUND THEN RETURN receipt; END IF;
 IF EXISTS(SELECT 1 FROM goods_receipts WHERE idempotency_key=p_key) THEN RAISE EXCEPTION 'Receipt key reused with different data'; END IF;
 PERFORM 1 FROM orders WHERE id IN(SELECT order_id FROM order_stock_requirements WHERE ingredient_id IN(SELECT (v->>'ingredient_id')::uuid FROM jsonb_array_elements(p_lines) v)) AND inventory_managed AND NOT inventory_consumed AND status IN ('pending','confirmed') ORDER BY id FOR UPDATE;
 SELECT * INTO po FROM purchase_orders WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR po.status NOT IN ('ordered','partial') THEN RAISE EXCEPTION 'Only ordered purchase orders can be received'; END IF;
 IF trim(p_reference)='' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'Receipt reference and items required'; END IF;
 PERFORM 1 FROM ingredients WHERE id IN(SELECT (v->>'ingredient_id')::uuid FROM jsonb_array_elements(p_lines) v) ORDER BY id FOR UPDATE;
 INSERT INTO goods_receipts(purchase_order_id,reference,idempotency_key,fingerprint,actor_id) VALUES(p_id,p_reference,p_key,v_fingerprint,auth.uid()) RETURNING id INTO receipt;
 FOR line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
   SELECT * INTO l FROM purchase_order_lines WHERE purchase_order_id=p_id AND ingredient_id=(line->>'ingredient_id')::uuid FOR UPDATE;
   IF NOT FOUND OR (line->>'quantity')::numeric<=0 OR (line->>'quantity')::numeric>l.quantity-l.received_quantity THEN RAISE EXCEPTION 'Receipt exceeds outstanding quantity'; END IF;
   INSERT INTO stock_batches(ingredient_id,batch_code,quantity,unit_cost,expires_on,receipt_id)
   VALUES(l.ingredient_id,COALESCE(NULLIF(line->>'batch_code',''),p_reference),(line->>'quantity')::numeric,COALESCE((line->>'unit_cost')::numeric,l.unit_cost),NULLIF(line->>'expires_on','')::date,receipt) RETURNING id INTO batch;
   UPDATE purchase_order_lines SET received_quantity=received_quantity+(line->>'quantity')::numeric WHERE id=l.id;
   INSERT INTO stock_movements(ingredient_id,batch_id,quantity,movement_type,balance_after,actor_id,reason,source_id)
   SELECT l.ingredient_id,batch,(line->>'quantity')::numeric,'receipt',current_stock,auth.uid(),p_reference,receipt FROM ingredients WHERE id=l.ingredient_id;
 END LOOP;
 UPDATE purchase_orders SET status=CASE WHEN EXISTS(SELECT 1 FROM purchase_order_lines WHERE purchase_order_id=p_id AND received_quantity<quantity) THEN 'partial' ELSE 'received' END WHERE id=p_id;
 FOR line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP PERFORM inv_reconcile_reservations((line->>'ingredient_id')::uuid); END LOOP;
 RETURN receipt;
END $$;

CREATE FUNCTION public.inv_activate(p_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM inv_require_admin();
 IF p_enabled THEN
   IF EXISTS(SELECT 1 FROM orders WHERE status IN ('pending','confirmed','preparing','ready') AND NOT is_parked) THEN RAISE EXCEPTION 'Settle active orders before activation'; END IF;
   IF EXISTS(SELECT 1 FROM menu_items m WHERE status='active' AND manually_available AND NOT EXISTS(SELECT 1 FROM menu_item_ingredients WHERE menu_item_id=m.id)) THEN RAISE EXCEPTION 'Map stock requirements for every enabled product'; END IF;
   IF EXISTS(SELECT 1 FROM ingredients i WHERE is_active AND NOT EXISTS(SELECT 1 FROM stocktakes s WHERE s.ingredient_id=i.id AND s.state='posted' AND s.counted=i.current_stock AND NOT EXISTS(SELECT 1 FROM stock_movements m WHERE m.ingredient_id=i.id AND m.created_at>s.created_at AND m.source_id IS DISTINCT FROM s.id))) THEN RAISE EXCEPTION 'Post current physical counts for all active stock items before activation'; END IF;
   IF EXISTS(SELECT 1 FROM ingredients WHERE is_active AND (unit NOT IN ('g','ml','pcs') OR current_stock<0)) THEN RAISE EXCEPTION 'Resolve base units and negative balances before activation'; END IF;
 END IF;
 UPDATE inventory_settings SET enforcement_enabled=p_enabled,updated_at=now() WHERE id;
 INSERT INTO admin_audit(actor_id,action,entity,reason,after_data) VALUES(auth.uid(),'enforcement','inventory_settings','Inventory activation changed',jsonb_build_object('enabled',p_enabled));
 UPDATE catalog_state SET version=version+1,updated_at=now() WHERE id;
END $$;

-- Access policy: customers read only the published projection; all operational writes are RPCs.
DO $$ DECLARE t text; pol record; BEGIN
 FOREACH t IN ARRAY ARRAY['inventory_settings','suppliers','purchase_orders','purchase_order_lines','goods_receipts','stock_batches','stock_movements','order_stock_requirements','stock_reservations','stocktakes','inventory_forecasts','admin_audit'] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('CREATE POLICY inventory_admin_read ON public.%I FOR SELECT TO authenticated USING (public.inv_admin())',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['ingredients','menu_item_ingredients','variant_ingredients'] LOOP
   FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,t); END LOOP;
   EXECUTE format('CREATE POLICY inventory_admin_only ON public.%I FOR ALL TO authenticated USING (public.inv_admin()) WITH CHECK (public.inv_admin())',t);
 END LOOP;
END $$;
CREATE POLICY supplier_admin_write ON public.suppliers FOR ALL TO authenticated USING(inv_admin()) WITH CHECK(inv_admin());
CREATE POLICY stocktake_admin_draft ON public.stocktakes FOR INSERT TO authenticated WITH CHECK(inv_admin() AND state='draft' AND actor_id=auth.uid());
ALTER TABLE public.catalog_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_catalog_version ON public.catalog_state FOR SELECT USING(true);
GRANT SELECT ON public.catalog_state TO anon,authenticated;
GRANT SELECT ON public.stock_overview TO authenticated;
GRANT SELECT ON public.inventory_settings,public.suppliers,public.purchase_orders,public.purchase_order_lines,public.goods_receipts,public.stock_batches,public.stock_movements,public.order_stock_requirements,public.stock_reservations,public.stocktakes,public.inventory_forecasts,public.admin_audit TO authenticated;
GRANT INSERT,UPDATE ON public.suppliers TO authenticated;
GRANT INSERT ON public.stocktakes TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.stock_batches,public.stock_movements,public.stock_reservations,public.order_stock_requirements,public.purchase_orders,public.purchase_order_lines,public.goods_receipts,public.inventory_forecasts,public.inventory_settings,public.admin_audit FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.restock_ingredient(uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restock_ingredient(uuid,numeric,text) TO authenticated,service_role;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'inv_%' LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.inv_admin(),public.inv_business_date() TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_post_movement(uuid,numeric,text,text,numeric,text,date,uuid),public.inv_post_stocktake(uuid),public.inv_save_menu(uuid,jsonb,jsonb,jsonb),public.inv_save_po(uuid,uuid,date,text,jsonb),public.inv_po_transition(uuid,text),public.inv_receive_po(uuid,text,jsonb,uuid),public.inv_activate(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_catalog(),public.get_item_availability(uuid,jsonb,integer) TO anon,authenticated,service_role;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.catalog_state; END IF; END $$;
