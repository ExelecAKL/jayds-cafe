-- Read-only investigation and reviewed replenishment; no fabricated historical balances.
CREATE FUNCTION public.admin_stock_record(p_kind text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m stock_movements; c stocktakes; stock_id uuid; order_ref uuid; source_ref uuid; result jsonb;
BEGIN
 PERFORM finance_require_admin();
 IF p_kind='movement' THEN
  SELECT * INTO m FROM stock_movements WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movement not found'; END IF;
  stock_id:=m.ingredient_id; order_ref:=m.order_id; source_ref:=m.source_id;
  result:=jsonb_build_object('kind',p_kind,'record',to_jsonb(m));
 ELSIF p_kind='stocktake' THEN
  SELECT * INTO c FROM stocktakes WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Physical count not found'; END IF;
  stock_id:=c.ingredient_id; source_ref:=c.id;
  result:=jsonb_build_object('kind',p_kind,'record',to_jsonb(c));
 ELSE RAISE EXCEPTION 'Unknown stock record type'; END IF;
 RETURN result||jsonb_build_object(
  'stock',(SELECT to_jsonb(s) FROM stock_overview s WHERE id=stock_id),
  'actor',(SELECT jsonb_build_object('id',p.id,'name',p.full_name,'role',p.role) FROM profiles p WHERE id=CASE WHEN p_kind='movement' THEN m.actor_id ELSE c.actor_id END),
  'batch',(SELECT to_jsonb(b) FROM stock_batches b WHERE b.id=m.batch_id),
  'count',(SELECT to_jsonb(s) FROM stocktakes s WHERE s.id=source_ref),
  'receipt',(SELECT to_jsonb(r)||jsonb_build_object('supplier_name',s.name) FROM goods_receipts r LEFT JOIN purchase_orders po ON po.id=r.purchase_order_id LEFT JOIN suppliers s ON s.id=po.supplier_id WHERE r.id=source_ref),
  'order',(SELECT jsonb_build_object('id',o.id,'number',o.order_number,'status',o.status,'source',o.order_source,'type',o.order_type,'payment_status',o.payment_status,'total',o.total,'created_at',o.created_at) FROM orders o WHERE o.id=order_ref),
  'related_movements',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id) FROM (
   SELECT sm.id,sm.ingredient_id,s.name,s.unit,sm.movement_type,sm.quantity,sm.balance_after,sm.reason,sm.created_at
   FROM stock_movements sm JOIN ingredients s ON s.id=sm.ingredient_id
   WHERE (order_ref IS NOT NULL AND sm.order_id=order_ref) OR (source_ref IS NOT NULL AND sm.source_id=source_ref)
  ) x),'[]'::jsonb));
END $$;

