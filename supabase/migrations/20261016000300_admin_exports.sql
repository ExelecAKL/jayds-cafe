-- Frozen, expiring business-record exports. No authentication schema or file bytes.
CREATE TABLE public.admin_export_jobs(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES profiles(id),created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',manifest jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE public.admin_export_rows(
 job_id uuid NOT NULL REFERENCES admin_export_jobs(id) ON DELETE CASCADE,table_name text NOT NULL,
 position bigint NOT NULL,data jsonb NOT NULL,PRIMARY KEY(job_id,table_name,position)
);
ALTER TABLE public.admin_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_export_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_export_jobs,public.admin_export_rows FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.admin_export_sensitive(p_key text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT lower(regexp_replace(p_key,'([a-z])([A-Z])','\1_\2','g')) ~ '(^|_)(password|passwd|pin|token|secret|credential|authorization|cookie|signature|p256dh|auth|endpoint|session|salt|fingerprint|hash|qr|vapid)(_|$)'
 OR lower(p_key) IN('apikey','api_key','access_key','service_role_key','redirecturl','redirect_url','checkouturl','checkout_url','paymenturl','payment_url','signedurl','signed_url');
$$;
CREATE FUNCTION public.admin_export_sanitize(p_value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE output jsonb;
BEGIN
 IF jsonb_typeof(p_value)='object' THEN
  SELECT coalesce(jsonb_object_agg(key,admin_export_sanitize(value)),'{}') INTO output FROM jsonb_each(p_value) WHERE NOT admin_export_sensitive(key);
 ELSIF jsonb_typeof(p_value)='array' THEN
  SELECT coalesce(jsonb_agg(admin_export_sanitize(value) ORDER BY ordinality),'[]') INTO output FROM jsonb_array_elements(p_value) WITH ORDINALITY;
 ELSIF jsonb_typeof(p_value)='string' AND (p_value#>>'{}') ~* 'https?://[^ ]*[?&](token|signature|x-amz-signature|apikey|access_token|code)=' THEN output:='"[private link excluded]"';
 ELSE output:=p_value; END IF;
 RETURN output;
END $$;
CREATE FUNCTION public.admin_export_tables() RETURNS TABLE(table_name text,section text,excluded_fields jsonb,columns jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.relname::text,
 CASE WHEN c.relname ~ '^(menu_|item_variants$|variant_ingredients$|ingredients$|categories$|stock_|inventory_|forecast_|catalog_state$)' OR c.relname='stocktakes' THEN 'Food & stock'
 WHEN c.relname ~ '^(orders$|order_|pos_|financial_|finance_|guest_receipts$)' THEN 'Orders & sales'
 WHEN c.relname ~ '^(suppliers$|purchase_|goods_receipts$)' THEN 'Purchasing'
 WHEN c.relname ~ '^(profiles$|customer_support_|customer_favorites$|legal_|loyalty_|voucher|shifts$|clock_entries$|saved_addresses$|notifications$)' THEN 'People & support'
 ELSE 'Settings & activity' END,
 coalesce((SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND admin_export_sensitive(a.attname)),'[]'),
 coalesce((SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND NOT admin_export_sensitive(a.attname)),'[]')
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN('r','p') AND c.relname !~ '^admin_export_'
 AND c.relname NOT IN('customer_guest_order_grants','pickup_tokens','void_tokens','store_settings','customer_push_subscriptions','spatial_ref_sys');
$$;
CREATE FUNCTION public.admin_export_catalog() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; count_rows bigint; output jsonb:='[]';
BEGIN
 PERFORM finance_require_admin();
 FOR t IN SELECT * FROM admin_export_tables() ORDER BY section,table_name LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',t.table_name) INTO count_rows;
  output:=output||jsonb_build_array(to_jsonb(t)||jsonb_build_object('count',count_rows));
 END LOOP;
 RETURN jsonb_build_object('tables',output,'exclusions',jsonb_build_array('Authentication users, passwords and sessions','Credential-only tables, tokens, PINs and push subscriptions','Private storage files and credential fields, including nested audit payloads','Internal export jobs'),'snapshot_minutes',60);
END $$;
CREATE FUNCTION public.admin_export_create(p_id uuid,p_tables text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE export_table record; parts text[]:='{}'; counts jsonb; total bigint; result jsonb;
BEGIN
 PERFORM finance_require_admin();
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'A signed-in Admin is required'; END IF;
 IF p_id IS NULL OR coalesce(cardinality(p_tables),0)=0 THEN RAISE EXCEPTION 'Choose at least one section or table'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_tables) name WHERE name IS NULL OR NOT EXISTS(SELECT 1 FROM admin_export_tables() t WHERE t.table_name=name)) THEN RAISE EXCEPTION 'An export table is unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 DELETE FROM admin_export_jobs WHERE expires_at<=now();
 SELECT manifest INTO result FROM admin_export_jobs WHERE id=p_id AND owner_id=auth.uid();
 IF FOUND THEN RETURN result; END IF;
 IF EXISTS(SELECT 1 FROM admin_export_jobs WHERE id=p_id) THEN RAISE EXCEPTION 'This export is unavailable'; END IF;
 INSERT INTO admin_export_jobs(id,owner_id) VALUES(p_id,auth.uid());
 FOR export_table IN SELECT * FROM admin_export_tables() WHERE table_name=ANY(p_tables) ORDER BY table_name LOOP
  parts:=array_append(parts,format('SELECT $1::uuid,%L::text,row_number() OVER (),public.admin_export_sanitize(to_jsonb(t)) FROM public.%I t',export_table.table_name,export_table.table_name));
 END LOOP;
 -- One statement takes one MVCC snapshot across every selected source table.
 EXECUTE 'INSERT INTO public.admin_export_rows(job_id,table_name,position,data) '||array_to_string(parts,' UNION ALL ') USING p_id;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.table_name),'[]'),coalesce(sum(x.count),0) INTO counts,total FROM (
  SELECT t.table_name,t.section,t.excluded_fields,t.columns,count(r.position) count FROM admin_export_tables() t
  LEFT JOIN admin_export_rows r ON r.job_id=p_id AND r.table_name=t.table_name
  WHERE t.table_name=ANY(p_tables) GROUP BY t.table_name,t.section,t.excluded_fields,t.columns) x;
 result:=jsonb_build_object('version',1,'job_id',p_id,'created_at',now(),'expires_at',now()+interval '1 hour','timezone','Asia/Manila','total_rows',total,'tables',counts,
 'exclusions',(admin_export_catalog()->'exclusions'),'nested_credential_fields_redacted',true);
 UPDATE admin_export_jobs SET manifest=result WHERE id=p_id;
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason) VALUES(auth.uid(),'export_data','admin_exports',p_id,total||' business records prepared for download');
 RETURN result;
