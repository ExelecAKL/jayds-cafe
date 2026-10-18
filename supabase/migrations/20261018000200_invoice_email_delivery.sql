-- Future-only, opt-in transactional mail. No historical invoices are queued.
CREATE TABLE public.invoice_email_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 provider_ready boolean NOT NULL DEFAULT false, activated_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);
INSERT INTO public.invoice_email_settings(id) VALUES(true);
CREATE TABLE public.invoice_email_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL UNIQUE REFERENCES public.finance_invoices(id),
 customer_id uuid NOT NULL, recipient text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','suppressed','review')),
 attempts integer NOT NULL DEFAULT 0, lease_token uuid, lease_until timestamptz,
 first_attempt_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb, provider_message_id text, last_error text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 CHECK(length(recipient)<=254 AND recipient !~ E'[\r\n]' AND recipient ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
CREATE INDEX invoice_email_pending ON public.invoice_email_outbox(next_attempt_at,created_at) WHERE status IN('pending','sending');
ALTER TABLE public.invoice_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_email_settings,public.invoice_email_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.invoice_email_settings,public.invoice_email_outbox TO service_role;

CREATE FUNCTION public.invoice_email_status() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE settings invoice_email_settings;
BEGIN
 PERFORM finance_require_admin();
 SELECT * INTO settings FROM invoice_email_settings WHERE id;
 RETURN to_jsonb(settings)||jsonb_build_object(
  'pending',(SELECT count(*) FROM invoice_email_outbox WHERE status IN('pending','sending')),
  'sent',(SELECT count(*) FROM invoice_email_outbox WHERE status='sent'),
  'review',(SELECT count(*) FROM invoice_email_outbox WHERE status='review'));
END $$;
CREATE FUNCTION public.invoice_email_set_enabled(p_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE settings invoice_email_settings;
BEGIN
 PERFORM finance_require_admin();
 SELECT * INTO settings FROM invoice_email_settings WHERE id FOR UPDATE;
 IF p_enabled AND NOT settings.provider_ready THEN RAISE EXCEPTION 'Connect and verify an email sender first'; END IF;
 UPDATE invoice_email_settings SET enabled=p_enabled,
  activated_at=CASE WHEN p_enabled AND NOT enabled THEN now() ELSE activated_at END,
  updated_at=now(),updated_by=auth.uid() WHERE id;
END $$;
CREATE FUNCTION public.invoice_email_provider_ready(p_ready boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted deployment service required' USING ERRCODE='42501'; END IF;
 UPDATE invoice_email_settings SET provider_ready=p_ready,enabled=CASE WHEN p_ready THEN enabled ELSE false END,updated_at=now() WHERE id;
END $$;

CREATE FUNCTION public.invoice_email_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE settings invoice_email_settings; owner_id uuid; address text;
BEGIN
 SELECT * INTO settings FROM invoice_email_settings WHERE id;
 IF NOT settings.enabled OR NOT settings.provider_ready THEN RETURN NEW; END IF;
 SELECT o.customer_id,lower(trim(u.email)) INTO owner_id,address
 FROM orders o JOIN financial_events e ON e.id=NEW.event_id JOIN auth.users u ON u.id=o.customer_id
 WHERE o.id=NEW.order_id AND (to_jsonb(o)->>'synthetic_dataset_id') IS NULL
  AND e.created_at>=settings.activated_at AND NEW.issued_at>=settings.activated_at
  AND u.email_confirmed_at IS NOT NULL AND (to_jsonb(u)->>'deleted_at') IS NULL
  AND (u.banned_until IS NULL OR u.banned_until<now());
 IF owner_id IS NULL OR address IS NULL OR length(address)>254 OR address ~ E'[\r\n]'
  OR address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RETURN NEW; END IF;
 INSERT INTO invoice_email_outbox(invoice_id,customer_id,recipient) VALUES(NEW.id,owner_id,address) ON CONFLICT(invoice_id) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_email_after_issue AFTER INSERT ON public.finance_invoices FOR EACH ROW EXECUTE FUNCTION public.invoice_email_enqueue();

CREATE FUNCTION public.invoice_email_claim(p_limit integer DEFAULT 10) RETURNS SETOF public.invoice_email_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted worker required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM invoice_email_settings WHERE id AND enabled AND provider_ready) THEN RETURN; END IF;
 -- Resend retains idempotency keys for 24 hours. Ambiguous older sends need review,
 -- rather than risking a duplicate after provider deduplication has expired.
 UPDATE invoice_email_outbox SET status='review',lease_until=NULL,last_error='Delivery confirmation needs review'
 WHERE status IN('pending','sending') AND (lease_until IS NULL OR lease_until<now())
  AND (attempts>=6 OR first_attempt_at<now()-interval '20 hours');
 RETURN QUERY WITH picked AS (
  SELECT id FROM invoice_email_outbox WHERE
   (status='pending' AND next_attempt_at<=now() OR status='sending' AND lease_until<now())
   AND attempts<6 ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_limit,1),10)
 ) UPDATE invoice_email_outbox q SET status='sending',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 FROM picked WHERE q.id=picked.id RETURNING q.*;
