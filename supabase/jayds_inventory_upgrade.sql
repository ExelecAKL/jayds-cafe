-- Apply ONCE after the existing Jayds schema. Stock enforcement starts disabled.
-- See docs/inventory-operations.md for CLI history and rollout instructions.
BEGIN;

-- 20261002000100_inventory_operations.sql
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

-- 20261002000200_atomic_orders_forecasts.sql
-- Trusted server entrypoint. Prices, rewards and reservations share one transaction.
CREATE FUNCTION public.inv_create_order(p_order jsonb,p_items jsonb,p_key text,p_actor uuid,p_voucher uuid DEFAULT NULL,p_fingerprint text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing orders; saved orders; item jsonb; selected jsonb; m menu_items; iv item_variants;
  v vouchers; qty integer; unit_price numeric; subtotal numeric:=0; voucher_discount numeric:=0; discount numeric;
  v_points integer:=COALESCE((p_order->>'points_redeemed')::integer,0); customer uuid:=NULLIF(p_order->>'customer_id','')::uuid;
  delivery numeric:=COALESCE((p_order->>'delivery_fee')::numeric,0); enabled boolean; r record; canonical jsonb:='[]';
  source text:=p_order->>'order_source'; advance_key text:=p_order->>'advance_order_key';
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted order server required' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR length(p_key)>300 OR length(p_key)<16 THEN RAISE EXCEPTION 'Submission key required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key,0));
 PERFORM pg_advisory_xact_lock_shared(8712342);
 SELECT * INTO existing FROM orders WHERE idempotency_key=p_key;
 IF FOUND THEN
   IF existing.request_fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Submission key reused with different data'; END IF;
   RETURN jsonb_build_object('id',existing.id,'order_number',existing.order_number,'total',existing.total,'points_redeemed',existing.points_redeemed);
 END IF;
 IF source NOT IN ('pos','app') OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 OR v_points<0 OR delivery<0 THEN RAISE EXCEPTION 'Invalid order'; END IF;
 IF source='pos' AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND role IN ('staff','admin')) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF source='app' AND customer IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Invalid order owner'; END IF;
 IF advance_key IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(advance_key,1));
   IF (SELECT count(*) FROM orders WHERE advance_order_key=advance_key AND status='pending' AND payment_status='pending' AND expires_at>now())>=3 THEN RAISE EXCEPTION 'You already have 3 active advance pickup QR orders'; END IF;
 END IF;
 SELECT enforcement_enabled INTO enabled FROM inventory_settings WHERE id;
 PERFORM 1 FROM menu_items WHERE id IN(SELECT (x->>'menu_item_id')::uuid FROM jsonb_array_elements(p_items) x) ORDER BY id FOR SHARE;
 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
   SELECT * INTO m FROM menu_items WHERE id=(item->>'menu_item_id')::uuid;
   IF NOT FOUND OR m.status<>'active' OR NOT m.manually_available OR (NOT enabled AND NOT m.is_available)
      OR (m.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM categories WHERE id=m.category_id AND is_active AND status='active')) THEN RAISE EXCEPTION 'An item is no longer available'; END IF;
   qty:=(item->>'quantity')::integer;
   IF qty<1 OR (item->>'quantity')::numeric<>qty OR jsonb_typeof(item->'variants')<>'array' THEN RAISE EXCEPTION 'Invalid quantity or options'; END IF;
   unit_price:=m.price;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(item->'variants') x GROUP BY x->>'variant_group',CASE WHEN x->>'variant_group'='add_on' THEN x->>'label' ELSE '' END HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate customization group'; END IF;
   FOR selected IN SELECT * FROM jsonb_array_elements(item->'variants') LOOP
     SELECT * INTO iv FROM item_variants WHERE menu_item_id=m.id AND label=selected->>'label' AND variant_group=selected->>'variant_group'
       AND (applicable_items IS NULL OR applicable_items ? m.id::text) LIMIT 1;
     IF NOT FOUND OR iv.price_modifier<>(selected->>'price_modifier')::numeric THEN RAISE EXCEPTION 'A customization has changed'; END IF;
     unit_price:=unit_price+iv.price_modifier;
   END LOOP;
   IF enabled AND EXISTS(SELECT 1 FROM item_variants WHERE menu_item_id=m.id AND variant_group='size') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item->'variants') x WHERE x->>'variant_group'='size') THEN RAISE EXCEPTION 'Choose a size'; END IF;
   IF round(unit_price,2)<>(item->>'price')::numeric OR round(unit_price*qty,2)<>(item->>'subtotal')::numeric THEN RAISE EXCEPTION 'The price has changed'; END IF;
   subtotal:=subtotal+round(unit_price*qty,2);
   canonical:=canonical||jsonb_build_array(item||jsonb_build_object('name',m.name,'price',round(unit_price,2)));
 END LOOP;
 IF p_voucher IS NOT NULL THEN
   SELECT * INTO v FROM vouchers WHERE id=p_voucher FOR UPDATE;
   IF NOT FOUND OR NOT v.is_active OR (v.max_uses IS NOT NULL AND v.uses_count>=v.max_uses) OR (v.valid_from IS NOT NULL AND v.valid_from>now()) OR (v.valid_until IS NOT NULL AND v.valid_until<now()) OR subtotal<v.min_order_amount THEN RAISE EXCEPTION 'Voucher no longer available'; END IF;
   IF jsonb_array_length(v.applicable_item_ids)>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(canonical) x WHERE v.applicable_item_ids ? (x->>'menu_item_id')) THEN RAISE EXCEPTION 'Voucher does not apply'; END IF;
   IF v.application_mode='selected_items' AND jsonb_array_length(v.applicable_item_ids)>0 THEN
     SELECT sum((x->>'subtotal')::numeric) INTO voucher_discount FROM jsonb_array_elements(canonical) x WHERE v.applicable_item_ids ? (x->>'menu_item_id');
   ELSE voucher_discount:=subtotal; END IF;
   voucher_discount:=LEAST(voucher_discount,CASE WHEN v.discount_type='percentage' THEN voucher_discount*v.discount_value/100 ELSE v.discount_value END);
   IF v.discount_type='percentage' AND v.max_discount_amount>0 THEN voucher_discount:=LEAST(voucher_discount,v.max_discount_amount); END IF;
   voucher_discount:=round(GREATEST(0,voucher_discount),2);
   UPDATE vouchers SET uses_count=uses_count+1 WHERE id=v.id;
 END IF;
 IF v_points>0 THEN
   IF customer IS NULL OR v_points>floor((subtotal-voucher_discount)*10) THEN RAISE EXCEPTION 'Invalid points amount'; END IF;
   UPDATE profiles SET points=profiles.points-v_points WHERE id=customer AND profiles.points>=v_points;
   IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient points'; END IF;
 END IF;
 discount:=round(voucher_discount+v_points/10.0,2);
 IF subtotal<>(p_order->>'subtotal')::numeric OR discount<>(p_order->>'discount')::numeric OR round(GREATEST(0,subtotal-discount)+delivery,2)<>(p_order->>'total')::numeric THEN RAISE EXCEPTION 'Order total changed'; END IF;
 INSERT INTO orders(customer_id,staff_id,order_type,order_source,payment_method,status,payment_status,subtotal,total,discount,points_redeemed,points_earned,notes,
   pickup_confirmation_hash,advance_order_key,expires_at,delivery_name,delivery_phone,delivery_address,delivery_fee,delivery_lat,delivery_lng,lalamove_quotation_id,
   inventory_managed,is_parked,idempotency_key,request_fingerprint,redeemed_voucher_id)
 VALUES(customer,CASE WHEN source='pos' THEN p_actor END,(p_order->>'order_type')::order_type,source,(p_order->>'payment_method')::payment_method,
   'pending','pending',subtotal,round(GREATEST(0,subtotal-discount)+delivery,2),discount,v_points,CASE WHEN customer IS NOT NULL AND NOT COALESCE((p_order->>'is_parked')::boolean,false) THEN floor((GREATEST(0,subtotal-discount)+delivery)/10)::integer ELSE 0 END,
   p_order->>'notes',p_order->>'pickup_confirmation_hash',advance_key,now()+interval '30 minutes',p_order->>'delivery_name',p_order->>'delivery_phone',p_order->>'delivery_address',delivery,
   (p_order->>'delivery_lat')::numeric,(p_order->>'delivery_lng')::numeric,p_order->>'lalamove_quotation_id',enabled,COALESCE((p_order->>'is_parked')::boolean,false),p_key,p_fingerprint,p_voucher) RETURNING * INTO saved;
 FOR item IN SELECT * FROM jsonb_array_elements(canonical) LOOP
   INSERT INTO order_items(order_id,menu_item_id,name,price,quantity,variants,subtotal,notes)
   VALUES(saved.id,(item->>'menu_item_id')::uuid,item->>'name',(item->>'price')::numeric,(item->>'quantity')::integer,item->'variants',(item->>'subtotal')::numeric,item->>'notes');
   FOR r IN SELECT * FROM inv_requirements((item->>'menu_item_id')::uuid,item->'variants',(item->>'quantity')::numeric) LOOP
     INSERT INTO order_stock_requirements(order_id,ingredient_id,quantity,unit_cost) VALUES(saved.id,r.ingredient_id,r.quantity,(SELECT cost_per_unit FROM ingredients WHERE id=r.ingredient_id))
     ON CONFLICT(order_id,ingredient_id) DO UPDATE SET quantity=order_stock_requirements.quantity+EXCLUDED.quantity;
   END LOOP;
   IF enabled AND NOT EXISTS(SELECT 1 FROM inv_requirements((item->>'menu_item_id')::uuid,item->'variants',1)) THEN RAISE EXCEPTION 'Stock setup required'; END IF;
 END LOOP;
 IF enabled AND NOT saved.is_parked THEN
   PERFORM inv_reserve(saved.id);
   UPDATE order_stock_requirements q SET unit_cost=(SELECT sum(sr.quantity*sr.unit_cost)/sum(sr.quantity) FROM stock_reservations sr WHERE sr.order_id=q.order_id AND sr.ingredient_id=q.ingredient_id AND sr.state='reserved') WHERE q.order_id=saved.id;
 END IF;
 IF p_voucher IS NOT NULL AND customer IS NOT NULL THEN INSERT INTO voucher_claims(voucher_id,user_id,order_id,used_at) VALUES(p_voucher,customer,saved.id,now()); END IF;
 RETURN jsonb_build_object('id',saved.id,'order_number',saved.order_number,'total',saved.total,'points_redeemed',saved.points_redeemed);