CREATE FUNCTION public.admin_stock_insight(p_id uuid,p_horizon integer DEFAULT 14) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE item stock_overview; prediction forecast_overview;
BEGIN
 PERFORM finance_require_admin();
 IF p_horizon NOT IN(7,14,30) THEN RAISE EXCEPTION 'Choose 7, 14 or 30 days'; END IF;
 SELECT * INTO item FROM stock_overview WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;
 SELECT * INTO prediction FROM forecast_overview WHERE ingredient_id=p_id AND horizon=p_horizon;
 RETURN jsonb_build_object('stock',to_jsonb(item),'forecast',CASE WHEN prediction.ingredient_id IS NOT NULL THEN to_jsonb(prediction) END,
  'business_date',inv_business_date(),'stale',prediction.calculated_at IS NULL OR prediction.calculated_at<now()-interval '36 hours',
  'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',inv_business_date()-55+n,'quantity',COALESCE(u.quantity,0),'estimated',COALESCE(u.estimated,false)) ORDER BY n)
   FROM generate_series(0,55) n
   LEFT JOIN (SELECT business_date,sum(quantity) quantity,bool_or(estimated) estimated FROM inventory_daily_usage WHERE ingredient_id=p_id GROUP BY business_date) u ON u.business_date=inv_business_date()-55+n),'[]'::jsonb),
  'projection',CASE WHEN prediction.ingredient_id IS NULL THEN '[]'::jsonb ELSE (
   SELECT jsonb_agg(jsonb_build_object('date',inv_business_date()+d,'demand',prediction.daily_demand*d,
    'without_deliveries',item.available_stock-prediction.daily_demand*d,
    'with_scheduled_deliveries',item.available_stock-prediction.daily_demand*d+COALESCE((
     SELECT sum(GREATEST(0,l.quantity-l.received_quantity)) FROM purchase_order_lines l JOIN purchase_orders po ON po.id=l.purchase_order_id
     WHERE l.ingredient_id=p_id AND po.status IN('approved','ordered','partial') AND po.expected_on IS NOT NULL AND po.expected_on<=inv_business_date()+d),0)) ORDER BY d)
   FROM generate_series(0,p_horizon) d) END,
  'snapshots',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.calculated_at) FROM (
    SELECT demand,history_days,method,calculated_at FROM forecast_snapshots WHERE ingredient_id=p_id AND horizon=p_horizon ORDER BY calculated_at DESC,id DESC LIMIT 8) x),'[]'::jsonb));
END $$;

CREATE FUNCTION public.admin_replenishment_preview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE payload jsonb;
BEGIN
 PERFORM finance_require_admin();
 WITH eligible AS (
  SELECT f.ingredient_id,f.name,f.unit,f.supplier_id,s.name supplier_name,f.available_stock,f.incoming_stock,f.reorder_quantity quantity,f.cost_per_unit,
   f.history_days,f.calculated_at FROM forecast_overview f JOIN suppliers s ON s.id=f.supplier_id AND s.is_active
  WHERE f.horizon=14 AND f.history_days>=14 AND f.reorder_quantity>0 AND f.calculated_at>=now()-interval '36 hours'
  AND NOT EXISTS(SELECT 1 FROM purchase_orders po WHERE po.supplier_id=s.id AND po.status='draft' AND po.manually_edited)
 ), existing AS (
  SELECT po.id,po.supplier_id,po.created_at,l.id line_id,l.ingredient_id,l.quantity,l.unit_cost
  FROM purchase_orders po LEFT JOIN purchase_order_lines l ON l.purchase_order_id=po.id
  WHERE po.status='draft' AND po.generated AND NOT po.manually_edited
 ), removals AS (
  SELECT e.id purchase_order_id,e.line_id,e.ingredient_id,i.name,i.unit,e.quantity old_quantity
  FROM existing e JOIN ingredients i ON i.id=e.ingredient_id
  WHERE EXISTS(SELECT 1 FROM inventory_forecasts f WHERE f.ingredient_id=e.ingredient_id AND f.horizon=14 AND f.history_days>=14 AND f.calculated_at>=now()-interval '36 hours')
  AND NOT EXISTS(SELECT 1 FROM purchase_orders po WHERE po.supplier_id=e.supplier_id AND po.status='draft' AND po.manually_edited)
  AND NOT EXISTS(SELECT 1 FROM eligible f WHERE f.ingredient_id=e.ingredient_id AND f.supplier_id=e.supplier_id)
 ) SELECT jsonb_build_object('lines',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY supplier_name,name,ingredient_id) FROM eligible e),'[]'::jsonb),
  'existing_drafts',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY id,line_id) FROM existing e),'[]'::jsonb),
  'removals',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY purchase_order_id,line_id) FROM removals r),'[]'::jsonb)) INTO payload;
 RETURN payload||jsonb_build_object('review_hash',md5(payload::text),'horizon',14);
END $$;

