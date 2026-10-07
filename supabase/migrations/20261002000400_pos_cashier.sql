-- Additive cashier operations; apply after inventory migrations 001-003.
CREATE TABLE public.pos_cash_payments (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id), actor_id uuid NOT NULL REFERENCES public.profiles(id),
 cash_received numeric(14,2) NOT NULL CHECK(cash_received>=0 AND cash_received::text NOT IN ('NaN','Infinity','-Infinity')),
 amount_paid numeric(14,2) NOT NULL CHECK(amount_paid>=0 AND amount_paid::text NOT IN ('NaN','Infinity','-Infinity')),
 change_due numeric(14,2) NOT NULL CHECK(change_due=cash_received-amount_paid AND change_due>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.pos_checkout_attempts (key text PRIMARY KEY, fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.pos_order_state (id boolean PRIMARY KEY DEFAULT true CHECK(id), version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.pos_order_state(id) VALUES(true);
ALTER TABLE public.pos_cash_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_checkout_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_order_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY pos_cash_read ON public.pos_cash_payments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('staff','admin') AND is_approved));
CREATE POLICY pos_state_read ON public.pos_order_state FOR SELECT USING(true);
GRANT SELECT ON public.pos_cash_payments TO authenticated;
GRANT SELECT ON public.pos_order_state TO anon,authenticated;
GRANT ALL ON public.pos_cash_payments,public.pos_checkout_attempts,public.pos_order_state TO service_role;
REVOKE INSERT,UPDATE,DELETE ON public.pos_cash_payments,public.pos_checkout_attempts,public.pos_order_state FROM anon,authenticated;
CREATE TRIGGER pos_cash_immutable BEFORE UPDATE OR DELETE ON public.pos_cash_payments FOR EACH ROW EXECUTE FUNCTION public.inv_immutable();
CREATE TRIGGER pos_attempt_immutable BEFORE UPDATE OR DELETE ON public.pos_checkout_attempts FOR EACH ROW EXECUTE FUNCTION public.inv_immutable();

CREATE FUNCTION public.pos_require_staff(p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted cashier server required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND role IN ('staff','admin') AND is_approved) THEN RAISE EXCEPTION 'Approved staff access required' USING ERRCODE='42501'; END IF;
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
END $$;

CREATE FUNCTION public.pos_ensure_receipt(p_order uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders;
BEGIN
 SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
 IF o.payment_status<>'paid' THEN RAISE EXCEPTION 'Payment must be confirmed before issuing a receipt'; END IF;
 IF EXISTS(SELECT 1 FROM guest_receipts WHERE order_id=p_order AND expires_at>now()) THEN RETURN; END IF;
 INSERT INTO guest_receipts(order_id,receipt_token,receipt_data)
 SELECT o.id,gen_random_uuid()::text,jsonb_build_object('order_number',o.order_number,'subtotal',o.subtotal,'discount',o.discount,'points_redeemed',o.points_redeemed,'delivery_fee',o.delivery_fee,'total',o.total,'payment_method',o.payment_method,'date',now(),
 'cash_tender',(SELECT jsonb_build_object('cash_received',p.cash_received,'amount_paid',p.amount_paid,'change_due',p.change_due) FROM pos_cash_payments p WHERE p.order_id=o.id),
 'cash_received',(SELECT p.cash_received FROM pos_cash_payments p WHERE p.order_id=o.id),'change_due',(SELECT p.change_due FROM pos_cash_payments p WHERE p.order_id=o.id),
 'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',i.name,'qty',i.quantity,'price',i.subtotal,'variants',i.variants,'notes',i.notes) ORDER BY i.id) FROM order_items i WHERE i.order_id=o.id),'[]'::jsonb));
