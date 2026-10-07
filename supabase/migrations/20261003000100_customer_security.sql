-- Additive customer access and provider attempts. Existing order/payment records remain canonical.
CREATE OR REPLACE FUNCTION public.customer_approved_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('staff','admin') AND is_approved);
$$;
CREATE OR REPLACE FUNCTION public.customer_approved_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin' AND is_approved);
$$;
REVOKE ALL ON FUNCTION public.customer_approved_staff(),public.customer_approved_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_approved_staff(),public.customer_approved_admin() TO authenticated,service_role;
DROP POLICY IF EXISTS "Staff and admin can view all profiles" ON public.profiles;
CREATE POLICY "Staff and admin can view all profiles" ON public.profiles FOR SELECT TO authenticated USING(public.customer_approved_staff());
DROP POLICY IF EXISTS "Admin can update any profile" ON public.profiles;
CREATE POLICY "Admin can update any profile" ON public.profiles FOR UPDATE TO authenticated USING(public.customer_approved_admin()) WITH CHECK(public.customer_approved_admin());
REVOKE INSERT,DELETE,UPDATE ON public.profiles FROM anon,authenticated;
-- Existing approved-admin screens use role/approval/points; the trigger independently protects those columns.
GRANT UPDATE(full_name,phone,avatar_url,updated_at,role,is_approved,points) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
CREATE OR REPLACE FUNCTION public.guard_profile_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role()='service_role' OR (session_user='postgres' AND auth.role() IS NULL) THEN RETURN NEW; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.account_qr_hash IS DISTINCT FROM OLD.account_qr_hash THEN
   RAISE EXCEPTION 'Immutable profile fields' USING ERRCODE='42501';
 END IF;
 IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
   IF NOT customer_approved_admin() THEN RAISE EXCEPTION 'Approved administrator required' USING ERRCODE='42501'; END IF;
 END IF;
 -- Only trusted triggers may award loyalty; direct client edits require an approved administrator.
 IF (to_jsonb(NEW)-ARRAY['full_name','phone','avatar_url','updated_at','role','is_approved']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['full_name','phone','avatar_url','updated_at','role','is_approved']) AND pg_trigger_depth()=1 AND NOT customer_approved_admin() THEN
   RAISE EXCEPTION 'Trusted loyalty operation required' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_profile_mutation ON public.profiles;
CREATE TRIGGER protect_profile_mutation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_mutation();
REVOKE ALL ON FUNCTION public.guard_profile_mutation() FROM PUBLIC,anon,authenticated;

-- LPAD truncates input exceeding the requested width; numbers must grow beyond 9999.
CREATE OR REPLACE FUNCTION public.generate_order_number() RETURNS text LANGUAGE plpgsql SET search_path=public AS $$
DECLARE number text;
BEGIN number:=nextval('public.order_number_seq')::text; RETURN 'ORD-'||lpad(number,GREATEST(4,length(number)),'0'); END $$;
DO $$ DECLARE highest bigint; current_number bigint; BEGIN
 SELECT max(substring(order_number FROM '^ORD-([0-9]+)$')::bigint) INTO highest FROM orders WHERE order_number ~ '^ORD-[0-9]{1,18}$';
 SELECT last_value INTO current_number FROM order_number_seq;
 IF highest>current_number THEN PERFORM setval('public.order_number_seq',highest,true); END IF;
END $$;

CREATE TABLE public.customer_guest_order_grants(
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
 device_hash text NOT NULL CHECK(device_hash ~ '^[a-f0-9]{64}$'),
 scopes text[] NOT NULL CHECK(scopes <@ ARRAY['read','manage','pay']::text[]),
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(order_id,device_hash)
);
ALTER TABLE public.customer_guest_order_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_guest_order_grants FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.customer_guest_order_grants TO service_role;
CREATE INDEX customer_guest_device_orders ON public.customer_guest_order_grants(device_hash,expires_at);

ALTER TABLE public.orders ADD COLUMN payment_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN payment_review_reason text;
CREATE TABLE public.customer_provider_attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.orders(id),
 provider text NOT NULL CHECK(provider IN ('maya','lalamove','lalamove_cancel')),
 state text NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','ready','uncertain','failed','paid','cancelled')),
 request_key text NOT NULL UNIQUE,actor_id uuid REFERENCES public.profiles(id),
 remote_id text,remote_url text,amount numeric(10,2) NOT NULL CHECK(amount>=0),request_payload jsonb NOT NULL DEFAULT '{}',
 failure_code text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customer_provider_one_active ON public.customer_provider_attempts(order_id,provider) WHERE state IN ('creating','ready','uncertain');
