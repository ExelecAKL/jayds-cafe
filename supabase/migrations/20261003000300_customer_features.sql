-- Additive customer features. Existing orders and acknowledgements are never backfilled.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS legal_version text;
CREATE TABLE public.customer_favorites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 menu_item_id uuid NOT NULL REFERENCES public.menu_items(id), configuration jsonb NOT NULL DEFAULT '[]', configuration_key text NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,menu_item_id,configuration_key)
);
CREATE TABLE public.legal_acknowledgements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 version text NOT NULL CHECK(version='2026-10-03'), source text NOT NULL,
 acknowledged_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,version)
);
CREATE TRIGGER legal_ack_immutable BEFORE UPDATE OR DELETE ON public.legal_acknowledgements FOR EACH ROW EXECUTE FUNCTION public.inv_immutable();
CREATE FUNCTION public.customer_signup_legal_ack() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.raw_user_meta_data->>'jayds_legal_version'='2026-10-03' AND EXISTS(SELECT 1 FROM profiles WHERE id=NEW.id) THEN
   INSERT INTO legal_acknowledgements(user_id,version,source) VALUES(NEW.id,'2026-10-03','signup') ON CONFLICT DO NOTHING;
 END IF; RETURN NEW;
END $$;
-- Runs after the existing profile provisioning trigger; checkout review covers other signup paths.
CREATE TRIGGER zz_customer_signup_legal AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.customer_signup_legal_ack();
CREATE TABLE public.customer_support_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES public.profiles(id), guest_hash text,
 order_id uuid REFERENCES public.orders(id), kind text NOT NULL CHECK(kind IN('order','privacy','refund','account')),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 150), message text NOT NULL CHECK(length(message) BETWEEN 1 AND 4000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','in_review','resolved')), response text,
 assigned_to uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(user_id IS NOT NULL OR (guest_hash IS NOT NULL AND order_id IS NOT NULL))
);
CREATE TABLE public.customer_push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES public.profiles(id), guest_hash text, order_id uuid REFERENCES public.orders(id),
 endpoint_hash text NOT NULL UNIQUE, endpoint text NOT NULL, p256dh text NOT NULL, auth_key text NOT NULL,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((user_id IS NOT NULL AND guest_hash IS NULL AND order_id IS NULL) OR
   (user_id IS NULL AND guest_hash IS NOT NULL AND guest_hash ~ '^[a-f0-9]{64}$' AND order_id IS NOT NULL))
);
CREATE TABLE public.customer_push_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL REFERENCES public.customer_push_subscriptions(id),
 order_id uuid NOT NULL REFERENCES public.orders(id), event_key text NOT NULL, title text NOT NULL, body text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','failed','suppressed')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, UNIQUE(subscription_id,event_key)
);
CREATE INDEX customer_push_due ON public.customer_push_outbox(next_attempt_at) WHERE status IN('pending','sending');
CREATE FUNCTION public.customer_push_subscription_authorized(p_subscription uuid,p_order uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM customer_push_subscriptions s JOIN orders o ON o.id=p_order WHERE s.id=p_subscription AND s.active AND
   ((s.user_id IS NOT NULL AND s.user_id=o.customer_id) OR
    (s.user_id IS NULL AND o.customer_id IS NULL AND s.order_id=o.id AND EXISTS(
      SELECT 1 FROM customer_guest_order_grants g WHERE g.order_id=o.id AND g.device_hash=s.guest_hash
        AND g.expires_at>now() AND g.scopes @> ARRAY['read','manage']::text[]))));
$$;
CREATE FUNCTION public.customer_guard_push_subscription() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.user_id IS NULL AND NEW.active AND NOT EXISTS(SELECT 1 FROM orders o JOIN customer_guest_order_grants g ON g.order_id=o.id
   WHERE o.id=NEW.order_id AND o.customer_id IS NULL AND g.device_hash=NEW.guest_hash AND g.expires_at>now() AND g.scopes @> ARRAY['read','manage']::text[]) THEN
   RAISE EXCEPTION 'Active guest subscription requires its scoped order grant' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (NOT NEW.active OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.guest_hash IS DISTINCT FROM OLD.guest_hash OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.endpoint IS DISTINCT FROM OLD.endpoint) THEN
   UPDATE customer_push_outbox SET status='suppressed',lease_until=NULL,last_error='Subscription access changed'
     WHERE subscription_id=OLD.id AND status IN('pending','sending');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_push_subscription_guard BEFORE INSERT OR UPDATE ON public.customer_push_subscriptions FOR EACH ROW EXECUTE FUNCTION public.customer_guard_push_subscription();
