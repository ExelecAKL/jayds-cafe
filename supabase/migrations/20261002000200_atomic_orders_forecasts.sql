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