END $$;
REVOKE ALL ON FUNCTION public.inv_create_order(jsonb,jsonb,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inv_create_order(jsonb,jsonb,text,uuid,uuid,text) TO service_role;

CREATE FUNCTION public.inv_resume_order(p_order uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders; row record; enabled boolean;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(8712342);
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('staff','admin')) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR NOT o.is_parked OR o.status<>'pending' OR o.expires_at<now() THEN RAISE EXCEPTION 'Parked order expired or already resumed'; END IF;
 FOR row IN SELECT * FROM order_items WHERE order_id=p_order LOOP
   IF NOT (get_item_availability(row.menu_item_id,row.variants,row.quantity)->>'available')::boolean THEN RAISE EXCEPTION 'Stock or product availability changed'; END IF;
   IF row.price<>(SELECT m.price+COALESCE(sum(v.price_modifier),0) FROM menu_items m LEFT JOIN item_variants v ON v.menu_item_id=m.id AND EXISTS(SELECT 1 FROM jsonb_array_elements(row.variants) x WHERE x->>'label'=v.label AND x->>'variant_group'=v.variant_group) WHERE m.id=row.menu_item_id GROUP BY m.price) THEN RAISE EXCEPTION 'Prices changed; create a fresh order'; END IF;
 END LOOP;
 SELECT enforcement_enabled INTO enabled FROM inventory_settings WHERE id;
 DELETE FROM order_stock_requirements WHERE order_id=p_order;
 INSERT INTO order_stock_requirements(order_id,ingredient_id,quantity,unit_cost)
 SELECT p_order,r.ingredient_id,sum(r.quantity),(SELECT cost_per_unit FROM ingredients WHERE id=r.ingredient_id) FROM order_items oi CROSS JOIN LATERAL inv_requirements(oi.menu_item_id,oi.variants,oi.quantity) r WHERE oi.order_id=p_order GROUP BY r.ingredient_id;
 IF enabled THEN
   PERFORM inv_reserve(p_order);
   UPDATE order_stock_requirements q SET unit_cost=(SELECT sum(sr.quantity*sr.unit_cost)/sum(sr.quantity) FROM stock_reservations sr WHERE sr.order_id=q.order_id AND sr.ingredient_id=q.ingredient_id AND sr.state='reserved') WHERE q.order_id=p_order;
 END IF;
 PERFORM set_config('jayds.order_internal','1',true);
 UPDATE orders SET is_parked=false,inventory_managed=enabled,expires_at=now()+interval '30 minutes',notes=regexp_replace(COALESCE(notes,''),'^\[PARKED\]\s*','') WHERE id=p_order;
 PERFORM set_config('jayds.order_internal','',true);
END $$;
REVOKE ALL ON FUNCTION public.inv_resume_order(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inv_resume_order(uuid) TO authenticated,service_role;
CREATE FUNCTION public.inv_protect_orders() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role()='service_role' OR current_setting('jayds.order_internal',true)='1' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Submit orders through the order API'; END IF;
 IF TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('staff','admin')) THEN RAISE EXCEPTION 'Use the order API for changes'; END IF;
 IF TG_OP='UPDATE' AND (NEW.inventory_managed IS DISTINCT FROM OLD.inventory_managed OR NEW.inventory_consumed IS DISTINCT FROM OLD.inventory_consumed
   OR NEW.stock_conflict IS DISTINCT FROM OLD.stock_conflict OR NEW.is_parked IS DISTINCT FROM OLD.is_parked OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.rewards_returned IS DISTINCT FROM OLD.rewards_returned OR NEW.redeemed_voucher_id IS DISTINCT FROM OLD.redeemed_voucher_id) THEN RAISE EXCEPTION 'Protected inventory order fields'; END IF;
 IF TG_OP='UPDATE' AND OLD.status IN ('cancelled','completed') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'Closed orders cannot be reopened'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inv_protect_orders BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.inv_protect_orders();
CREATE FUNCTION public.inv_protect_items() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Use the order API for order items'; END IF; RETURN COALESCE(NEW,OLD); END $$;
CREATE TRIGGER inv_protect_items BEFORE INSERT OR UPDATE OR DELETE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.inv_protect_items();
-- Internal consume update is authorized solely by this trusted function.
CREATE OR REPLACE FUNCTION public.inv_consume(p_order uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; previous text:=COALESCE(current_setting('jayds.order_internal',true),'');
BEGIN
 IF (SELECT inventory_consumed FROM orders WHERE id=p_order) THEN RETURN; END IF;
 PERFORM inv_release(p_order); PERFORM inv_reserve(p_order);
 FOR r IN SELECT * FROM stock_reservations WHERE order_id=p_order AND state='reserved' ORDER BY ingredient_id,batch_id FOR UPDATE LOOP
   UPDATE stock_batches SET quantity=quantity-r.quantity,reserved=reserved-r.quantity WHERE id=r.batch_id;
   INSERT INTO stock_movements(ingredient_id,batch_id,quantity,movement_type,balance_after,order_id,actor_id,reason)
   SELECT r.ingredient_id,r.batch_id,-r.quantity,'consumption',current_stock,p_order,auth.uid(),'Preparation started' FROM ingredients WHERE id=r.ingredient_id;
   UPDATE stock_reservations SET state='consumed' WHERE id=r.id;
 END LOOP;
 PERFORM set_config('jayds.order_internal','1',true);
 UPDATE orders SET inventory_consumed=true,stock_conflict=false WHERE id=p_order;
 PERFORM set_config('jayds.order_internal',previous,true);
END $$;

CREATE VIEW public.inventory_daily_usage AS
SELECT (o.created_at AT TIME ZONE 'Asia/Manila')::date business_date,r.ingredient_id,sum(r.quantity) quantity,false estimated
FROM orders o JOIN order_stock_requirements r ON r.order_id=o.id WHERE o.status='completed' GROUP BY 1,2
UNION ALL
SELECT (o.created_at AT TIME ZONE 'Asia/Manila')::date,r.ingredient_id,sum(r.quantity),true
FROM orders o JOIN order_items oi ON oi.order_id=o.id CROSS JOIN LATERAL inv_requirements(oi.menu_item_id,COALESCE(oi.variants,'[]'),oi.quantity) r
WHERE o.status='completed' AND NOT EXISTS(SELECT 1 FROM order_stock_requirements WHERE order_id=o.id) GROUP BY 1,2;

CREATE FUNCTION public.inv_refresh_forecasts() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i record; h integer; days integer; daily numeric; total numeric; future date; sample numeric; first_day date; historical_estimation boolean;
BEGIN
 PERFORM inv_require_admin(); PERFORM pg_advisory_xact_lock(8712341);
 SELECT min((created_at AT TIME ZONE 'Asia/Manila')::date) INTO first_day FROM orders WHERE status='completed';
 days:=LEAST(56,GREATEST(0,inv_business_date()-first_day)); days:=COALESCE(days,0);
 FOR i IN SELECT id FROM ingredients WHERE is_active LOOP
   SELECT min(business_date) INTO first_day FROM inventory_daily_usage WHERE ingredient_id=i.id;
   days:=COALESCE(LEAST(56,GREATEST(0,inv_business_date()-first_day)),0);
   SELECT COALESCE(bool_or(estimated),false) INTO historical_estimation FROM inventory_daily_usage WHERE ingredient_id=i.id AND business_date>=inv_business_date()-56;
   FOREACH h IN ARRAY ARRAY[7,14,30] LOOP
     total:=0;
     FOR offset_day IN 1..h LOOP
       future:=inv_business_date()+offset_day;
       SELECT COALESCE(avg(COALESCE(u.quantity,0)),0) INTO sample FROM generate_series(1,CASE WHEN days>=28 THEN LEAST(days,56) ELSE 14 END) d
       LEFT JOIN (SELECT business_date,sum(quantity) quantity FROM inventory_daily_usage WHERE ingredient_id=i.id GROUP BY business_date) u ON u.business_date=inv_business_date()-d
       WHERE days<28 OR extract(dow FROM inv_business_date()-d)=extract(dow FROM future);
       total:=total+sample;
     END LOOP;
     daily:=total/h;
     INSERT INTO inventory_forecasts(ingredient_id,horizon,demand,daily_demand,history_days,method,historical_estimate,calculated_at)
     VALUES(i.id,h,total,daily,days,CASE WHEN days>=28 THEN 'weekday_8_weeks' ELSE 'trailing_14_days' END,historical_estimation,now())
     ON CONFLICT(ingredient_id,horizon) DO UPDATE SET demand=EXCLUDED.demand,daily_demand=EXCLUDED.daily_demand,history_days=EXCLUDED.history_days,method=EXCLUDED.method,historical_estimate=EXCLUDED.historical_estimate,calculated_at=now();
   END LOOP;
 END LOOP;
END $$;
CREATE VIEW public.forecast_overview WITH(security_invoker=true) AS
SELECT f.*,s.available_stock,s.reserved_stock,s.incoming_stock,s.name,s.unit,s.supplier_id,
 CASE WHEN f.daily_demand>0 THEN s.available_stock/f.daily_demand END coverage_days,
 CASE WHEN s.available_stock+s.incoming_stock<=GREATEST(s.min_stock_alert,f.daily_demand*(s.lead_time_days+s.safety_days))
   AND GREATEST(s.min_stock_alert,f.daily_demand*(s.lead_time_days+s.safety_days+s.review_days))>s.available_stock+s.incoming_stock THEN
   GREATEST(s.min_purchase_packs,ceil((GREATEST(s.min_stock_alert,f.daily_demand*(s.lead_time_days+s.safety_days+s.review_days))-s.available_stock-s.incoming_stock)/s.pack_size))*s.pack_size ELSE 0 END reorder_quantity,
 GREATEST(0,s.available_stock+s.incoming_stock-COALESCE(s.max_stock,GREATEST(s.min_stock_alert,f.daily_demand*(s.lead_time_days+s.safety_days+s.review_days)))) excess_quantity,
 COALESCE((SELECT sum(GREATEST(0,cumulative-f.daily_demand*GREATEST(0,expires_on-inv_business_date()+1))-GREATEST(0,cumulative-free-f.daily_demand*GREATEST(0,expires_on-inv_business_date()+1)))
 FROM(SELECT expires_on,GREATEST(0,quantity-reserved) free,sum(GREATEST(0,quantity-reserved)) OVER(ORDER BY expires_on,received_at,id) cumulative
 FROM stock_batches WHERE ingredient_id=s.id AND quantity>0) lots WHERE expires_on<=inv_business_date()+f.horizon),0) expiry_risk_quantity,
 s.cost_per_unit
FROM inventory_forecasts f JOIN stock_overview s ON s.id=f.ingredient_id;
CREATE FUNCTION public.inv_generate_drafts() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE supplier record; po uuid; line record;
BEGIN
 PERFORM inv_require_admin(); PERFORM pg_advisory_xact_lock(8712341);
 FOR supplier IN SELECT DISTINCT s.id,s.lead_time_days FROM suppliers s JOIN forecast_overview f ON f.supplier_id=s.id WHERE s.is_active AND f.horizon=14 AND f.history_days>=14 AND f.reorder_quantity>0 LOOP
   -- Edited drafts and approved orders are never rewritten or duplicated.
   IF EXISTS(SELECT 1 FROM purchase_orders WHERE supplier_id=supplier.id AND status='draft' AND manually_edited) THEN CONTINUE; END IF;
   SELECT id INTO po FROM purchase_orders WHERE supplier_id=supplier.id AND status='draft' AND generated AND NOT manually_edited FOR UPDATE;
   IF NOT FOUND THEN INSERT INTO purchase_orders(supplier_id,generated,expected_on,notes) VALUES(supplier.id,true,inv_business_date()+supplier.lead_time_days,'Generated from demand and current stock; review before approval') RETURNING id INTO po; END IF;
   DELETE FROM purchase_order_lines WHERE purchase_order_id=po;
   FOR line IN SELECT * FROM forecast_overview WHERE supplier_id=supplier.id AND horizon=14 AND history_days>=14 AND reorder_quantity>0 LOOP
     INSERT INTO purchase_order_lines(purchase_order_id,ingredient_id,quantity,unit_cost) VALUES(po,line.ingredient_id,line.reorder_quantity,line.cost_per_unit);
   END LOOP;
 END LOOP;
 -- Remove obsolete automatic lines without touching human edits.
 DELETE FROM purchase_order_lines l USING purchase_orders p WHERE p.id=l.purchase_order_id AND p.status='draft' AND p.generated AND NOT p.manually_edited
   AND NOT EXISTS(SELECT 1 FROM forecast_overview f WHERE f.ingredient_id=l.ingredient_id AND f.horizon=14 AND f.history_days>=14 AND f.reorder_quantity>0);
 UPDATE purchase_orders SET status='cancelled' WHERE status='draft' AND generated AND NOT manually_edited AND NOT EXISTS(SELECT 1 FROM purchase_order_lines WHERE purchase_order_id=purchase_orders.id);
END $$;
CREATE FUNCTION public.inv_maintenance() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o record; previous text:=COALESCE(current_setting('jayds.order_internal',true),'');
BEGIN
 PERFORM inv_require_admin();
 PERFORM set_config('jayds.order_internal','1',true);
 UPDATE orders SET status='cancelled' WHERE status IN ('pending','confirmed') AND payment_status='pending' AND expires_at<now();
 FOR o IN SELECT id FROM orders WHERE inventory_managed AND NOT inventory_consumed AND NOT is_parked AND status IN ('pending','confirmed') AND (stock_conflict OR EXISTS(SELECT 1 FROM stock_reservations r JOIN stock_batches b ON b.id=r.batch_id WHERE r.order_id=orders.id AND r.state='reserved' AND (b.expires_on<inv_business_date() OR b.reserved>b.quantity))) ORDER BY created_at,id FOR UPDATE LOOP
   BEGIN
     PERFORM inv_release(o.id); PERFORM inv_reserve(o.id);
     UPDATE orders SET stock_conflict=false WHERE id=o.id;
   EXCEPTION WHEN SQLSTATE 'P0001' THEN UPDATE orders SET stock_conflict=true WHERE id=o.id;
   END;
 END LOOP;
 UPDATE catalog_state SET version=version+1,updated_at=now() WHERE id;
 PERFORM set_config('jayds.order_internal',previous,true);
END $$;
REVOKE ALL ON public.inventory_daily_usage FROM anon,authenticated;
GRANT SELECT ON public.forecast_overview TO authenticated;
REVOKE ALL ON FUNCTION public.inv_refresh_forecasts(),public.inv_generate_drafts(),public.inv_maintenance(),public.inv_protect_orders(),public.inv_protect_items(),public.inv_consume(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inv_refresh_forecasts(),public.inv_generate_drafts() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.inv_maintenance(),public.inv_consume(uuid) TO service_role;
-- pg_cron is optional in local tests; the hosted setup already enables it.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
   PERFORM cron.schedule('jayds-daily-forecast','0 18 * * *',$job$SELECT public.inv_refresh_forecasts(); SELECT public.inv_generate_drafts();$job$);
   PERFORM cron.schedule('jayds-stock-maintenance','* * * * *',$job$SELECT public.inv_maintenance();$job$);
   PERFORM cron.schedule('jayds-replenishment-drafts','* * * * *',$job$SELECT public.inv_generate_drafts();$job$);
 END IF;
END $$;

-- 20261002000300_operations_overview.sql
CREATE FUNCTION public.inv_dashboard(p_days integer DEFAULT 7) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM inv_require_admin();
 IF p_days NOT IN (7,30) THEN RAISE EXCEPTION 'Invalid reporting period'; END IF;
 SELECT jsonb_build_object(
  'revenue',COALESCE(sum(total) FILTER(WHERE payment_status='paid' AND status<>'cancelled'),0),
  'orders',count(*),'average',COALESCE(avg(total) FILTER(WHERE payment_status='paid' AND status<>'cancelled'),0),
  'active',(SELECT count(*) FROM orders WHERE status IN ('pending','confirmed','preparing','ready') AND NOT is_parked),
  'stock_conflicts',(SELECT count(*) FROM orders WHERE stock_conflict AND status IN ('pending','confirmed')),
  'days',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',d::date,'revenue',COALESCE(s.revenue,0)) ORDER BY d)
    FROM generate_series(inv_business_date()-p_days+1,inv_business_date(),interval '1 day') d
    LEFT JOIN(SELECT (created_at AT TIME ZONE 'Asia/Manila')::date business_day,sum(total) revenue FROM orders WHERE payment_status='paid' AND status<>'cancelled' GROUP BY 1) s ON s.business_day=d::date),'[]'))
 INTO result FROM orders WHERE (created_at AT TIME ZONE 'Asia/Manila')::date>=inv_business_date()-p_days+1;
 RETURN result;
END $$;
-- BEFORE UPDATE makes RETURNING report the completed reversal, so legacy APIs cannot refund twice.
CREATE FUNCTION public.inv_return_cancelled_rewards() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE voucher_ids uuid[];
BEGIN
 IF NEW.status<>'cancelled' OR OLD.status='cancelled' OR OLD.rewards_returned THEN RETURN NEW; END IF;
 SELECT COALESCE(array_agg(DISTINCT voucher_id),'{}') INTO voucher_ids FROM (
   SELECT NEW.redeemed_voucher_id voucher_id UNION SELECT voucher_id FROM voucher_claims WHERE order_id=NEW.id
 ) v WHERE voucher_id IS NOT NULL;
 -- Submission locks vouchers before customer points; reversal uses the same order.
 PERFORM 1 FROM vouchers WHERE id=ANY(voucher_ids) ORDER BY id FOR UPDATE;
 UPDATE vouchers SET uses_count=GREATEST(0,uses_count-1) WHERE id=ANY(voucher_ids);
 IF NEW.points_redeemed>0 AND NEW.customer_id IS NOT NULL THEN UPDATE profiles SET points=points+NEW.points_redeemed WHERE id=NEW.customer_id; END IF;
 DELETE FROM voucher_claims WHERE order_id=NEW.id;
 NEW.rewards_returned:=true;
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason,after_data) VALUES(auth.uid(),'return_rewards','orders',NEW.id,'Cancellation or expiry',jsonb_build_object('points',NEW.points_redeemed,'vouchers',voucher_ids));
 RETURN NEW;