CREATE UNIQUE INDEX customer_provider_remote_unique ON public.customer_provider_attempts(provider,remote_id) WHERE remote_id IS NOT NULL;
ALTER TABLE public.customer_provider_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_provider_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.customer_provider_attempts TO service_role;
-- Preserve discoverability of previous sessions after the first new attempt.
INSERT INTO customer_provider_attempts(order_id,provider,state,request_key,remote_id,remote_url,amount)
 SELECT id,'maya',CASE WHEN payment_status='paid' THEN 'paid' ELSE 'ready' END,'legacy-maya-'||id,maya_checkout_id,maya_checkout_url,total
 FROM orders WHERE maya_checkout_id IS NOT NULL;
INSERT INTO customer_provider_attempts(order_id,provider,state,request_key,remote_id,remote_url,amount)
 SELECT id,'lalamove','ready','legacy-lalamove-'||id,lalamove_order_id,lalamove_share_link,COALESCE(delivery_fee,0)
 FROM orders WHERE lalamove_order_id IS NOT NULL;

CREATE FUNCTION public.customer_claim_provider_attempt(p_order uuid,p_provider text,p_actor uuid,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders; attempt customer_provider_attempts; claimed boolean:=false;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted server required' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF p_provider NOT IN ('maya','lalamove','lalamove_cancel') THEN RAISE EXCEPTION 'Invalid provider'; END IF;
 IF p_provider IN ('lalamove','lalamove_cancel') AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND role IN ('staff','admin') AND is_approved) AND p_provider='lalamove' THEN RAISE EXCEPTION 'Approved staff required'; END IF;
 SELECT * INTO attempt FROM customer_provider_attempts WHERE order_id=p_order AND provider=p_provider AND state IN ('creating','ready','uncertain') ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('claimed',false,'attempt',to_jsonb(attempt)); END IF;
 IF p_provider='lalamove_cancel' THEN
   SELECT * INTO attempt FROM customer_provider_attempts WHERE order_id=p_order AND provider=p_provider AND state='cancelled' ORDER BY created_at DESC LIMIT 1;
   IF FOUND THEN RETURN jsonb_build_object('claimed',false,'attempt',to_jsonb(attempt)); END IF;
 END IF;
 IF p_provider='maya' THEN
   IF o.payment_method<>'maya' OR o.payment_status IN ('paid','refunded') OR o.status NOT IN ('pending','confirmed') OR (o.expires_at IS NOT NULL AND o.expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'Order cannot start another payment'; END IF;
 ELSIF p_provider='lalamove' THEN
   IF o.order_type<>'delivery' OR o.payment_status<>'paid' OR o.status NOT IN ('preparing','ready') OR o.lalamove_order_id IS NOT NULL THEN RAISE EXCEPTION 'Order is not eligible for delivery dispatch'; END IF;
 ELSE
   IF o.order_type<>'delivery' OR o.lalamove_order_id IS NULL OR o.status NOT IN ('pending','confirmed') THEN RAISE EXCEPTION 'Order is not eligible for delivery cancellation'; END IF;
 END IF;
 INSERT INTO customer_provider_attempts(order_id,provider,request_key,actor_id,amount,request_payload)
 VALUES(p_order,p_provider,gen_random_uuid()::text,p_actor,CASE WHEN p_provider='maya' THEN o.total ELSE COALESCE(o.delivery_fee,0) END,p_payload) RETURNING * INTO attempt;
 RETURN jsonb_build_object('claimed',true,'attempt',to_jsonb(attempt));
END $$;

CREATE FUNCTION public.customer_finish_provider_attempt(p_attempt uuid,p_state text,p_remote text DEFAULT NULL,p_url text DEFAULT NULL,p_failure text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a customer_provider_attempts; o orders;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted server required' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM customer_provider_attempts WHERE id=p_attempt;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
 SELECT * INTO o FROM orders WHERE id=a.order_id FOR UPDATE;
 SELECT * INTO a FROM customer_provider_attempts WHERE id=p_attempt FOR UPDATE;
 IF p_state NOT IN ('ready','uncertain','failed','cancelled') OR (a.state NOT IN ('creating','uncertain') AND a.state<>p_state) THEN RAISE EXCEPTION 'Attempt transition rejected'; END IF;
 IF p_state='ready' AND (p_remote IS NULL OR length(p_remote)>128) THEN RAISE EXCEPTION 'Provider identity required'; END IF;
 IF a.remote_id IS NOT NULL AND p_remote IS DISTINCT FROM a.remote_id THEN RAISE EXCEPTION 'Provider identity cannot change'; END IF;
 UPDATE customer_provider_attempts SET state=p_state,remote_id=COALESCE(p_remote,remote_id),remote_url=COALESCE(p_url,remote_url),failure_code=left(p_failure,80),updated_at=now() WHERE id=a.id RETURNING * INTO a;
 IF p_state='ready' AND a.provider='maya' THEN
   UPDATE orders SET maya_checkout_id=a.remote_id,maya_checkout_url=a.remote_url WHERE id=o.id;
 ELSIF p_state='ready' AND a.provider='lalamove' THEN
   UPDATE orders SET lalamove_order_id=a.remote_id,lalamove_share_link=a.remote_url,lalamove_status='ASSIGNING_DRIVER',
     status=CASE WHEN status IN ('cancelled','completed') THEN status ELSE 'ready'::order_status END,
     payment_review_required=payment_review_required OR status IN ('cancelled','completed'),
     payment_review_reason=CASE WHEN status IN ('cancelled','completed') THEN 'Delivery booking completed after order closure; cancel provider booking manually' ELSE payment_review_reason END WHERE id=o.id;
 END IF;
 RETURN to_jsonb(a);
END $$;

CREATE FUNCTION public.customer_finalize_maya_payment(p_checkout text,p_payment text,p_amount numeric,p_currency text,p_state text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a customer_provider_attempts; o orders; associated uuid; late boolean; duplicate_paid boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted server required' USING ERRCODE='42501'; END IF;
 IF p_state NOT IN ('pending','paid','failed') OR p_currency IS DISTINCT FROM 'PHP' OR p_amount IS NULL THEN RAISE EXCEPTION 'Invalid verified payment'; END IF;
 SELECT * INTO a FROM customer_provider_attempts WHERE provider='maya' AND remote_id=p_checkout;
 associated:=a.order_id;
 IF associated IS NULL THEN SELECT id INTO associated FROM orders WHERE maya_checkout_id=p_checkout; END IF;
 SELECT * INTO o FROM orders WHERE id=associated FOR UPDATE;
 IF NOT FOUND OR o.payment_method<>'maya' OR round(o.total*100)<>round(p_amount*100) THEN RAISE EXCEPTION 'Payment does not match order'; END IF;
 IF to_regprocedure('public.scheduled_order_expire(uuid)') IS NOT NULL THEN EXECUTE 'SELECT public.scheduled_order_expire($1)' USING o.id; SELECT * INTO o FROM orders WHERE id=o.id; END IF;
 IF a.id IS NOT NULL THEN
   SELECT * INTO a FROM customer_provider_attempts WHERE id=a.id FOR UPDATE;
   IF a.state<>'paid' THEN UPDATE customer_provider_attempts SET state=CASE WHEN p_state='paid' THEN 'paid' WHEN p_state='failed' THEN 'failed' ELSE state END,updated_at=now() WHERE id=a.id; END IF;
 END IF;
 duplicate_paid:=p_state='paid' AND o.payment_status IN ('paid','refunded') AND o.maya_payment_id IS NOT NULL AND o.maya_payment_id<>p_payment
   AND NOT (a.state='paid' AND (o.maya_checkout_id=p_checkout OR o.maya_payment_id=p_checkout));
 IF o.payment_status IN ('paid','refunded') THEN
   IF duplicate_paid THEN UPDATE orders SET payment_review_required=true,payment_review_reason='Additional settled Maya payment requires manual reconciliation' WHERE id=o.id; END IF;
   RETURN jsonb_build_object('success',true,'orderId',o.id,'status',o.payment_status,'reviewRequired',o.payment_review_required OR duplicate_paid);
 END IF;
 late:=o.status IN ('cancelled','completed') OR (o.expires_at IS NOT NULL AND o.expires_at<=clock_timestamp());
 IF p_state='paid' THEN
   UPDATE orders SET payment_status='paid',maya_payment_id=p_payment,
     status=CASE WHEN late AND status IN ('pending','confirmed') THEN 'cancelled'::order_status WHEN NOT late AND status='pending' THEN 'confirmed'::order_status ELSE status END,
     payment_review_required=late,payment_review_reason=CASE WHEN late THEN 'Payment settled after cancellation or payment deadline; manual refund required' ELSE NULL END
   WHERE id=o.id;
 ELSIF p_state='failed' AND (o.maya_checkout_id=p_checkout OR o.maya_checkout_id IS NULL) THEN
   UPDATE orders SET payment_status='failed' WHERE id=o.id;
 ELSIF p_state='pending' AND o.payment_status<>'failed' THEN
   UPDATE orders SET payment_status='pending' WHERE id=o.id;
 END IF;
 SELECT * INTO o FROM orders WHERE id=o.id;
 RETURN jsonb_build_object('success',true,'orderId',o.id,'status',o.payment_status,'reviewRequired',o.payment_review_required);
END $$;

CREATE FUNCTION public.customer_sync_delivery(p_order uuid,p_remote text,p_status text,p_url text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders; target order_status;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted server required' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.order_type<>'delivery' OR o.lalamove_order_id IS DISTINCT FROM p_remote THEN RAISE EXCEPTION 'Delivery association does not match'; END IF;
 IF p_status NOT IN ('ASSIGNING_DRIVER','ON_GOING','PICKED_UP','COMPLETED','CANCELED','REJECTED','EXPIRED') THEN RAISE EXCEPTION 'Unknown delivery status'; END IF;
 target:=o.status;
 IF o.status NOT IN ('cancelled','completed') AND o.payment_status='paid' THEN
   IF p_status='COMPLETED' THEN target:='completed';
   ELSIF p_status IN ('CANCELED','REJECTED','EXPIRED') THEN target:='cancelled';
   ELSIF p_status IN ('ON_GOING','PICKED_UP') AND o.status IN ('confirmed','preparing','ready') THEN target:='ready'; END IF;
 END IF;
 -- Do not regress terminal delivery facts on a delayed poll.
 IF o.lalamove_status IN ('COMPLETED','CANCELED','REJECTED','EXPIRED') AND o.lalamove_status<>p_status THEN RETURN jsonb_build_object('status',o.lalamove_status); END IF;
 UPDATE orders SET lalamove_status=p_status,lalamove_share_link=COALESCE(p_url,lalamove_share_link),status=target,
   payment_review_required=payment_review_required OR (target='cancelled' AND payment_status='paid'),
   payment_review_reason=CASE WHEN target='cancelled' AND payment_status='paid' THEN 'Delivery cancelled; manual refund review required' ELSE payment_review_reason END WHERE id=o.id;
 RETURN jsonb_build_object('status',p_status,'orderStatus',target);
END $$;

CREATE FUNCTION public.customer_cancel_order(p_order uuid,p_expected text,p_payment text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted server required' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.status::text<>p_expected OR o.payment_status::text<>p_payment THEN RAISE EXCEPTION 'Order changed; refresh before cancelling'; END IF;
 IF o.status NOT IN ('pending','confirmed') THEN RAISE EXCEPTION 'Order can no longer be cancelled'; END IF;
 -- Provider creation uncertainty must be reconciled before cancellation can detach its result.
 IF EXISTS(SELECT 1 FROM customer_provider_attempts WHERE order_id=o.id AND provider='lalamove' AND state IN ('creating','uncertain')) THEN RAISE EXCEPTION 'Delivery dispatch needs reconciliation before cancellation'; END IF;
 UPDATE orders SET status='cancelled',payment_review_required=payment_review_required OR payment_status='paid',
   payment_review_reason=CASE WHEN payment_status='paid' THEN 'Customer cancelled; manual refund required' ELSE payment_review_reason END WHERE id=o.id;
 RETURN jsonb_build_object('success',true,'refundRequired',o.payment_status='paid');
END $$;

REVOKE ALL ON FUNCTION public.customer_claim_provider_attempt(uuid,text,uuid,jsonb),public.customer_finish_provider_attempt(uuid,text,text,text,text),public.customer_finalize_maya_payment(text,text,numeric,text,text),public.customer_sync_delivery(uuid,text,text,text),public.customer_cancel_order(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_claim_provider_attempt(uuid,text,uuid,jsonb),public.customer_finish_provider_attempt(uuid,text,text,text,text),public.customer_finalize_maya_payment(text,text,numeric,text,text),public.customer_sync_delivery(uuid,text,text,text),public.customer_cancel_order(uuid,text,text) TO service_role;
