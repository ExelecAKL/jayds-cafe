-- Delivery fulfillment belongs to the checked courier flow. Preserve all existing
-- payment, readiness, token, idempotency and staff authorization checks.
CREATE OR REPLACE FUNCTION public.pos_order_action(p_actor uuid,p_order uuid,p_action text,p_expected text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders; target order_status;
BEGIN
 PERFORM pos_require_staff(p_actor);
 SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF p_action='receipt' THEN PERFORM pos_ensure_receipt(o.id); RETURN pos_checkout_result(o.id); END IF;
 IF p_action='collect' AND o.order_type='delivery' THEN RAISE EXCEPTION 'Delivery completion is confirmed by the courier. Use the delivery actions instead of counter collection'; END IF;
 target:=CASE p_action WHEN 'confirm' THEN 'confirmed'::order_status WHEN 'prepare' THEN 'preparing'::order_status WHEN 'ready' THEN 'ready'::order_status WHEN 'collect' THEN 'completed'::order_status ELSE NULL END;
 IF target IS NULL THEN RAISE EXCEPTION 'Invalid order action'; END IF;
 IF o.status=target THEN RETURN jsonb_build_object('id',o.id,'status',o.status); END IF;
 IF p_expected IS NOT NULL AND o.status::text<>p_expected THEN RAISE EXCEPTION 'The order changed. Refresh before continuing'; END IF;
 IF o.is_parked OR o.payment_status<>'paid' OR o.status IN ('cancelled','completed') THEN RAISE EXCEPTION 'Confirm payment and resume the order before continuing'; END IF;
 IF (target='confirmed' AND o.status<>'pending') OR (target='preparing' AND o.status<>'confirmed') OR (target='ready' AND o.status<>'preparing') OR (target='completed' AND o.status<>'ready') THEN RAISE EXCEPTION 'Invalid order progression'; END IF;
 IF target='preparing' AND o.stock_conflict THEN RAISE EXCEPTION 'Resolve stock before preparation'; END IF;
 IF target='completed' AND o.order_source<>'pos' AND o.customer_id IS NOT NULL THEN RAISE EXCEPTION 'Scan the customer pickup QR to collect this order'; END IF;
 UPDATE orders SET status=target WHERE id=o.id;
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,after_data) VALUES(p_actor,p_action,'orders',o.id,jsonb_build_object('status',target));
 RETURN jsonb_build_object('id',o.id,'status',target);
END $$;
CREATE OR REPLACE FUNCTION public.pos_pickup(p_actor uuid,p_qr text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parts text[]; o orders; token pickup_tokens;
BEGIN
 PERFORM pos_require_staff(p_actor);
 parts:=string_to_array(p_qr,':');
 IF array_length(parts,1)<>3 OR parts[1] NOT IN ('pickup','cached') THEN RAISE EXCEPTION 'Invalid pickup QR'; END IF;
 SELECT * INTO o FROM orders WHERE id=parts[2]::uuid FOR UPDATE;
 IF NOT FOUND OR o.status='cancelled' THEN RAISE EXCEPTION 'Order is unavailable'; END IF;
 IF o.order_type='delivery' THEN RAISE EXCEPTION 'This is a delivery order. Use the delivery actions instead of pickup QR'; END IF;
 IF parts[1]='cached' THEN
  IF o.pickup_confirmation_hash IS DISTINCT FROM parts[3] OR o.status<>'pending' OR o.expires_at<=now() THEN RAISE EXCEPTION 'Invalid or expired payment confirmation QR'; END IF;
  -- Payment confirmation QR stays retryable until the cash transaction succeeds.
  RETURN jsonb_build_object('id',o.id,'payment_required',o.payment_status<>'paid','status',o.status);
 END IF;
 SELECT * INTO token FROM pickup_tokens WHERE order_id=o.id AND token_hash=parts[3] FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid pickup QR'; END IF;
 IF token.is_used AND o.status='completed' THEN RETURN jsonb_build_object('id',o.id,'status','completed','already_collected',true); END IF;
 IF token.is_used THEN RAISE EXCEPTION 'Pickup QR already used'; END IF;
 IF o.payment_status<>'paid' THEN RETURN jsonb_build_object('id',o.id,'payment_required',true,'status',o.status); END IF;
 IF o.status<>'ready' THEN RAISE EXCEPTION 'The order is not ready for collection'; END IF;
 UPDATE pickup_tokens SET is_used=true WHERE id=token.id;
 UPDATE orders SET status='completed' WHERE id=o.id;
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason) VALUES(p_actor,'collect','orders',o.id,'Pickup QR verified');
 RETURN jsonb_build_object('id',o.id,'status','completed');
END $$;