END $$;
CREATE FUNCTION public.pos_checkout_result(p_order uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('id',o.id,'order_number',o.order_number,'total',o.total,'status',o.status,'payment_status',o.payment_status,
 'payment',(SELECT jsonb_build_object('cash_received',p.cash_received,'amount_paid',p.amount_paid,'change_due',p.change_due,'created_at',p.created_at) FROM pos_cash_payments p WHERE p.order_id=o.id),
 'receipt',(SELECT jsonb_build_object('receipt_token',r.receipt_token,'receipt_data',r.receipt_data,'expires_at',r.expires_at) FROM guest_receipts r WHERE r.order_id=o.id AND r.expires_at>now() ORDER BY r.created_at,r.id LIMIT 1)) FROM orders o WHERE o.id=p_order
$$;

CREATE FUNCTION public.pos_save_parked(p_actor uuid,p_order jsonb,p_items jsonb,p_key text,p_fingerprint text,p_existing uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders; saved jsonb;
BEGIN
 PERFORM pos_require_staff(p_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key,0));
 SELECT * INTO o FROM orders WHERE idempotency_key=p_key;
 IF FOUND THEN
  IF o.request_fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Submission key reused with different data'; END IF;
  RETURN jsonb_build_object('id',o.id,'order_number',o.order_number,'total',o.total,'points_redeemed',o.points_redeemed);
 END IF;
 IF p_order->>'order_source'<>'pos' OR NOT COALESCE((p_order->>'is_parked')::boolean,false) OR COALESCE((p_order->>'points_redeemed')::integer,0)<>0 THEN RAISE EXCEPTION 'A parked cashier draft is required'; END IF;
 IF p_existing IS NOT NULL THEN
  SELECT * INTO o FROM orders WHERE id=p_existing FOR UPDATE;
  IF NOT FOUND OR NOT o.is_parked OR o.status<>'pending' OR o.payment_status<>'pending' THEN RAISE EXCEPTION 'Only parked unpaid tickets can be edited'; END IF;
 END IF;
 saved:=inv_create_order(p_order,p_items,p_key,p_actor,NULL,p_fingerprint);
 UPDATE orders SET expires_at=NULL WHERE id=(saved->>'id')::uuid;
 IF p_existing IS NOT NULL THEN
  UPDATE orders SET status='cancelled' WHERE id=p_existing;
  INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason,after_data) VALUES(p_actor,'edit_parked','orders',p_existing,'Parked draft replaced after cashier review',jsonb_build_object('replacement_id',saved->>'id'));
 END IF;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.pos_save_parked(uuid,jsonb,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pos_save_parked(uuid,jsonb,jsonb,text,text,uuid) TO service_role;

CREATE FUNCTION public.pos_cash_checkout(p_actor uuid,p_key text,p_fingerprint text,p_cash numeric,p_expected numeric,p_order jsonb DEFAULT NULL,p_items jsonb DEFAULT NULL,p_existing uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_order orders; saved orders; previous pos_checkout_attempts; result jsonb; created jsonb;
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
 IF p_existing IS NOT NULL THEN
  SELECT * INTO old_order FROM orders WHERE id=p_existing FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF old_order.status IN ('cancelled','completed') OR old_order.payment_status='refunded' THEN RAISE EXCEPTION 'This order is closed'; END IF;
  IF old_order.payment_method<>'cash' THEN RAISE EXCEPTION 'This order requires provider-verified payment'; END IF;
  IF NOT old_order.is_parked AND p_items IS NOT NULL THEN RAISE EXCEPTION 'Accepted order items cannot be edited'; END IF;
  IF old_order.payment_status='paid' THEN
   PERFORM pos_ensure_receipt(old_order.id);
   RETURN pos_checkout_result(old_order.id)||jsonb_build_object('already_paid',true);
  END IF;
  IF NOT old_order.is_parked AND old_order.expires_at<=now() THEN RAISE EXCEPTION 'This unpaid order has expired'; END IF;
 END IF;
 IF p_existing IS NULL OR old_order.is_parked THEN
  IF p_order IS NULL OR p_items IS NULL OR COALESCE((p_order->>'is_parked')::boolean,false) OR p_order->>'order_source'<>'pos' OR p_order->>'payment_method'<>'cash' THEN RAISE EXCEPTION 'A current cash register draft is required'; END IF;
  created:=inv_create_order(p_order,p_items,p_key||':order',p_actor,NULL,p_fingerprint);
  SELECT * INTO saved FROM orders WHERE id=(created->>'id')::uuid FOR UPDATE;
  IF p_existing IS NOT NULL THEN
   -- A parked ticket has not been accepted or consumed. Keep its history and replace it atomically.
   UPDATE orders SET status='cancelled' WHERE id=old_order.id;
   INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason,after_data) VALUES(p_actor,'resume_parked','orders',old_order.id,'Parked draft accepted at current prices',jsonb_build_object('accepted_order_id',saved.id));
  END IF;
 ELSE
  saved:=old_order;
  IF saved.stock_conflict THEN RAISE EXCEPTION 'Resolve this order stock shortage before taking payment'; END IF;
  IF saved.inventory_managed THEN PERFORM inv_release(saved.id); PERFORM inv_reserve(saved.id); END IF;
 END IF;
 IF saved.total<>p_expected THEN RAISE EXCEPTION 'The total changed. Review the current ticket before payment'; END IF;
 IF p_cash<saved.total THEN RAISE EXCEPTION 'Cash received is insufficient'; END IF;
 INSERT INTO pos_cash_payments(order_id,actor_id,cash_received,amount_paid,change_due) VALUES(saved.id,p_actor,p_cash,saved.total,p_cash-saved.total);
 UPDATE orders SET payment_status='paid',status=CASE WHEN status='pending' THEN 'confirmed'::order_status ELSE status END WHERE id=saved.id;
 PERFORM pos_ensure_receipt(saved.id);
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason,after_data) VALUES(p_actor,'cash_payment','orders',saved.id,'Cashier confirmed cash received',jsonb_build_object('received',p_cash,'paid',saved.total,'change',p_cash-saved.total));
 result:=pos_checkout_result(saved.id);
 INSERT INTO pos_checkout_attempts(key,fingerprint,result) VALUES(p_key,p_fingerprint,result);
 RETURN result;
