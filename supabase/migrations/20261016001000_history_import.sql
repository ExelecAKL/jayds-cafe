CREATE FUNCTION public.cafe_history_table_hash(p_table text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET timezone='UTC' AS $$
DECLARE result text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted history server required' USING ERRCODE='42501'; END IF;
 IF p_table NOT IN('profiles','ingredients','stock_batches','menu_items','categories','item_variants','menu_item_ingredients','variant_ingredients','customer_provider_attempts','customer_push_outbox','finance_invoices','stock_reservations') THEN RAISE EXCEPTION 'Unsupported baseline table'; END IF;
 EXECUTE format('SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY to_jsonb(t)::text),'''')) FROM public.%I t',p_table) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.cafe_history_baseline() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE name text; result jsonb:='{}';
BEGIN
 FOREACH name IN ARRAY ARRAY['profiles','ingredients','stock_batches','menu_items','categories','item_variants','menu_item_ingredients','variant_ingredients'] LOOP result:=result||jsonb_build_object(name,cafe_history_table_hash(name)); END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION public.cafe_history_stage(p_run uuid,p_table text,p_part integer,p_payload jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE run cafe_history_runs; existing_hash text; fingerprint text:=md5(p_payload::text);
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted history server required' USING ERRCODE='42501'; END IF;
 IF p_table NOT IN('suppliers','purchase_orders','purchase_order_lines','goods_receipts','stock_batches','orders','order_items','order_stock_requirements','stock_reservations','stock_movements','order_status_history','order_financials','financial_events','pos_cash_payments','stocktakes','shifts','clock_entries','finance_expenses','update_ingredients','update_profiles','update_stock_batches') THEN RAISE EXCEPTION 'Unsupported history table'; END IF;
 IF p_part NOT BETWEEN 0 AND 10000 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload) NOT BETWEEN 1 AND 1000 OR octet_length(p_payload::text)>4194304 THEN RAISE EXCEPTION 'Invalid history part'; END IF;
 SELECT * INTO run FROM cafe_history_runs WHERE id=p_run FOR SHARE;
 IF NOT FOUND OR run.status<>'staging' THEN RAISE EXCEPTION 'History is not open for staging'; END IF;
 SELECT payload_hash INTO existing_hash FROM cafe_history_parts WHERE run_id=p_run AND table_name=p_table AND part=p_part;
 IF FOUND THEN IF existing_hash<>fingerprint THEN RAISE EXCEPTION 'History part changed; rebuild the staging run'; END IF; RETURN jsonb_array_length(p_payload); END IF;
 INSERT INTO cafe_history_parts(run_id,table_name,part,payload,payload_hash) VALUES(p_run,p_table,p_part,p_payload,fingerprint);
 RETURN jsonb_array_length(p_payload);
END $$;

CREATE FUNCTION public.cafe_history_apply(p_run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET timezone='UTC' AS $$
DECLARE run cafe_history_runs; actor uuid; name text; part record; update_part record; item jsonb; columns text; keys text[]; key_data jsonb; before_row jsonb; after_row jsonb;
 baseline jsonb; protected jsonb; orders_before text; orders_after text; movement_ids uuid[]; old_movements text; new_movements text; reservation_ids uuid[]; old_reservations text; new_reservations text;
 expected integer; inserted integer; updated integer:=0; checks jsonb; snapshots_before uuid[];
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted history server required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(1610202601);
 SELECT * INTO run FROM cafe_history_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'History run not found'; END IF;
 IF run.status='applied' THEN RETURN run.applied_checks; END IF;
 IF run.status<>'staging' OR EXISTS(SELECT 1 FROM cafe_history_runs WHERE status='applied' AND id<>p_run) THEN RAISE EXCEPTION 'A history dataset is already installed or this run is closed'; END IF;
 actor:=(run.manifest->>'actor_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=actor AND role='admin' AND is_approved) THEN RAISE EXCEPTION 'A current approved Admin is required'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 -- Match the ordinary order lock order: customer balances before ingredients.
 PERFORM 1 FROM profiles ORDER BY id FOR UPDATE;
 PERFORM 1 FROM ingredients ORDER BY id FOR UPDATE;
 baseline:=cafe_history_baseline();
 IF baseline IS DISTINCT FROM run.baseline THEN RAISE EXCEPTION 'Live catalog, customers or stock changed after the backup. Rebuild the dataset; no business records were changed'; END IF;
 IF EXISTS(SELECT 1 FROM cafe_history_parts WHERE run_id=p_run AND (payload IS NULL OR payload_hash<>md5(payload::text))) THEN RAISE EXCEPTION 'A staged history part failed its hash check'; END IF;
 FOR name,expected IN SELECT key,value::integer FROM jsonb_each_text(run.manifest->'counts') LOOP
  IF expected<>(SELECT COALESCE(sum(jsonb_array_length(payload)),0) FROM cafe_history_parts WHERE run_id=p_run AND table_name=name) THEN RAISE EXCEPTION 'Incomplete history table: %',name; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM cafe_history_parts p CROSS JOIN LATERAL jsonb_array_elements(p.payload) x WHERE p.run_id=p_run AND p.table_name IN('orders','stocktakes') AND (x->>'synthetic_dataset_id')::uuid IS DISTINCT FROM p_run) THEN RAISE EXCEPTION 'Missing history provenance'; END IF;
 SELECT md5(COALESCE(string_agg(md5(to_jsonb(o)::text),'' ORDER BY id),'')) INTO orders_before FROM orders o WHERE synthetic_dataset_id IS NULL;
 SELECT COALESCE(array_agg(id),'{}'),md5(COALESCE(string_agg(md5(to_jsonb(m)::text),'' ORDER BY id),'')) INTO movement_ids,old_movements FROM stock_movements m;
 SELECT COALESCE(array_agg(id),'{}'),md5(COALESCE(string_agg(md5(to_jsonb(r)::text),'' ORDER BY id),'')) INTO reservation_ids,old_reservations FROM stock_reservations r;
 SELECT COALESCE(array_agg(id),'{}') INTO snapshots_before FROM forecast_snapshots;
 protected:=jsonb_build_object('provider',cafe_history_table_hash('customer_provider_attempts'),'push',cafe_history_table_hash('customer_push_outbox'),'invoices',cafe_history_table_hash('finance_invoices'),'invoice_serial',(SELECT next_invoice FROM finance_settings),'credit_serial',(SELECT next_credit_note FROM finance_settings));
 FOREACH name IN ARRAY ARRAY['suppliers','purchase_orders','purchase_order_lines','goods_receipts','stock_batches','orders','order_items','order_stock_requirements','stock_reservations','stock_movements','order_status_history','order_financials','financial_events','pos_cash_payments','stocktakes','shifts','clock_entries','finance_expenses'] LOOP
  FOR part IN SELECT cp.* FROM cafe_history_parts cp WHERE cp.run_id=p_run AND cp.table_name=name ORDER BY cp.part LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(part.payload) x CROSS JOIN LATERAL jsonb_object_keys(x) k WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=('public.'||name)::regclass AND a.attname=k AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='')) THEN RAISE EXCEPTION 'Unknown or generated column in %',name; END IF;
   SELECT string_agg(format('%I',a.attname),',' ORDER BY a.attnum) INTO columns FROM pg_attribute a WHERE a.attrelid=('public.'||name)::regclass AND a.attnum>0 AND NOT a.attisdropped AND EXISTS(SELECT 1 FROM jsonb_array_elements(part.payload) x WHERE x?a.attname);
   EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I,$1)',name,columns,columns,name) USING part.payload;
   GET DIAGNOSTICS inserted=ROW_COUNT;
   IF inserted<>jsonb_array_length(part.payload) THEN RAISE EXCEPTION 'History insertion count mismatch'; END IF;
   keys:=CASE WHEN name IN('order_financials','pos_cash_payments') THEN ARRAY['order_id'] WHEN name='order_stock_requirements' THEN ARRAY['order_id','ingredient_id'] ELSE ARRAY['id'] END;
   SELECT jsonb_agg((SELECT jsonb_object_agg(k,x->k) FROM unnest(keys) k)) INTO key_data FROM jsonb_array_elements(part.payload) x;
   UPDATE cafe_history_parts SET row_keys=key_data WHERE run_id=p_run AND table_name=name AND cafe_history_parts.part=part.part;
  END LOOP;
 END LOOP;
 FOREACH name IN ARRAY ARRAY['profiles','stock_batches','ingredients'] LOOP
  FOR update_part IN SELECT cp.* FROM cafe_history_parts cp WHERE cp.run_id=p_run AND cp.table_name='update_'||name ORDER BY cp.part LOOP
   FOR item IN SELECT value FROM jsonb_array_elements(update_part.payload) LOOP
    keys:=CASE name WHEN 'profiles' THEN ARRAY['points','total_spent','total_orders','last_order_at','loyalty_tier'] WHEN 'stock_batches' THEN ARRAY['quantity'] ELSE ARRAY['sku','supplier_id','pack_size','min_purchase_packs','lead_time_days','safety_days','review_days','min_stock_alert','max_stock','stock_kind'] END;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k<>'id' AND NOT k=ANY(keys)) THEN RAISE EXCEPTION 'Unsupported history update'; END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',name) INTO before_row USING (item->>'id')::uuid;
    IF before_row IS NULL THEN RAISE EXCEPTION 'Original record no longer exists'; END IF;
    IF name='stock_batches' AND ((item->>'quantity')::numeric<(before_row->>'reserved')::numeric OR (item->>'quantity')::numeric>(before_row->>'quantity')::numeric) THEN RAISE EXCEPTION 'History cannot consume reserved stock or add an unreceived lot'; END IF;
    SELECT string_agg(format('%I=r.%I',k,k),',') INTO columns FROM jsonb_object_keys(item) k WHERE k<>'id';
    EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r WHERE t.id=r.id RETURNING to_jsonb(t)',name,columns,name) INTO after_row USING item;
    INSERT INTO cafe_history_before(run_id,table_name,row_key,before_record,after_record) VALUES(p_run,name,jsonb_build_object('id',item->'id'),(SELECT jsonb_object_agg(k,before_row->k) FROM jsonb_object_keys(item) k),(SELECT jsonb_object_agg(k,after_row->k) FROM jsonb_object_keys(item) k));
    updated:=updated+1;
   END LOOP;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM ingredients i WHERE i.current_stock IS DISTINCT FROM (SELECT COALESCE(sum(quantity),0) FROM stock_batches WHERE ingredient_id=i.id)) OR EXISTS(SELECT 1 FROM stock_batches WHERE quantity<reserved OR quantity<0) THEN RAISE EXCEPTION 'Stock balances do not reconcile'; END IF;
 IF EXISTS(SELECT 1 FROM orders o WHERE o.synthetic_dataset_id=p_run AND (o.subtotal<>(SELECT sum(subtotal) FROM order_items WHERE order_id=o.id) OR o.total<>o.subtotal-o.discount+COALESCE(o.delivery_fee,0))) THEN RAISE EXCEPTION 'Order totals do not reconcile'; END IF;
 IF EXISTS(SELECT 1 FROM orders o JOIN order_financials f ON f.order_id=o.id WHERE o.synthetic_dataset_id=p_run AND (f.breakdown->>'total')::bigint<>round(o.total*100)) THEN RAISE EXCEPTION 'Financial snapshots do not reconcile'; END IF;
 IF EXISTS(SELECT 1 FROM order_stock_requirements r JOIN orders o ON o.id=r.order_id WHERE o.synthetic_dataset_id=p_run AND o.inventory_consumed AND abs(r.quantity+(SELECT COALESCE(sum(quantity),0) FROM stock_movements m WHERE m.order_id=o.id AND m.ingredient_id=r.ingredient_id AND m.movement_type='consumption'))>.000001) THEN RAISE EXCEPTION 'Recipe consumption does not reconcile'; END IF;
 SELECT md5(COALESCE(string_agg(md5(to_jsonb(o)::text),'' ORDER BY id),'')) INTO orders_after FROM orders o WHERE synthetic_dataset_id IS NULL;
 SELECT md5(COALESCE(string_agg(md5(to_jsonb(m)::text),'' ORDER BY id),'')) INTO new_movements FROM stock_movements m WHERE id=ANY(movement_ids);
 SELECT md5(COALESCE(string_agg(md5(to_jsonb(r)::text),'' ORDER BY id),'')) INTO new_reservations FROM stock_reservations r WHERE id=ANY(reservation_ids);
 IF orders_before<>orders_after OR old_movements<>new_movements OR old_reservations<>new_reservations THEN RAISE EXCEPTION 'An existing order or stock ledger record changed'; END IF;
 IF protected IS DISTINCT FROM jsonb_build_object('provider',cafe_history_table_hash('customer_provider_attempts'),'push',cafe_history_table_hash('customer_push_outbox'),'invoices',cafe_history_table_hash('finance_invoices'),'invoice_serial',(SELECT next_invoice FROM finance_settings),'credit_serial',(SELECT next_credit_note FROM finance_settings)) THEN RAISE EXCEPTION 'Import affected protected invoice or provider records'; END IF;
 PERFORM inv_refresh_forecasts();
 INSERT INTO cafe_history_parts(run_id,table_name,part,row_keys,payload_hash) SELECT p_run,'forecast_snapshots',0,COALESCE(jsonb_agg(jsonb_build_object('id',id)),'[]'),'generated' FROM forecast_snapshots WHERE NOT id=ANY(snapshots_before);
 -- Preserve only row identities after verification; business records hold the data.
 UPDATE cafe_history_parts SET payload=NULL WHERE run_id=p_run;
 checks:=jsonb_build_object('status','PASS','dataset_id',p_run,'counts',run.manifest->'counts','updated_existing_records',updated,'existing_orders_preserved',true,'existing_ledger_preserved',true,'reserved_stock_preserved',true,'official_invoices_created',0,'provider_calls',0,'push_events_created',0,'stock_reconciled',true,'financials_reconciled',true,'physical_stock_verified',false);
 UPDATE cafe_history_runs SET status='applied',applied_at=now(),applied_checks=checks WHERE id=p_run;
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason,after_data) VALUES(actor,'import_history','cafe_history_runs',p_run,'Operating history imported',checks);
 RETURN checks;
END $$;
REVOKE ALL ON FUNCTION public.cafe_history_table_hash(text),public.cafe_history_baseline(),public.cafe_history_stage(uuid,text,integer,jsonb),public.cafe_history_apply(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cafe_history_table_hash(text),public.cafe_history_baseline(),public.cafe_history_stage(uuid,text,integer,jsonb),public.cafe_history_apply(uuid) TO service_role;
CREATE INDEX history_movement_order_item ON public.stock_movements(order_id,ingredient_id) WHERE order_id IS NOT NULL;
CREATE INDEX history_requirement_item_order ON public.order_stock_requirements(ingredient_id,order_id);