END $$;
CREATE FUNCTION public.admin_export_page(p_id uuid,p_table text,p_after bigint DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM finance_require_admin();
 IF NOT EXISTS(SELECT 1 FROM admin_export_jobs WHERE id=p_id AND owner_id=auth.uid() AND expires_at>now()) THEN RAISE EXCEPTION 'This export expired or is unavailable. Start a new download.'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.position),'[]') INTO result FROM (
  SELECT position,data FROM admin_export_rows WHERE job_id=p_id AND table_name=p_table AND position>greatest(p_after,0) ORDER BY position LIMIT 500) x;
 RETURN result;
END $$;
CREATE FUNCTION public.admin_export_close(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM finance_require_admin(); DELETE FROM admin_export_jobs WHERE id=p_id AND owner_id=auth.uid(); END $$;
REVOKE ALL ON FUNCTION public.admin_export_tables(),public.admin_export_sensitive(text),public.admin_export_sanitize(jsonb),public.admin_export_catalog(),public.admin_export_create(uuid,text[]),public.admin_export_page(uuid,text,bigint),public.admin_export_close(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_export_catalog(),public.admin_export_create(uuid,text[]),public.admin_export_page(uuid,text,bigint),public.admin_export_close(uuid) TO authenticated,service_role;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN PERFORM cron.schedule('jayds-export-cleanup','15 * * * *',$job$DELETE FROM public.admin_export_jobs WHERE expires_at<=now();$job$); END IF; END $$;