END $$;

CREATE FUNCTION public.pos_order_action(p_actor uuid,p_order uuid,p_action text,p_expected text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders; target order_status;
BEGIN
 PERFORM pos_require_staff(p_actor);
 SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF p_action='receipt' THEN PERFORM pos_ensure_receipt(o.id); RETURN pos_checkout_result(o.id); END IF;
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
CREATE FUNCTION public.pos_pickup(p_actor uuid,p_qr text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parts text[]; o orders; token pickup_tokens;
BEGIN
 PERFORM pos_require_staff(p_actor);
 parts:=string_to_array(p_qr,':');
 IF array_length(parts,1)<>3 OR parts[1] NOT IN ('pickup','cached') THEN RAISE EXCEPTION 'Invalid pickup QR'; END IF;
 SELECT * INTO o FROM orders WHERE id=parts[2]::uuid FOR UPDATE;
 IF NOT FOUND OR o.status='cancelled' THEN RAISE EXCEPTION 'Order is unavailable'; END IF;
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

CREATE FUNCTION public.pos_guard_orders() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.order_source='pos' AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.staff_id AND role IN ('staff','admin') AND is_approved) THEN RAISE EXCEPTION 'Approved staff access required'; END IF;
 IF TG_OP='UPDATE' AND auth.role()='authenticated' THEN
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('staff','admin') AND is_approved) THEN RAISE EXCEPTION 'Approved staff access required'; END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN RAISE EXCEPTION 'Use verified payment operations'; END IF;
  IF NEW.total IS DISTINCT FROM OLD.total OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.discount IS DISTINCT FROM OLD.discount OR NEW.points_redeemed IS DISTINCT FROM OLD.points_redeemed OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.order_source IS DISTINCT FROM OLD.order_source OR NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN RAISE EXCEPTION 'Accepted financial records cannot be edited'; END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes OR NEW.order_type IS DISTINCT FROM OLD.order_type OR (NEW.points_earned IS DISTINCT FROM OLD.points_earned AND pg_trigger_depth()=1) THEN RAISE EXCEPTION 'Accepted order snapshots cannot be edited'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND (SELECT role FROM profiles WHERE id=auth.uid())='staff' AND current_setting('jayds.pos_internal',true) IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Use checked cashier operations'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pos_guard_orders BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.pos_guard_orders();

