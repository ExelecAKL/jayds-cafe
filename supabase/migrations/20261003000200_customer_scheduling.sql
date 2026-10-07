-- Additive customer pickup scheduling. No existing order, recipe, or balance is rewritten.
CREATE TABLE public.customer_branch_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 name text NOT NULL DEFAULT 'Jayds Cafe', address text NOT NULL DEFAULT 'Jayds Cafe, Dasmariñas, Cavite',
 latitude numeric NOT NULL DEFAULT 14.346621 CHECK(latitude BETWEEN -90 AND 90),
 longitude numeric NOT NULL DEFAULT 120.981057 CHECK(longitude BETWEEN -180 AND 180),
 delivery_radius_km numeric NOT NULL DEFAULT 8 CHECK(delivery_radius_km>0 AND delivery_radius_km<=100),
 contact_phone text, regular_hours jsonb NOT NULL DEFAULT '[]', closure_dates jsonb NOT NULL DEFAULT '[]',
 scheduled_pickup_enabled boolean NOT NULL DEFAULT false,
 slot_order_capacity integer CHECK(slot_order_capacity>0), slot_item_capacity integer CHECK(slot_item_capacity>0),
 minimum_notice_minutes integer NOT NULL DEFAULT 20 CHECK(minimum_notice_minutes>=20),
 preparation_lead_minutes integer NOT NULL DEFAULT 10 CHECK(preparation_lead_minutes>=1),
 production_verified_at timestamptz, production_verified_by uuid REFERENCES public.profiles(id),
 production_recipe_fingerprint text, production_verification_reason text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(minimum_notice_minutes>preparation_lead_minutes)
);
INSERT INTO public.customer_branch_settings(id,name) SELECT true,branch_name FROM public.inventory_settings WHERE id;
CREATE TABLE public.customer_pickup_slots (starts_at timestamptz PRIMARY KEY);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS legal_version text;
ALTER TABLE public.orders ADD COLUMN pickup_window_start timestamptz,
 ADD COLUMN pickup_window_end timestamptz, ADD COLUMN preparation_due_at timestamptz,
 ADD COLUMN scheduled_item_units integer,
 ADD CONSTRAINT scheduled_pickup_snapshot CHECK(
   (pickup_window_start IS NULL AND pickup_window_end IS NULL AND preparation_due_at IS NULL AND scheduled_item_units IS NULL)
   OR (pickup_window_start IS NOT NULL AND pickup_window_end=pickup_window_start+interval '15 minutes'
     AND preparation_due_at<pickup_window_start AND scheduled_item_units>0 AND order_type='pickup' AND payment_method='maya' AND order_source='app'));
CREATE INDEX scheduled_pickup_due ON public.orders(preparation_due_at,id) WHERE pickup_window_start IS NOT NULL AND status IN ('pending','confirmed');
CREATE TABLE public.customer_pickup_reservations (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id), slot_start timestamptz NOT NULL REFERENCES public.customer_pickup_slots(starts_at),
 item_units integer NOT NULL CHECK(item_units>0), state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','committed','released')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pickup_reservations_by_slot ON public.customer_pickup_reservations(slot_start,state);
ALTER TABLE public.customer_branch_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_pickup_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_pickup_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_branch_admin_read ON public.customer_branch_settings FOR SELECT TO authenticated USING(public.inv_admin());
GRANT SELECT ON public.customer_branch_settings TO authenticated;
GRANT ALL ON public.customer_branch_settings,public.customer_pickup_slots,public.customer_pickup_reservations TO service_role;
REVOKE INSERT,UPDATE,DELETE ON public.customer_branch_settings,public.customer_pickup_slots,public.customer_pickup_reservations FROM anon,authenticated;

