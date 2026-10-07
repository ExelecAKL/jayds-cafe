-- Mobile ASAP cash pickup is prepared unpaid; QR, cash and collection commit
-- together at handover. Counter sales and Maya prepayment keep their own flows.
CREATE FUNCTION public.pos_is_cash_pickup(o public.orders) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(o.order_source='app' AND o.order_type='pickup' AND o.payment_method='cash'
   AND (to_jsonb(o)->>'pickup_window_start') IS NULL,false)
$$;
REVOKE ALL ON FUNCTION public.pos_is_cash_pickup(public.orders) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pos_is_cash_pickup(public.orders) TO service_role;

-- Patch reviewed functions without changing their existing ownership or grants.
DO $repair$
DECLARE definition text; previous text; replacement text;
BEGIN
 definition:=pg_get_functiondef('public.pos_order_action(uuid,uuid,text,text)'::regprocedure);
 previous:='IF o.is_parked OR o.payment_status<>''paid'' OR o.status IN (''cancelled'',''completed'') THEN';
 replacement:='IF o.is_parked OR (o.payment_status<>''paid'' AND NOT (public.pos_is_cash_pickup(o) AND o.payment_status=''pending'' AND target<>''completed'')) OR o.status IN (''cancelled'',''completed'') THEN';
 IF position(previous IN definition)=0 OR position('Delivery completion is confirmed by the courier' IN definition)=0 OR position('OR o.order_type=''pickup''' IN definition)=0 THEN RAISE EXCEPTION 'Apply the reviewed fulfillment guards first'; END IF;
 definition:=replace(definition,previous,replacement);
 previous:='UPDATE orders SET status=target WHERE id=o.id;';
 replacement:='IF public.pos_is_cash_pickup(o) AND target=''confirmed'' AND o.expires_at<=now() THEN RAISE EXCEPTION ''This unpaid order has expired''; END IF;
 UPDATE orders SET status=target,expires_at=CASE WHEN public.pos_is_cash_pickup(o) AND target=''confirmed'' THEN NULL ELSE expires_at END WHERE id=o.id;';
 IF position(previous IN definition)=0 THEN RAISE EXCEPTION 'Unexpected order action definition'; END IF;
 EXECUTE replace(definition,previous,replacement);

 definition:=pg_get_functiondef('public.pos_pickup(uuid,text)'::regprocedure);
 previous:='IF o.payment_status<>''paid'' THEN RETURN jsonb_build_object(''id'',o.id,''payment_required'',true,''status'',o.status); END IF;';
 replacement:='IF public.pos_is_cash_pickup(o) AND o.status<>''ready'' THEN RAISE EXCEPTION ''The order is not ready for collection''; END IF;
 IF o.payment_status<>''paid'' THEN RETURN jsonb_build_object(''id'',o.id,''payment_required'',true,''status'',o.status); END IF;';
 IF position(previous IN definition)=0 THEN RAISE EXCEPTION 'Unexpected pickup definition'; END IF;
 EXECUTE replace(definition,previous,replacement);

 definition:=pg_get_functiondef('public.inv_order_lifecycle()'::regprocedure);
 previous:='IF NEW.payment_status<>''paid'' THEN RAISE EXCEPTION ''Confirm payment before preparation''; END IF;';
 replacement:='IF NEW.payment_status<>''paid'' AND NOT (public.pos_is_cash_pickup(NEW) AND NEW.payment_status=''pending'' AND NEW.status IN (''preparing'',''ready'')) THEN RAISE EXCEPTION ''Confirm payment before preparation''; END IF;';
 IF position(previous IN definition)=0 THEN RAISE EXCEPTION 'Unexpected inventory payment guard'; END IF;
 EXECUTE replace(definition,previous,replacement);

 definition:=pg_get_functiondef('public.pos_cash_checkout(uuid,text,text,numeric,numeric,jsonb,jsonb,uuid)'::regprocedure);
 previous:='IF saved.total<>p_expected THEN';
 replacement:='IF public.pos_is_cash_pickup(saved) THEN RAISE EXCEPTION ''Scan the ready mobile pickup QR and record cash at collection''; END IF;
 IF saved.total<>p_expected THEN';
 IF position(previous IN definition)=0 THEN RAISE EXCEPTION 'Unexpected cash checkout definition'; END IF;
 EXECUTE replace(definition,previous,replacement);

 definition:=pg_get_functiondef('public.get_pos_status_board()'::regprocedure);
 previous:='o.payment_status=''paid'' AND NOT o.is_parked';
 replacement:='(o.payment_status=''paid'' OR (public.pos_is_cash_pickup(o) AND o.payment_status=''pending'')) AND NOT o.is_parked';
 IF position(previous IN definition)=0 THEN RAISE EXCEPTION 'Unexpected status board definition'; END IF;
 EXECUTE replace(definition,previous,replacement);

 IF to_regprocedure('public.customer_order_alert()') IS NOT NULL THEN
  definition:=pg_get_functiondef('public.customer_order_alert()'::regprocedure);
  previous:='IF NEW.payment_status::text<>''paid'' THEN RETURN NEW; END IF;';
  replacement:='IF NEW.payment_status::text<>''paid'' AND NOT (public.pos_is_cash_pickup(NEW) AND NEW.payment_status=''pending'' AND NEW.status=''ready'') THEN RETURN NEW; END IF;';
  IF position(previous IN definition)=0 THEN RAISE EXCEPTION 'Unexpected ready notification guard'; END IF;
  EXECUTE replace(definition,previous,replacement);
  definition:=pg_get_functiondef('public.customer_push_delivery_context(uuid,integer)'::regprocedure);
  previous:='o.payment_status::text<>''paid'' OR';
  replacement:='(o.payment_status::text<>''paid'' AND NOT (public.pos_is_cash_pickup(o) AND o.payment_status=''pending'' AND o.status=''ready'' AND job.event_key=job.order_id||'':ready'')) OR';
  IF position(previous IN definition)=0 THEN RAISE EXCEPTION 'Unexpected push delivery guard'; END IF;
  EXECUTE replace(definition,previous,replacement);
 END IF;