CREATE FUNCTION public.admin_create_replenishment(p_review_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE preview jsonb; supplier_ref uuid; po_id uuid; row jsonb; created integer:=0;
BEGIN
 PERFORM finance_require_admin(); PERFORM pg_advisory_xact_lock(8712341);
 -- Lock reviewed generated drafts before taking the current proposal snapshot.
 PERFORM 1 FROM purchase_orders WHERE status='draft' AND generated AND NOT manually_edited ORDER BY id FOR UPDATE;
 preview:=admin_replenishment_preview();
 IF p_review_hash IS NULL OR p_review_hash IS DISTINCT FROM preview->>'review_hash' THEN RAISE EXCEPTION 'Suggestions changed. Review the latest quantities before creating drafts.'; END IF;
 FOR supplier_ref IN SELECT DISTINCT (x->>'supplier_id')::uuid FROM jsonb_array_elements(preview->'lines') x LOOP
  SELECT id INTO po_id FROM purchase_orders WHERE supplier_id=supplier_ref AND status='draft' AND generated AND NOT manually_edited ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF po_id IS NULL THEN
   INSERT INTO purchase_orders(supplier_id,generated,expected_on,notes) SELECT supplier_ref,true,inv_business_date()+lead_time_days,'Reviewed 14-day replenishment suggestions' FROM suppliers WHERE id=supplier_ref RETURNING id INTO po_id;
  END IF;
  DELETE FROM purchase_order_lines WHERE purchase_order_id=po_id;
  FOR row IN SELECT value FROM jsonb_array_elements(preview->'lines') WHERE (value->>'supplier_id')::uuid=supplier_ref LOOP
   INSERT INTO purchase_order_lines(purchase_order_id,ingredient_id,quantity,unit_cost) VALUES(po_id,(row->>'ingredient_id')::uuid,(row->>'quantity')::numeric,(row->>'cost_per_unit')::numeric);
  END LOOP;
  created:=created+1;
 END LOOP;
 FOR row IN SELECT value FROM jsonb_array_elements(preview->'removals') LOOP
  DELETE FROM purchase_order_lines l USING purchase_orders po WHERE l.id=(row->>'line_id')::uuid AND po.id=l.purchase_order_id AND po.status='draft' AND po.generated AND NOT po.manually_edited;
 END LOOP;
 UPDATE purchase_orders po SET status='cancelled' WHERE status='draft' AND generated AND NOT manually_edited AND NOT EXISTS(SELECT 1 FROM purchase_order_lines l WHERE l.purchase_order_id=po.id);
 INSERT INTO admin_audit(actor_id,action,entity,reason) VALUES(auth.uid(),'review_replenishment','purchase_orders','Reviewed server-calculated 14-day purchase suggestions');
 RETURN jsonb_build_object('drafts_updated',created);
END $$;

-- Background refresh remains automatic; creating drafts is now a reviewed action.
ALTER FUNCTION public.inv_generate_drafts() RENAME TO inv_generate_drafts_unreviewed;
REVOKE ALL ON FUNCTION public.inv_generate_drafts_unreviewed() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.inv_generate_drafts() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM finance_require_admin(); RAISE EXCEPTION 'Review replenishment suggestions before creating purchase drafts'; END $$;
DO $$ DECLARE task record; BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  FOR task IN SELECT jobid FROM cron.job WHERE jobname IN('jayds-replenishment-drafts','jayds-daily-forecast') LOOP PERFORM cron.unschedule(task.jobid); END LOOP;
  PERFORM cron.schedule('jayds-daily-forecast','0 18 * * *',$job$SELECT public.inv_refresh_forecasts();$job$);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_stock_record(text,uuid),public.admin_stock_insight(uuid,integer),public.admin_replenishment_preview(),public.admin_create_replenishment(text),public.inv_generate_drafts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_stock_record(text,uuid),public.admin_stock_insight(uuid,integer),public.admin_replenishment_preview(),public.admin_create_replenishment(text),public.inv_generate_drafts() TO authenticated,service_role;