CREATE FUNCTION public.customer_schedule_now() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$ SELECT clock_timestamp() $$;
CREATE FUNCTION public.customer_recipe_fingerprint() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT md5(jsonb_build_array(
  COALESCE((SELECT jsonb_agg(jsonb_build_array(id,unit,is_active) ORDER BY id) FROM ingredients),'[]'),
  COALESCE((SELECT jsonb_agg(jsonb_build_array(id,status,manually_available) ORDER BY id) FROM menu_items),'[]'),
  COALESCE((SELECT jsonb_agg(jsonb_build_array(id,menu_item_id,variant_group,label,is_default,applicable_items) ORDER BY id) FROM item_variants),'[]'),
  COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM menu_item_ingredients r),'[]'),
  COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM variant_ingredients r),'[]'))::text)
$$;
CREATE FUNCTION public.customer_production_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT s.production_verified_at IS NOT NULL AND s.production_recipe_fingerprint=customer_recipe_fingerprint()
  AND (SELECT enforcement_enabled FROM inventory_settings WHERE id) FROM customer_branch_settings s WHERE id),false)
$$;
CREATE FUNCTION public.customer_hours_valid(p_hours jsonb,p_closures jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE h jsonb; d jsonb;
BEGIN
 IF p_hours IS NULL OR p_closures IS NULL OR jsonb_typeof(p_hours)<>'array' OR jsonb_typeof(p_closures)<>'array' OR jsonb_array_length(p_hours)=0 THEN RETURN false; END IF;
 FOR h IN SELECT * FROM jsonb_array_elements(p_hours) LOOP
  IF NOT COALESCE((h->>'weekday') ~ '^[0-6]$',false) OR NOT COALESCE((h->>'opens') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$',false)
    OR NOT COALESCE((h->>'closes') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$',false) OR (h->>'opens')::time>=(h->>'closes')::time
    OR NOT(h ? 'weekday' AND h ? 'opens' AND h ? 'closes') THEN RETURN false; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_hours) a JOIN jsonb_array_elements(p_hours) b ON a.value<>b.value
  WHERE a.value->>'weekday'=b.value->>'weekday' AND (a.value->>'opens')::time<(b.value->>'closes')::time AND (b.value->>'opens')::time<(a.value->>'closes')::time) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_hours) entry GROUP BY entry.value HAVING count(*)>1) THEN RETURN false; END IF;
 FOR d IN SELECT * FROM jsonb_array_elements(p_closures) LOOP
  IF jsonb_typeof(d)<>'string' OR (d#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' OR to_char((d#>>'{}')::date,'YYYY-MM-DD')<>(d#>>'{}') THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION public.customer_slot_open(p_start timestamptz,p_settings customer_branch_settings) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT p_start IS NOT NULL AND date_trunc('minute',p_start)=p_start
  AND extract(minute FROM p_start AT TIME ZONE 'Asia/Manila')::integer%15=0
  AND NOT p_settings.closure_dates ? to_char(p_start AT TIME ZONE 'Asia/Manila','YYYY-MM-DD')
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_settings.regular_hours) h
   WHERE (h->>'weekday')::integer=extract(dow FROM p_start AT TIME ZONE 'Asia/Manila')::integer
    AND (p_start AT TIME ZONE 'Asia/Manila')::time >= (h->>'opens')::time
    AND ((p_start+interval '15 minutes') AT TIME ZONE 'Asia/Manila')::date=(p_start AT TIME ZONE 'Asia/Manila')::date
    AND ((p_start+interval '15 minutes') AT TIME ZONE 'Asia/Manila')::time <= (h->>'closes')::time)
$$;
CREATE FUNCTION public.get_customer_branch() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('version',updated_at,'name',name,'address',address,'latitude',latitude,'longitude',longitude,'delivery_radius_km',delivery_radius_km,
  'contact_phone',contact_phone,'timezone','Asia/Manila','hours',regular_hours,'closures',closure_dates,
  'scheduled_pickup_enabled',scheduled_pickup_enabled AND customer_production_ready() AND customer_hours_valid(regular_hours,closure_dates))
 FROM customer_branch_settings WHERE id