-- Preserve manager PIN behavior while requiring the requesting cashier's approved identity.
DO $$ BEGIN
 IF to_regprocedure('public.void_order_with_pin(uuid,text,uuid)') IS NOT NULL THEN
  ALTER FUNCTION public.void_order_with_pin(uuid,text,uuid) RENAME TO pos_legacy_void_order_with_pin;
  REVOKE ALL ON FUNCTION public.pos_legacy_void_order_with_pin(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
 END IF;
END $$;
CREATE FUNCTION public.void_order_with_pin(p_order_id uuid,p_pin text,p_staff_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; o orders; previous text:=COALESCE(current_setting('jayds.pos_internal',true),''); previous_role text:=COALESCE(current_setting('request.jwt.claim.role',true),'');
BEGIN
 IF p_staff_id IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('staff','admin') AND is_approved) THEN RAISE EXCEPTION 'Approved cashier identity required'; END IF;
 SELECT * INTO o FROM orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF p_pin IS NULL OR p_pin !~ '^[0-9]{6}$' THEN RETURN jsonb_build_object('success',false,'error','Invalid Manager PIN'); END IF;
 IF o.status='cancelled' THEN RETURN jsonb_build_object('success',true,'message','This order was already voided'); END IF;
 IF o.status='completed' THEN RAISE EXCEPTION 'Completed orders require the refund workflow'; END IF;
 PERFORM set_config('jayds.pos_internal','1',true);
 -- Approved identity and the legacy manager PIN gate authorize only this operation.
 -- The trusted claim lets existing profile guards accept the atomic reward reversal.
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 result:=pos_legacy_void_order_with_pin(p_order_id,p_pin,p_staff_id);
 PERFORM set_config('request.jwt.claim.role',previous_role,true);
 PERFORM set_config('jayds.pos_internal',previous,true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('request.jwt.claim.role',previous_role,true);
 PERFORM set_config('jayds.pos_internal',previous,true);
 RAISE;
END $$;
REVOKE ALL ON FUNCTION public.void_order_with_pin(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.void_order_with_pin(uuid,text,uuid) TO authenticated;

CREATE FUNCTION public.pos_signal_orders() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE pos_order_state SET version=version+1,updated_at=now() WHERE id;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER pos_signal_orders AFTER INSERT OR UPDATE OF status OR DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.pos_signal_orders();
CREATE FUNCTION public.get_pos_status_board() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('branch_name',(SELECT branch_name FROM inventory_settings WHERE id),'version',(SELECT version FROM pos_order_state WHERE id),
 'orders',COALESCE((SELECT jsonb_agg(jsonb_build_object('order_number',o.order_number,'status',o.status) ORDER BY o.created_at) FROM orders o WHERE o.status IN ('preparing','ready') AND o.payment_status='paid' AND NOT o.is_parked),'[]'::jsonb))
$$;
CREATE FUNCTION public.get_guest_receipt(p_token text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('id',r.id,'receipt_token',r.receipt_token,'receipt_data',r.receipt_data,'created_at',r.created_at,'expires_at',r.expires_at) FROM guest_receipts r WHERE r.receipt_token=p_token AND r.expires_at>now() LIMIT 1
$$;
DROP POLICY IF EXISTS guest_receipts_public_read ON public.guest_receipts;
REVOKE INSERT,UPDATE,DELETE ON public.guest_receipts FROM anon,authenticated;
REVOKE UPDATE,DELETE ON public.pickup_tokens FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.pos_require_staff(uuid),public.pos_ensure_receipt(uuid),public.pos_checkout_result(uuid),public.pos_cash_checkout(uuid,text,text,numeric,numeric,jsonb,jsonb,uuid),public.pos_order_action(uuid,uuid,text,text),public.pos_pickup(uuid,text),public.pos_guard_orders(),public.pos_signal_orders() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pos_cash_checkout(uuid,text,text,numeric,numeric,jsonb,jsonb,uuid),public.pos_order_action(uuid,uuid,text,text),public.pos_pickup(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.get_pos_status_board(),public.get_guest_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pos_status_board(),public.get_guest_receipt(text) TO anon,authenticated,service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='pos_order_state') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_order_state; END IF;
END $$;