CREATE FUNCTION public.customer_order_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; t text; b text;
BEGIN
 IF NEW.payment_status::text<>'paid' THEN RETURN NEW; END IF;
 IF NEW.status::text='ready' AND OLD.status IS DISTINCT FROM NEW.status THEN
   k:=NEW.id||':ready'; t:='Your Jayds order is ready'; b:='Open your order for pickup or delivery details.';
 ELSIF NEW.lalamove_status IS DISTINCT FROM OLD.lalamove_status AND NEW.lalamove_status IN('ON_GOING','PICKED_UP','COMPLETED','CANCELED','REJECTED','EXPIRED') THEN
   k:=NEW.id||':delivery:'||NEW.lalamove_status; t:='Jayds delivery update'; b:='Open your order for the latest courier status.';
 ELSE RETURN NEW; END IF;
 INSERT INTO customer_push_outbox(subscription_id,order_id,event_key,title,body)
 SELECT id,NEW.id,k,t,b FROM customer_push_subscriptions s WHERE customer_push_subscription_authorized(s.id,NEW.id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_order_push AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.customer_order_alert();
CREATE FUNCTION public.customer_claim_push(p_limit integer DEFAULT 25) RETURNS SETOF public.customer_push_outbox
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server worker required'; END IF;
 -- Crashed final attempts must become terminal instead of remaining leased forever.
 UPDATE customer_push_outbox SET status='failed',lease_until=NULL,last_error='Push retry limit reached'
   WHERE attempts>=8 AND (status='pending' OR (status='sending' AND COALESCE(lease_until,'-infinity'::timestamptz)<now()));
 UPDATE customer_push_outbox o SET status='suppressed',lease_until=NULL,last_error='Subscription access expired or changed'
   WHERE status IN('pending','sending') AND NOT customer_push_subscription_authorized(o.subscription_id,o.order_id);
 RETURN QUERY WITH due AS (SELECT id FROM customer_push_outbox WHERE
  (status='pending' OR (status='sending' AND COALESCE(lease_until,'-infinity'::timestamptz)<now())) AND next_attempt_at<=now() AND attempts<8
  ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,50)))
 UPDATE customer_push_outbox o SET status='sending',attempts=o.attempts+1,lease_until=now()+interval '2 minutes'
 FROM due WHERE o.id=due.id RETURNING o.*;
