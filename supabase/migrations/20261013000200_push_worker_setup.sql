-- Worker credentials stay in Vault; only the trusted deployment service can set them.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='supabase_vault') THEN
  CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_net') THEN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
 END IF;
END $$;
CREATE TABLE public.customer_push_worker_runs(
 request_id bigint PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_push_worker_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_push_worker_runs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.customer_push_worker_runs TO service_role;

CREATE FUNCTION public.customer_configure_push_worker(p_url text,p_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE secret_id uuid; secret_name text; secret_value text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted deployment service required' USING ERRCODE='42501'; END IF;
 IF p_url IS DISTINCT FROM 'https://jaydscafe.vercel.app/api/jobs/customer-notifications'
   OR p_token IS NULL OR length(p_token)<32 OR length(p_token)>256 THEN RAISE EXCEPTION 'Invalid worker configuration'; END IF;
 IF to_regclass('vault.secrets') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='net' AND p.proname='http_post') THEN RAISE EXCEPTION 'Vault and pg_net are required'; END IF;
 PERFORM pg_advisory_xact_lock(8712348);
 FOR secret_name,secret_value IN SELECT * FROM (VALUES('jayds_customer_job_url',p_url),('jayds_customer_job_token',p_token)) AS configuration(name,value) LOOP
  EXECUTE 'SELECT id FROM vault.secrets WHERE name=$1 LIMIT 1' INTO secret_id USING secret_name;
  IF secret_id IS NULL THEN
   EXECUTE 'SELECT vault.create_secret($1,$2,$3)' USING secret_value,secret_name,'Jayds protected notification worker';
  ELSE
   EXECUTE 'SELECT vault.update_secret($1,$2,$3,$4)' USING secret_id,secret_value,secret_name,'Jayds protected notification worker';
  END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.customer_run_push_worker() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE endpoint text; token text; request_id bigint;
BEGIN
 IF to_regclass('vault.decrypted_secrets') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='net' AND p.proname='http_post') THEN RETURN; END IF;
 EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=''jayds_customer_job_url'' LIMIT 1' INTO endpoint;
 EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=''jayds_customer_job_token'' LIMIT 1' INTO token;
 IF endpoint IS DISTINCT FROM 'https://jaydscafe.vercel.app/api/jobs/customer-notifications' OR token IS NULL THEN RETURN; END IF;
 EXECUTE 'SELECT net.http_post(url:=$1,headers:=$2,body:=''{}''::jsonb,timeout_milliseconds:=60000)'
 INTO request_id USING endpoint,jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token);
 INSERT INTO customer_push_worker_runs(request_id) VALUES(request_id);
 DELETE FROM customer_push_worker_runs WHERE started_at<now()-interval '7 days';
END $$;
CREATE FUNCTION public.customer_push_setup_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE configured boolean:=false; active boolean:=false; last_cron text; run customer_push_worker_runs; http_status integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted deployment service required' USING ERRCODE='42501'; END IF;
 IF to_regclass('vault.secrets') IS NOT NULL THEN
  EXECUTE 'SELECT count(*)=2 FROM vault.secrets WHERE name IN(''jayds_customer_job_url'',''jayds_customer_job_token'')' INTO configured;
 END IF;
 IF to_regclass('cron.job') IS NOT NULL THEN
  EXECUTE 'SELECT coalesce(bool_or(active),false) FROM cron.job WHERE jobname=''jayds-customer-push''' INTO active;
 END IF;
 IF to_regclass('cron.job_run_details') IS NOT NULL THEN
  EXECUTE 'SELECT r.status FROM cron.job_run_details r JOIN cron.job j USING(jobid) WHERE j.jobname=''jayds-customer-push'' ORDER BY r.start_time DESC LIMIT 1' INTO last_cron;
 END IF;
 SELECT * INTO run FROM customer_push_worker_runs ORDER BY started_at DESC LIMIT 1;
 IF run.request_id IS NOT NULL AND to_regclass('net._http_response') IS NOT NULL THEN
  EXECUTE 'SELECT status_code FROM net._http_response WHERE id=$1' INTO http_status USING run.request_id;
 END IF;
 RETURN jsonb_build_object('vault_configured',configured,'cron_active',active,'last_cron_status',last_cron,'last_request_at',run.started_at,'last_http_status',http_status);
END $$;
REVOKE ALL ON FUNCTION public.customer_configure_push_worker(text,text),public.customer_push_setup_status(),public.customer_run_push_worker() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_configure_push_worker(text,text),public.customer_push_setup_status(),public.customer_run_push_worker() TO service_role;
COMMIT;