$$;
CREATE FUNCTION public.get_customer_pickup_slots(p_date date,p_item_units integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s customer_branch_settings; moment timestamptz:=customer_schedule_now(); today date; result jsonb;
BEGIN
 SELECT * INTO s FROM customer_branch_settings WHERE id; today:=(moment AT TIME ZONE 'Asia/Manila')::date;
 IF p_date NOT IN(today,today+1) OR p_item_units<1 OR p_item_units>10000 THEN RAISE EXCEPTION 'Choose today or tomorrow and a valid cart quantity'; END IF;
 IF NOT s.scheduled_pickup_enabled OR NOT customer_production_ready() OR NOT customer_hours_valid(s.regular_hours,s.closure_dates) OR s.slot_order_capacity IS NULL OR s.slot_item_capacity IS NULL THEN
  RETURN jsonb_build_object('timezone','Asia/Manila','server_now',moment,'enabled',false,'reason','Scheduled pickup is not available yet.','slots','[]'::jsonb);
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('start',t,'end',t+interval '15 minutes','preparation_due_at',t-make_interval(mins=>s.preparation_lead_minutes),
  'remaining_orders',GREATEST(0,s.slot_order_capacity-used.orders),'remaining_item_units',GREATEST(0,s.slot_item_capacity-used.units)) ORDER BY t),'[]') INTO result
 FROM generate_series(p_date::timestamp AT TIME ZONE 'Asia/Manila',(p_date+1)::timestamp AT TIME ZONE 'Asia/Manila'-interval '15 minutes',interval '15 minutes') t
 CROSS JOIN LATERAL(SELECT count(*)::integer orders,COALESCE(sum(r.item_units),0)::integer units FROM customer_pickup_reservations r JOIN orders o ON o.id=r.order_id
  WHERE r.slot_start=t AND (r.state='committed' OR (r.state='reserved' AND (o.payment_status='paid' OR o.expires_at>moment)))) used
 WHERE t>=moment+make_interval(mins=>s.minimum_notice_minutes) AND customer_slot_open(t,s) AND used.orders<s.slot_order_capacity AND used.units+p_item_units<=s.slot_item_capacity;
 RETURN jsonb_build_object('timezone','Asia/Manila','server_now',moment,'enabled',true,'reason',NULL,'slots',result);