END $$;
-- The worker rechecks this immediately before sending: endpoint reassignment must not
-- disclose an older owner's queued order, even when that row was already claimed.
CREATE FUNCTION public.customer_push_delivery_context(p_outbox uuid,p_expected_attempt integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job customer_push_outbox; subscription customer_push_subscriptions; o orders;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server worker required' USING ERRCODE='42501'; END IF;
 SELECT * INTO job FROM customer_push_outbox WHERE id=p_outbox FOR UPDATE;
 IF NOT FOUND OR job.status<>'sending' OR p_expected_attempt IS NULL OR job.attempts<>p_expected_attempt OR job.lease_until IS NULL OR job.lease_until<=now() THEN RETURN NULL; END IF;
 SELECT * INTO subscription FROM customer_push_subscriptions WHERE id=job.subscription_id;
 SELECT * INTO o FROM orders WHERE id=job.order_id;
 IF NOT customer_push_subscription_authorized(job.subscription_id,job.order_id) OR o.payment_status::text<>'paid' OR
   (o.status::text='cancelled' AND NOT (o.lalamove_status IN('CANCELED','REJECTED','EXPIRED') AND job.event_key=job.order_id||':delivery:'||o.lalamove_status)) OR
   (job.event_key=job.order_id||':ready' AND o.status::text<>'ready') OR
   (position(':delivery:' in job.event_key)>0 AND split_part(job.event_key,':delivery:',2) IS DISTINCT FROM o.lalamove_status) THEN
   UPDATE customer_push_outbox SET status='suppressed',lease_until=NULL,last_error='Notification no longer authorized or current' WHERE id=job.id;
   RETURN NULL;
 END IF;
 RETURN jsonb_build_object('subscription',jsonb_build_object('id',subscription.id,'active',subscription.active,'endpoint',subscription.endpoint,'p256dh',subscription.p256dh,'auth_key',subscription.auth_key),
   'order',jsonb_build_object('status',o.status,'payment_status',o.payment_status,'lalamove_status',o.lalamove_status));
END $$;
CREATE FUNCTION public.customer_support_update(p_id uuid,p_status text,p_response text DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c customer_support_cases; who profiles;
BEGIN
 SELECT * INTO who FROM profiles WHERE id=auth.uid();
 IF who.role::text NOT IN('staff','admin') OR who.is_approved IS NOT TRUE THEN RAISE EXCEPTION 'Approved staff required'; END IF;
 SELECT * INTO c FROM customer_support_cases WHERE id=p_id FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Case not found'; END IF;
 IF c.kind IN('privacy','refund') AND who.role::text<>'admin' THEN RAISE EXCEPTION 'Admin review required'; END IF;
 IF p_status NOT IN('open','in_review','resolved') OR length(coalesce(p_response,''))>4000 THEN RAISE EXCEPTION 'Invalid case response'; END IF;
 UPDATE customer_support_cases SET status=p_status,response=nullif(trim(p_response),''),assigned_to=who.id,updated_at=now() WHERE id=p_id;
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,after_data,reason) VALUES(who.id,'support_review','customer_support',p_id,jsonb_build_object('status',p_status,'kind',c.kind),'Customer support review');
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['customer_favorites','legal_acknowledgements','customer_support_cases','customer_push_subscriptions','customer_push_outbox'] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
   EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
 END LOOP;
END $$;
GRANT SELECT ON customer_favorites,legal_acknowledgements TO authenticated;
CREATE POLICY customer_favorites_owner ON customer_favorites FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY customer_legal_owner ON legal_acknowledgements FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON customer_support_cases TO authenticated;
CREATE POLICY customer_support_read ON customer_support_cases FOR SELECT TO authenticated USING(
 user_id=auth.uid() OR EXISTS(SELECT 1 FROM profiles p WHERE p.id=auth.uid() AND p.is_approved AND (p.role::text='admin' OR (p.role::text='staff' AND kind NOT IN('privacy','refund'))))
);
GRANT SELECT ON customer_push_outbox TO authenticated;
CREATE POLICY customer_push_admin ON customer_push_outbox FOR SELECT TO authenticated USING(public.inv_admin());
REVOKE ALL ON FUNCTION customer_claim_push(integer),customer_push_delivery_context(uuid,integer),customer_guard_push_subscription(),customer_push_subscription_authorized(uuid,uuid),customer_signup_legal_ack(),customer_order_alert(),customer_support_update(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION customer_claim_push(integer),customer_push_delivery_context(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION customer_support_update(uuid,text,text) TO authenticated;
-- Secrets are configured separately in Supabase Vault; never store worker tokens in public settings.
CREATE FUNCTION public.customer_run_push_worker() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE endpoint text; token text;
BEGIN
 IF to_regclass('vault.decrypted_secrets') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='net' AND p.proname='http_post') THEN RETURN; END IF;
 EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=''jayds_customer_job_url'' LIMIT 1' INTO endpoint;
 EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=''jayds_customer_job_token'' LIMIT 1' INTO token;
 IF endpoint IS NULL OR token IS NULL OR endpoint NOT LIKE 'https://%' THEN RETURN; END IF;
 EXECUTE 'SELECT net.http_post(url:=$1,headers:=$2,body:=''{}''::jsonb)' USING endpoint,jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token);
END $$;
REVOKE ALL ON FUNCTION customer_run_push_worker() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN PERFORM cron.schedule('jayds-customer-push','* * * * *','SELECT public.customer_run_push_worker()'); END IF; END $$;