END $$;
CREATE TRIGGER inv_return_cancelled_rewards BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.inv_return_cancelled_rewards();
REVOKE ALL ON FUNCTION public.inv_return_cancelled_rewards() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inv_return_cancelled_rewards() TO service_role;
CREATE FUNCTION public.inv_save_variant_recipes(p_group text,p_label text,p_lines jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE line jsonb;
BEGIN
 PERFORM inv_require_admin();
 IF NOT EXISTS(SELECT 1 FROM item_variants WHERE variant_group=p_group AND label=p_label) THEN RAISE EXCEPTION 'Option no longer exists'; END IF;
 PERFORM pg_advisory_xact_lock(8712342);
 DELETE FROM variant_ingredients WHERE variant_group=p_group AND variant_label=p_label;
 FOR line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
   IF (line->>'quantity_used')::numeric IS NULL OR (line->>'quantity_used')::numeric<0 OR ((line->>'quantity_used')::numeric=0 AND NULLIF(line->>'replaces_ingredient_id','') IS NULL) OR (line->>'quantity_used')::numeric::text IN ('NaN','Infinity','-Infinity') OR EXISTS(SELECT 1 FROM jsonb_each_text(COALESCE(line->'size_multipliers','{}')) x WHERE x.value::numeric<=0 OR x.value::numeric::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Positive quantities or an explicit zero-quantity replacement required'; END IF;
   INSERT INTO variant_ingredients(variant_group,variant_label,ingredient_id,quantity_used,replaces_ingredient_id,size_multipliers)
   VALUES(p_group,p_label,(line->>'ingredient_id')::uuid,(line->>'quantity_used')::numeric,NULLIF(line->>'replaces_ingredient_id','')::uuid,COALESCE(line->'size_multipliers','{}'));
 END LOOP;
 INSERT INTO admin_audit(actor_id,action,entity,reason,after_data) VALUES(auth.uid(),'save','variant_ingredients',p_group||' / '||p_label,p_lines);
END $$;
REVOKE ALL ON FUNCTION public.inv_dashboard(integer),public.inv_save_variant_recipes(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inv_dashboard(integer),public.inv_save_variant_recipes(text,text,jsonb) TO authenticated,service_role;
SELECT public.inv_refresh_forecasts();
SELECT public.inv_generate_drafts();

CREATE FUNCTION public.inv_reconcile_reservations(p_item uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o record; previous text:=COALESCE(current_setting('jayds.order_internal',true),'');
BEGIN
 PERFORM inv_require_admin(); PERFORM set_config('jayds.order_internal','1',true);
 FOR o IN SELECT id FROM orders WHERE inventory_managed AND NOT inventory_consumed AND NOT is_parked AND status IN ('pending','confirmed')
   AND (p_item IS NULL OR EXISTS(SELECT 1 FROM order_stock_requirements q WHERE q.order_id=orders.id AND q.ingredient_id=p_item))
   AND (stock_conflict OR EXISTS(SELECT 1 FROM stock_reservations r JOIN stock_batches b ON b.id=r.batch_id WHERE r.order_id=orders.id AND r.state='reserved' AND (b.expires_on<inv_business_date() OR b.reserved>b.quantity))) ORDER BY created_at,id FOR UPDATE LOOP
   BEGIN
     PERFORM inv_release(o.id); PERFORM inv_reserve(o.id); UPDATE orders SET stock_conflict=false WHERE id=o.id;
   EXCEPTION WHEN SQLSTATE 'P0001' THEN UPDATE orders SET stock_conflict=true WHERE id=o.id;
   END;
 END LOOP;
 PERFORM set_config('jayds.order_internal',previous,true);
END $$;
REVOKE ALL ON FUNCTION public.inv_reconcile_reservations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inv_reconcile_reservations(uuid) TO authenticated,service_role;

-- Evaluate options against the exact selected configuration, without disclosing requirements.
CREATE FUNCTION public.get_configuration_availability(p_item uuid,p_variants jsonb DEFAULT '[]',p_quantity integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; options jsonb; v record; config jsonb;
BEGIN
 result:=get_item_availability(p_item,p_variants,p_quantity); options:='{}';
 FOR v IN SELECT variant_group,label FROM item_variants WHERE menu_item_id=p_item LOOP
   SELECT COALESCE(jsonb_agg(x),'[]') INTO config FROM jsonb_array_elements(p_variants) x
   WHERE x->>'variant_group'<>v.variant_group OR (v.variant_group='add_on' AND x->>'label'<>v.label);
   config:=config||jsonb_build_array(jsonb_build_object('variant_group',v.variant_group,'label',v.label));
   options:=options||jsonb_build_object(v.variant_group||':'||v.label,(get_item_availability(p_item,config,p_quantity)->>'available')::boolean);
 END LOOP;
 RETURN result||jsonb_build_object('options',options);
END $$;
REVOKE ALL ON FUNCTION public.get_configuration_availability(uuid,jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_configuration_availability(uuid,jsonb,integer) TO anon,authenticated,service_role;

CREATE FUNCTION public.inv_validate_stock_master() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.current_stock::text IN ('NaN','Infinity','-Infinity') OR NEW.min_stock_alert<0 OR NEW.min_stock_alert::text IN ('NaN','Infinity','-Infinity') OR NEW.cost_per_unit<0 OR NEW.cost_per_unit::text IN ('NaN','Infinity','-Infinity') OR NEW.pack_size::text IN ('NaN','Infinity','-Infinity') OR NEW.max_stock::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Finite nonnegative stock values required'; END IF;
 IF TG_OP='INSERT' AND NEW.current_stock<>0 THEN RAISE EXCEPTION 'Create the stock item, then post a receipt'; END IF;
 IF TG_OP='UPDATE' AND NEW.unit<>OLD.unit AND (EXISTS(SELECT 1 FROM stock_batches WHERE ingredient_id=OLD.id AND quantity>0) OR EXISTS(SELECT 1 FROM menu_item_ingredients WHERE ingredient_id=OLD.id) OR EXISTS(SELECT 1 FROM variant_ingredients WHERE ingredient_id=OLD.id) OR EXISTS(SELECT 1 FROM order_stock_requirements WHERE ingredient_id=OLD.id)) THEN RAISE EXCEPTION 'Base units with recipes or stock history cannot change'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inv_validate_stock_master BEFORE INSERT OR UPDATE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.inv_validate_stock_master();
CREATE FUNCTION public.inv_audit_stock_master() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP<>'UPDATE' OR (to_jsonb(NEW)-ARRAY['current_stock','cost_per_unit','stock_version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_stock','cost_per_unit','stock_version','updated_at']) THEN
  INSERT INTO admin_audit(actor_id,action,entity,entity_id,before_data,after_data) VALUES(auth.uid(),TG_OP,'ingredients',COALESCE(NEW.id,OLD.id),CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER inv_audit_stock_master AFTER INSERT OR UPDATE OR DELETE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.inv_audit_stock_master();
CREATE TRIGGER inv_audit_counts AFTER INSERT OR UPDATE ON public.stocktakes FOR EACH ROW EXECUTE FUNCTION public.inv_audit_change();
CREATE TRIGGER inv_audit_receipts AFTER INSERT ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.inv_audit_change();

CREATE TABLE public.forecast_snapshots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ingredient_id uuid REFERENCES ingredients(id),horizon integer,demand numeric,daily_demand numeric,history_days integer,method text,historical_estimate boolean,calculated_at timestamptz);
ALTER TABLE public.forecast_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_admin_read ON public.forecast_snapshots FOR SELECT TO authenticated USING(inv_admin());
GRANT SELECT ON public.forecast_snapshots TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.forecast_snapshots FROM anon,authenticated;
CREATE FUNCTION public.inv_forecast_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO forecast_snapshots(ingredient_id,horizon,demand,daily_demand,history_days,method,historical_estimate,calculated_at) VALUES(NEW.ingredient_id,NEW.horizon,NEW.demand,NEW.daily_demand,NEW.history_days,NEW.method,NEW.historical_estimate,NEW.calculated_at); RETURN NULL; END $$;
CREATE TRIGGER inv_forecast_snapshot AFTER INSERT OR UPDATE ON public.inventory_forecasts FOR EACH ROW EXECUTE FUNCTION public.inv_forecast_snapshot();
CREATE TRIGGER inv_forecast_immutable BEFORE UPDATE OR DELETE ON public.forecast_snapshots FOR EACH ROW EXECUTE FUNCTION public.inv_immutable();
-- Never permit browser writes to posted stock, even where Supabase default privileges grant them.
REVOKE ALL ON FUNCTION public.inv_validate_stock_master(),public.inv_audit_stock_master(),public.inv_forecast_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inv_validate_stock_master(),public.inv_audit_stock_master(),public.inv_forecast_snapshot() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