END $$;
CREATE FUNCTION public.customer_verify_production(p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM inv_require_admin();
 IF length(trim(COALESCE(p_reason,'')))<20 THEN RAISE EXCEPTION 'Describe verification of actual physical stock and actual recipe portions'; END IF;
 IF NOT(SELECT enforcement_enabled FROM inventory_settings WHERE id) THEN RAISE EXCEPTION 'Activate inventory after real stock and recipe verification'; END IF;
 IF EXISTS(SELECT 1 FROM menu_items m WHERE status='active' AND manually_available AND NOT EXISTS(SELECT 1 FROM menu_item_ingredients WHERE menu_item_id=m.id)) THEN RAISE EXCEPTION 'Map actual stock requirements for every enabled product'; END IF;
 IF EXISTS(SELECT 1 FROM ingredients i WHERE is_active AND NOT EXISTS(SELECT 1 FROM stocktakes s WHERE s.ingredient_id=i.id AND s.state='posted' AND s.counted=i.current_stock
  AND s.reason NOT LIKE 'Thesis demo%' AND NOT EXISTS(SELECT 1 FROM stock_movements m WHERE m.ingredient_id=i.id AND m.created_at>s.created_at AND m.source_id IS DISTINCT FROM s.id))) THEN
  RAISE EXCEPTION 'Post current physical counts for all active stock items; demo opening counts do not certify production';
 END IF;
 UPDATE customer_branch_settings SET production_verified_at=now(),production_verified_by=auth.uid(),production_recipe_fingerprint=customer_recipe_fingerprint(),production_verification_reason=p_reason,updated_at=now() WHERE id;
 INSERT INTO admin_audit(actor_id,action,entity,reason) VALUES(auth.uid(),'verify_production','customer_branch_settings',p_reason);
END $$;
CREATE FUNCTION public.get_customer_scheduling_admin() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM inv_require_admin();
 RETURN jsonb_build_object('settings',(SELECT to_jsonb(s) FROM customer_branch_settings s WHERE id),'production_ready',customer_production_ready());
END $$;
CREATE FUNCTION public.customer_save_branch_settings(p_settings jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s customer_branch_settings;
BEGIN
 PERFORM inv_require_admin(); SELECT * INTO s FROM customer_branch_settings WHERE id FOR UPDATE;
 IF NOT customer_hours_valid(p_settings->'regular_hours',p_settings->'closure_dates') AND COALESCE((p_settings->>'scheduled_pickup_enabled')::boolean,false) THEN RAISE EXCEPTION 'Configure real operating hours and closures before enabling slots'; END IF;
 IF p_settings->'regular_hours' IS NULL OR p_settings->'closure_dates' IS NULL OR jsonb_typeof(p_settings->'regular_hours')<>'array' OR jsonb_typeof(p_settings->'closure_dates')<>'array' THEN RAISE EXCEPTION 'Operating hours and closures must be lists'; END IF;
 IF jsonb_array_length(p_settings->'regular_hours')>0 AND NOT customer_hours_valid(p_settings->'regular_hours',p_settings->'closure_dates') THEN RAISE EXCEPTION 'Use valid, nonoverlapping same-day operating hours and closure dates'; END IF;
 IF COALESCE((p_settings->>'scheduled_pickup_enabled')::boolean,false) AND (NOT customer_production_ready() OR (p_settings->>'slot_order_capacity')::integer IS NULL OR (p_settings->>'slot_item_capacity')::integer IS NULL) THEN RAISE EXCEPTION 'Verify production stock and recipes and configure both capacities before enabling slots'; END IF;
 UPDATE customer_branch_settings SET name=trim(p_settings->>'name'),address=trim(p_settings->>'address'),latitude=(p_settings->>'latitude')::numeric,longitude=(p_settings->>'longitude')::numeric,
  delivery_radius_km=(p_settings->>'delivery_radius_km')::numeric,contact_phone=NULLIF(trim(p_settings->>'contact_phone'),''),regular_hours=p_settings->'regular_hours',closure_dates=p_settings->'closure_dates',
  scheduled_pickup_enabled=COALESCE((p_settings->>'scheduled_pickup_enabled')::boolean,false),slot_order_capacity=NULLIF(p_settings->>'slot_order_capacity','')::integer,slot_item_capacity=NULLIF(p_settings->>'slot_item_capacity','')::integer,
  minimum_notice_minutes=(p_settings->>'minimum_notice_minutes')::integer,preparation_lead_minutes=(p_settings->>'preparation_lead_minutes')::integer,updated_at=now() WHERE id;
 IF EXISTS(SELECT 1 FROM customer_branch_settings WHERE length(name)<2 OR length(address)<5) THEN RAISE EXCEPTION 'Branch name and address are required'; END IF;
 INSERT INTO admin_audit(actor_id,action,entity,after_data) VALUES(auth.uid(),'save','customer_branch_settings',p_settings);
END $$;

-- One immutable accepted schedule; this BEFORE trigger runs before reward-return guards.
CREATE FUNCTION public.customer_guard_scheduled_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s customer_branch_settings; starts timestamptz; qty integer;
BEGIN
 IF TG_OP='INSERT' THEN NEW.legal_version:=NULLIF(current_setting('jayds.order_legal_version',true),''); END IF;
 IF TG_OP='UPDATE' AND NEW.legal_version IS DISTINCT FROM OLD.legal_version THEN RAISE EXCEPTION 'Accepted legal acknowledgement cannot be edited'; END IF;
 IF TG_OP='INSERT' AND NULLIF(current_setting('jayds.pickup_start',true),'') IS NOT NULL THEN
  starts:=current_setting('jayds.pickup_start')::timestamptz; qty:=current_setting('jayds.pickup_units')::integer;
  SELECT * INTO s FROM customer_branch_settings WHERE id;
  NEW.pickup_window_start:=starts; NEW.pickup_window_end:=starts+interval '15 minutes'; NEW.preparation_due_at:=starts-make_interval(mins=>s.preparation_lead_minutes);
  NEW.scheduled_item_units:=qty; NEW.expires_at:=LEAST(customer_schedule_now()+interval '30 minutes',NEW.preparation_due_at);
 END IF;
 IF TG_OP='UPDATE' AND (NEW.pickup_window_start IS DISTINCT FROM OLD.pickup_window_start OR NEW.pickup_window_end IS DISTINCT FROM OLD.pickup_window_end OR NEW.preparation_due_at IS DISTINCT FROM OLD.preparation_due_at OR NEW.scheduled_item_units IS DISTINCT FROM OLD.scheduled_item_units) THEN RAISE EXCEPTION 'Accepted pickup schedule cannot be edited'; END IF;
 IF NEW.pickup_window_start IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status IN('cancelled','completed') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'Closed scheduled orders cannot be reopened'; END IF;
  IF NEW.payment_status='failed' AND NEW.status IN('pending','confirmed') THEN NEW.status:='cancelled'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
   IF NEW.status='preparing' AND (OLD.status<>'confirmed' OR NEW.payment_status<>'paid' OR customer_schedule_now()<NEW.preparation_due_at) THEN RAISE EXCEPTION 'Scheduled preparation is not due or payment is not confirmed'; END IF;
   IF NEW.status='ready' AND OLD.status<>'preparing' THEN RAISE EXCEPTION 'Start preparation before marking this scheduled order ready'; END IF;
   IF NEW.status='completed' AND OLD.status<>'ready' THEN RAISE EXCEPTION 'Scheduled order is not ready for collection'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_customer_schedule BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.customer_guard_scheduled_order();
CREATE FUNCTION public.customer_pickup_lifecycle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.pickup_window_start IS NULL THEN RETURN NULL; END IF;
 IF NEW.inventory_consumed OR NEW.status IN('preparing','ready','completed') THEN
  UPDATE customer_pickup_reservations SET state='committed' WHERE order_id=NEW.id AND state='reserved';
 ELSIF NEW.status='cancelled' THEN
  UPDATE customer_pickup_reservations SET state='released' WHERE order_id=NEW.id AND state='reserved';
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER customer_pickup_lifecycle AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.customer_pickup_lifecycle();
CREATE FUNCTION public.scheduled_order_expire(p_order uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted order server required' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
 IF o.pickup_window_start IS NOT NULL AND o.status IN('pending','confirmed') AND o.payment_status IN('pending','failed') AND o.expires_at<=customer_schedule_now() THEN UPDATE orders SET status='cancelled' WHERE id=o.id; END IF;
END $$;

-- Preserve the original RPC contract and stock/price/reward engine in a private delegate.
ALTER FUNCTION public.inv_create_order(jsonb,jsonb,text,uuid,uuid,text) RENAME TO customer_legacy_create_order;
REVOKE ALL ON FUNCTION public.customer_legacy_create_order(jsonb,jsonb,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.inv_create_order(p_order jsonb,p_items jsonb,p_key text,p_actor uuid,p_voucher uuid DEFAULT NULL,p_fingerprint text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s customer_branch_settings; starts timestamptz; moment timestamptz; today date; units integer; used_orders integer; used_units integer; result jsonb; existing orders; expired record; previous_start text:=COALESCE(current_setting('jayds.pickup_start',true),''); previous_units text:=COALESCE(current_setting('jayds.pickup_units',true),''); previous_legal text:=COALESCE(current_setting('jayds.order_legal_version',true),'');
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted order server required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key,0));
 SELECT * INTO existing FROM orders WHERE idempotency_key=p_key;
 IF FOUND THEN
  IF existing.request_fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Submission key reused with different data'; END IF;
  RETURN jsonb_build_object('id',existing.id,'order_number',existing.order_number,'total',existing.total,'points_redeemed',existing.points_redeemed);
 END IF;
 PERFORM set_config('jayds.order_legal_version',COALESCE(p_order->>'legal_version',''),true);
 IF NULLIF(p_order->>'pickup_slot_start','') IS NULL THEN
  result:=customer_legacy_create_order(p_order,p_items,p_key,p_actor,p_voucher,p_fingerprint);
  PERFORM set_config('jayds.order_legal_version',previous_legal,true); RETURN result;
 END IF;
 IF p_order->>'order_source'<>'app' OR p_order->>'order_type'<>'pickup' OR p_order->>'payment_method'<>'maya' OR COALESCE((p_order->>'is_parked')::boolean,false) THEN RAISE EXCEPTION 'Scheduled pickup requires online Maya prepayment'; END IF;
 SELECT * INTO s FROM customer_branch_settings WHERE id FOR SHARE;
 IF NOT s.scheduled_pickup_enabled OR NOT customer_production_ready() OR NOT customer_hours_valid(s.regular_hours,s.closure_dates) OR s.slot_order_capacity IS NULL OR s.slot_item_capacity IS NULL THEN RAISE EXCEPTION 'Scheduled pickup is not available yet'; END IF;
 starts:=(p_order->>'pickup_slot_start')::timestamptz; moment:=customer_schedule_now(); today:=(moment AT TIME ZONE 'Asia/Manila')::date;
 IF (starts AT TIME ZONE 'Asia/Manila')::date NOT IN(today,today+1) OR starts<moment+make_interval(mins=>s.minimum_notice_minutes) OR NOT customer_slot_open(starts,s) THEN RAISE EXCEPTION 'This pickup window is no longer available. Choose another window.'; END IF;
 IF jsonb_typeof(p_items)<>'array' THEN RAISE EXCEPTION 'Invalid cart'; END IF;
 SELECT sum((x->>'quantity')::integer)::integer INTO units FROM jsonb_array_elements(p_items) x;
 IF units IS NULL OR units<1 OR units>s.slot_item_capacity THEN RAISE EXCEPTION 'The cart exceeds this pickup window capacity'; END IF;
 INSERT INTO customer_pickup_slots(starts_at) VALUES(starts) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM customer_pickup_slots WHERE starts_at=starts FOR UPDATE;
 -- Expired unpaid stock holds are released before a replacement booking is accepted.
 FOR expired IN SELECT id FROM orders WHERE pickup_window_start=starts AND status IN('pending','confirmed') AND payment_status IN('pending','failed') AND expires_at<=customer_schedule_now() ORDER BY id FOR UPDATE LOOP
  PERFORM scheduled_order_expire(expired.id);
 END LOOP;
 SELECT count(*)::integer,COALESCE(sum(r.item_units),0)::integer INTO used_orders,used_units FROM customer_pickup_reservations r JOIN orders o ON o.id=r.order_id
  WHERE r.slot_start=starts AND (r.state='committed' OR (r.state='reserved' AND (o.payment_status='paid' OR o.expires_at>customer_schedule_now())));
 IF used_orders>=s.slot_order_capacity OR used_units+units>s.slot_item_capacity THEN RAISE EXCEPTION 'This pickup window is full. Choose another window.'; END IF;
 IF starts<customer_schedule_now()+make_interval(mins=>s.minimum_notice_minutes) THEN RAISE EXCEPTION 'This pickup window is no longer available. Choose another window.'; END IF;
 PERFORM set_config('jayds.pickup_start',starts::text,true); PERFORM set_config('jayds.pickup_units',units::text,true);
 result:=customer_legacy_create_order(p_order,p_items,p_key,p_actor,p_voucher,p_fingerprint);
 INSERT INTO customer_pickup_reservations(order_id,slot_start,item_units) VALUES((result->>'id')::uuid,starts,units);
 PERFORM set_config('jayds.pickup_start',previous_start,true); PERFORM set_config('jayds.pickup_units',previous_units,true);
 PERFORM set_config('jayds.order_legal_version',previous_legal,true);
 RETURN result;
END $$;

-- Date-only batch expiry keeps its existing inclusive Manila-day meaning.
CREATE FUNCTION public.customer_stock_cutoff(p_order uuid) RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(pickup_window_end,inv_business_date()::timestamp AT TIME ZONE 'Asia/Manila') FROM orders WHERE id=p_order
$$;
CREATE OR REPLACE FUNCTION public.inv_reserve(p_order uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; b record; remaining numeric; take numeric; cutoff timestamptz:=customer_stock_cutoff(p_order);
BEGIN
 PERFORM 1 FROM ingredients WHERE id IN(SELECT ingredient_id FROM order_stock_requirements WHERE order_id=p_order) ORDER BY id FOR UPDATE;
 FOR r IN SELECT * FROM order_stock_requirements WHERE order_id=p_order ORDER BY ingredient_id LOOP
  IF NOT EXISTS(SELECT 1 FROM ingredients WHERE id=r.ingredient_id AND is_active) THEN RAISE EXCEPTION 'Stock item is inactive'; END IF;
  remaining:=r.quantity;
  FOR b IN SELECT * FROM stock_batches WHERE ingredient_id=r.ingredient_id AND quantity>reserved AND (expires_on IS NULL OR (expires_on+1)::timestamp AT TIME ZONE 'Asia/Manila'>=cutoff)
   AND (expires_on IS NULL OR expires_on>=inv_business_date()) ORDER BY expires_on NULLS LAST,received_at,id FOR UPDATE LOOP
   take:=LEAST(remaining,b.quantity-b.reserved); UPDATE stock_batches SET reserved=reserved+take WHERE id=b.id;
   INSERT INTO stock_reservations(order_id,ingredient_id,batch_id,quantity,unit_cost) VALUES(p_order,r.ingredient_id,b.id,take,b.unit_cost);
   remaining:=remaining-take; EXIT WHEN remaining<=0;
  END LOOP;
  IF remaining>0 THEN RAISE EXCEPTION 'Insufficient eligible stock for %',(SELECT name FROM ingredients WHERE id=r.ingredient_id) USING ERRCODE='P0001'; END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.inv_maintenance() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o record; previous text:=COALESCE(current_setting('jayds.order_internal',true),'');
BEGIN
 PERFORM inv_require_admin(); PERFORM set_config('jayds.order_internal','1',true);
 UPDATE orders SET status='cancelled' WHERE status IN('pending','confirmed') AND (payment_status='pending' OR (pickup_window_start IS NOT NULL AND payment_status='failed')) AND expires_at<=customer_schedule_now();
 FOR o IN SELECT id FROM orders WHERE inventory_managed AND NOT inventory_consumed AND NOT is_parked AND status IN('pending','confirmed') AND (stock_conflict OR EXISTS(
  SELECT 1 FROM stock_reservations r JOIN stock_batches b ON b.id=r.batch_id WHERE r.order_id=orders.id AND r.state='reserved' AND (b.reserved>b.quantity OR (b.expires_on IS NOT NULL AND ((b.expires_on+1)::timestamp AT TIME ZONE 'Asia/Manila'<customer_stock_cutoff(orders.id) OR b.expires_on<inv_business_date()))))) ORDER BY created_at,id FOR UPDATE LOOP
  BEGIN PERFORM inv_release(o.id); PERFORM inv_reserve(o.id); UPDATE orders SET stock_conflict=false WHERE id=o.id;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN UPDATE orders SET stock_conflict=true WHERE id=o.id; END;
 END LOOP;
 UPDATE catalog_state SET version=version+1,updated_at=now() WHERE id; PERFORM set_config('jayds.order_internal',previous,true);
END $$;
CREATE OR REPLACE FUNCTION public.inv_reconcile_reservations(p_item uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o record; previous text:=COALESCE(current_setting('jayds.order_internal',true),'');
BEGIN
 PERFORM inv_require_admin(); PERFORM set_config('jayds.order_internal','1',true);
 FOR o IN SELECT id FROM orders WHERE inventory_managed AND NOT inventory_consumed AND NOT is_parked AND status IN('pending','confirmed')
  AND(p_item IS NULL OR EXISTS(SELECT 1 FROM order_stock_requirements q WHERE q.order_id=orders.id AND q.ingredient_id=p_item))
  AND(stock_conflict OR EXISTS(SELECT 1 FROM stock_reservations r JOIN stock_batches b ON b.id=r.batch_id WHERE r.order_id=orders.id AND r.state='reserved' AND (b.reserved>b.quantity OR (b.expires_on IS NOT NULL AND ((b.expires_on+1)::timestamp AT TIME ZONE 'Asia/Manila'<customer_stock_cutoff(orders.id) OR b.expires_on<inv_business_date()))))) ORDER BY created_at,id FOR UPDATE LOOP
  BEGIN PERFORM inv_release(o.id); PERFORM inv_reserve(o.id); UPDATE orders SET stock_conflict=false WHERE id=o.id;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN UPDATE orders SET stock_conflict=true WHERE id=o.id; END;
 END LOOP;
 PERFORM set_config('jayds.order_internal',previous,true);
END $$;
CREATE OR REPLACE VIEW public.inventory_daily_usage AS
SELECT (COALESCE(o.pickup_window_start,o.created_at) AT TIME ZONE 'Asia/Manila')::date business_date,r.ingredient_id,sum(r.quantity) quantity,false estimated
FROM orders o JOIN order_stock_requirements r ON r.order_id=o.id WHERE o.status='completed' GROUP BY 1,2
UNION ALL
SELECT (o.created_at AT TIME ZONE 'Asia/Manila')::date,r.ingredient_id,sum(r.quantity),true
FROM orders o JOIN order_items oi ON oi.order_id=o.id CROSS JOIN LATERAL inv_requirements(oi.menu_item_id,COALESCE(oi.variants,'[]'),oi.quantity) r
WHERE o.status='completed' AND NOT EXISTS(SELECT 1 FROM order_stock_requirements WHERE order_id=o.id) GROUP BY 1,2;
-- Existing job retains its URL/name but shares the checked expiry and reservation maintenance.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  PERFORM cron.schedule('auto-cancel-expired-orders','* * * * *',$job$SELECT public.inv_maintenance();$job$);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.customer_schedule_now(),public.customer_recipe_fingerprint(),public.customer_production_ready(),public.customer_hours_valid(jsonb,jsonb),public.customer_slot_open(timestamptz,customer_branch_settings),public.customer_guard_scheduled_order(),public.customer_pickup_lifecycle(),public.customer_stock_cutoff(uuid),public.scheduled_order_expire(uuid),public.inv_create_order(jsonb,jsonb,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scheduled_order_expire(uuid),public.inv_create_order(jsonb,jsonb,text,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.get_customer_branch(),public.get_customer_pickup_slots(date,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_branch(),public.get_customer_pickup_slots(date,integer) TO anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.customer_verify_production(text),public.customer_save_branch_settings(jsonb),public.get_customer_scheduling_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_verify_production(text),public.customer_save_branch_settings(jsonb),public.get_customer_scheduling_admin() TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