END;
$repair$;

CREATE FUNCTION public.pos_cash_pickup(p_actor uuid,p_key text,p_fingerprint text,p_qr text,p_cash numeric,p_expected numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parts text[]; o orders; previous pos_checkout_attempts; result jsonb;
BEGIN
 PERFORM pos_require_staff(p_actor);
 IF p_key IS NULL OR length(p_key)<16 OR length(p_key)>300 OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'Submission key required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('cash:'||p_key,0));
 SELECT * INTO previous FROM pos_checkout_attempts WHERE key=p_key;
 IF FOUND THEN
  IF previous.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Submission key reused with different data'; END IF;
  RETURN previous.result;
 END IF;
 IF p_cash IS NULL OR p_expected IS NULL OR p_cash::text IN ('NaN','Infinity','-Infinity') OR p_expected::text IN ('NaN','Infinity','-Infinity') OR p_cash<0 OR p_expected<0 OR round(p_cash,2)<>p_cash OR round(p_expected,2)<>p_expected THEN RAISE EXCEPTION 'Enter a valid cash amount with at most two decimals'; END IF;
 parts:=string_to_array(p_qr,':');
 IF array_length(parts,1) IS DISTINCT FROM 3 OR parts[1]<>'pickup' THEN RAISE EXCEPTION 'Scan the ready mobile pickup QR'; END IF;
 SELECT * INTO o FROM orders WHERE id=parts[2]::uuid FOR UPDATE;
 IF NOT FOUND OR NOT public.pos_is_cash_pickup(o) OR o.is_parked OR o.status<>'ready' OR o.payment_status<>'pending' THEN RAISE EXCEPTION 'Only a ready, unpaid mobile cash pickup can be collected'; END IF;
 -- Locks and validates the private token before accepting any tender.
 PERFORM pos_pickup(p_actor,p_qr);
 IF o.total<>p_expected THEN RAISE EXCEPTION 'The total changed. Review the current ticket before payment'; END IF;
 IF p_cash<o.total THEN RAISE EXCEPTION 'Cash received is insufficient'; END IF;
 INSERT INTO pos_cash_payments(order_id,actor_id,cash_received,amount_paid,change_due) VALUES(o.id,p_actor,p_cash,o.total,p_cash-o.total);
 UPDATE pickup_tokens SET is_used=true WHERE order_id=o.id AND token_hash=parts[3];
 UPDATE orders SET payment_status='paid',status='completed' WHERE id=o.id;
 PERFORM pos_ensure_receipt(o.id);
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason,after_data) VALUES
  (p_actor,'cash_payment','orders',o.id,'Cash received at QR-verified pickup',jsonb_build_object('received',p_cash,'paid',o.total,'change',p_cash-o.total)),
  (p_actor,'collect','orders',o.id,'Pickup QR verified and cash recorded together',jsonb_build_object('status','completed'));
 result:=pos_checkout_result(o.id)||jsonb_build_object('collected',true);
 INSERT INTO pos_checkout_attempts(key,fingerprint,result) VALUES(p_key,p_fingerprint,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pos_cash_pickup(uuid,text,text,text,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pos_cash_pickup(uuid,text,text,text,numeric,numeric) TO service_role;
NOTIFY pgrst,'reload schema';