END $$;
CREATE FUNCTION public.invoice_email_context(p_id uuid,p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted worker required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('invoice',to_jsonb(i),'recipient',q.recipient,'payload',q.payload)
  FROM invoice_email_outbox q JOIN finance_invoices i ON i.id=q.invoice_id JOIN orders o ON o.id=i.order_id
  JOIN auth.users u ON u.id=q.customer_id CROSS JOIN invoice_email_settings settings
  WHERE q.id=p_id AND q.lease_token=p_lease AND q.status='sending' AND q.lease_until>now()
   AND settings.enabled AND settings.provider_ready AND q.created_at>=settings.activated_at
   AND o.customer_id=q.customer_id AND (to_jsonb(o)->>'synthetic_dataset_id') IS NULL
   AND lower(trim(u.email))=q.recipient AND u.email_confirmed_at IS NOT NULL
   AND (to_jsonb(u)->>'deleted_at') IS NULL AND (u.banned_until IS NULL OR u.banned_until<now()));
END $$;
CREATE FUNCTION public.invoice_email_prepare(p_id uuid,p_lease uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted worker required' USING ERRCODE='42501'; END IF;
 IF invoice_email_context(p_id,p_lease) IS NULL THEN RETURN NULL; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR length(p_payload::text)>250000
  OR COALESCE(length(p_payload->>'html'),0)=0 OR COALESCE(length(p_payload->>'text'),0)=0
  OR COALESCE(length(p_payload->>'subject'),0)=0 THEN RAISE EXCEPTION 'Invalid email payload'; END IF;
 UPDATE invoice_email_outbox SET payload=COALESCE(payload,p_payload),first_attempt_at=COALESCE(first_attempt_at,now())
 WHERE id=p_id AND lease_token=p_lease AND status='sending' AND lease_until>now() RETURNING payload INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.invoice_email_finish(p_id uuid,p_lease uuid,p_outcome text,p_message_id text DEFAULT NULL,p_error text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE updated integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted worker required' USING ERRCODE='42501'; END IF;
 IF p_outcome NOT IN('sent','pending','review','suppressed') THEN RAISE EXCEPTION 'Invalid delivery outcome'; END IF;
 UPDATE invoice_email_outbox SET status=CASE WHEN p_outcome='pending' AND attempts>=6 THEN 'review' ELSE p_outcome END,
  sent_at=CASE WHEN p_outcome='sent' THEN now() ELSE sent_at END,
  provider_message_id=CASE WHEN p_outcome='sent' THEN left(p_message_id,200) ELSE provider_message_id END,
  last_error=CASE WHEN p_outcome='sent' THEN NULL ELSE left(p_error,200) END,lease_until=NULL,
  next_attempt_at=now()+make_interval(secs=>LEAST(3600,60*power(2,attempts)::integer))
 WHERE id=p_id AND lease_token=p_lease AND status='sending' AND lease_until>now();
 GET DIAGNOSTICS updated=ROW_COUNT; RETURN updated=1;
END $$;

-- Reuse the existing protected notification-worker token. No plaintext secret is
-- stored in the outbox, migration, cron command or customer-visible data.
CREATE FUNCTION public.invoice_email_run_worker() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE token text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM invoice_email_settings WHERE id AND enabled AND provider_ready)
  OR NOT EXISTS(SELECT 1 FROM invoice_email_outbox WHERE status IN('pending','sending') AND next_attempt_at<=now()) THEN RETURN; END IF;
 IF to_regclass('vault.decrypted_secrets') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='net' AND p.proname='http_post') THEN RETURN; END IF;
 EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=''jayds_customer_job_token'' LIMIT 1' INTO token;
 IF token IS NULL THEN RETURN; END IF;
 EXECUTE 'SELECT net.http_post(url:=''https://jaydscafe.vercel.app/api/jobs/invoice-emails'',headers:=$1,body:=''{}''::jsonb,timeout_milliseconds:=60000)'
 USING jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token);
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  PERFORM cron.schedule('jayds-invoice-email','* * * * *','SELECT public.invoice_email_run_worker()');
 END IF;
END $$;
CREATE FUNCTION public.invoice_email_worker_setup_status() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE active boolean:=false; configured boolean:=false;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted deployment service required' USING ERRCODE='42501'; END IF;
 IF to_regclass('cron.job') IS NOT NULL THEN
  EXECUTE 'SELECT coalesce(bool_or(active),false) FROM cron.job WHERE jobname=''jayds-invoice-email''' INTO active;
 END IF;
 IF to_regclass('vault.secrets') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM vault.secrets WHERE name=''jayds_customer_job_token'')' INTO configured;
 END IF;
 RETURN jsonb_build_object('cron_active',active,'credential_configured',configured);
END $$;
REVOKE ALL ON FUNCTION public.invoice_email_worker_setup_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_email_worker_setup_status() TO service_role;
REVOKE ALL ON FUNCTION public.invoice_email_status(),public.invoice_email_set_enabled(boolean),public.invoice_email_provider_ready(boolean),public.invoice_email_enqueue(),public.invoice_email_claim(integer),public.invoice_email_context(uuid,uuid),public.invoice_email_prepare(uuid,uuid,jsonb),public.invoice_email_finish(uuid,uuid,text,text,text),public.invoice_email_run_worker() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_email_status(),public.invoice_email_set_enabled(boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.invoice_email_provider_ready(boolean),public.invoice_email_claim(integer),public.invoice_email_context(uuid,uuid),public.invoice_email_prepare(uuid,uuid,jsonb),public.invoice_email_finish(uuid,uuid,text,text,text),public.invoice_email_run_worker() TO service_role;
