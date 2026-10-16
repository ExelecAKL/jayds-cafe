-- Explicit internal provenance for the operator-authorized sample history.
-- Upload staging is private and never appears in business exports.
CREATE TABLE public.cafe_history_runs (
 id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'staging' CHECK(status IN('staging','applied','reverted')),
 manifest jsonb NOT NULL, baseline jsonb NOT NULL DEFAULT '{}', applied_checks jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz
);
CREATE TABLE public.cafe_history_parts (
 run_id uuid NOT NULL REFERENCES cafe_history_runs(id), table_name text NOT NULL, part integer NOT NULL,
 payload jsonb, row_keys jsonb, payload_hash text NOT NULL, PRIMARY KEY(run_id,table_name,part)
);
CREATE TABLE public.cafe_history_before (
 run_id uuid NOT NULL REFERENCES cafe_history_runs(id), table_name text NOT NULL, row_key jsonb NOT NULL,
 before_record jsonb NOT NULL, after_record jsonb, PRIMARY KEY(run_id,table_name,row_key)
);
ALTER TABLE public.cafe_history_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_history_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_history_before ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cafe_history_runs,public.cafe_history_parts,public.cafe_history_before FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.cafe_history_runs,public.cafe_history_parts,public.cafe_history_before TO service_role;
ALTER TABLE public.orders ADD COLUMN synthetic_dataset_id uuid REFERENCES cafe_history_runs(id);
ALTER TABLE public.stocktakes ADD COLUMN synthetic_dataset_id uuid REFERENCES cafe_history_runs(id);
CREATE INDEX history_orders ON public.orders(synthetic_dataset_id) WHERE synthetic_dataset_id IS NOT NULL;
CREATE FUNCTION public.cafe_history_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.synthetic_dataset_id IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted history import required'; END IF;
 IF TG_OP='UPDATE' AND NEW.synthetic_dataset_id IS DISTINCT FROM OLD.synthetic_dataset_id THEN RAISE EXCEPTION 'Historical provenance cannot be changed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER history_order_origin BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION cafe_history_origin_guard();
CREATE TRIGGER history_count_origin BEFORE INSERT OR UPDATE ON public.stocktakes FOR EACH ROW EXECUTE FUNCTION cafe_history_origin_guard();
DROP TRIGGER customer_order_push ON public.orders;
CREATE TRIGGER customer_order_push AFTER UPDATE ON public.orders FOR EACH ROW WHEN (NEW.synthetic_dataset_id IS NULL) EXECUTE FUNCTION customer_order_alert();

ALTER FUNCTION public.finance_report(date,date) RENAME TO finance_pre_history_report;
REVOKE ALL ON FUNCTION public.finance_pre_history_report(date,date) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.finance_report(p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=finance_pre_history_report(p_from,p_to);
 RETURN result||jsonb_build_object(
  'pending_invoices',(SELECT count(*) FROM financial_events e JOIN orders o ON o.id=e.order_id WHERE o.synthetic_dataset_id IS NULL AND e.business_date BETWEEN p_from AND p_to AND NOT EXISTS(SELECT 1 FROM finance_invoices i WHERE i.event_id=e.id)),
  'history_orders_included',(SELECT count(*) FROM orders WHERE synthetic_dataset_id IS NOT NULL AND payment_status IN('paid','refunded') AND (created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to));
END $$;
REVOKE ALL ON FUNCTION public.finance_report(date,date),public.cafe_history_origin_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_report(date,date) TO authenticated,service_role;

-- Keep imported records out of official numbering and physical verification.
CREATE OR REPLACE FUNCTION public.finance_issue_invoice(p_event uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE event financial_events; s finance_settings; o orders; serial bigint; invoice_number text; original uuid; original_number text; buyer jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM financial_events e JOIN orders imported_order ON imported_order.id=e.order_id WHERE e.id=p_event AND imported_order.synthetic_dataset_id IS NOT NULL) THEN RETURN; END IF;
 SELECT * INTO event FROM financial_events WHERE id=p_event;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM finance_invoices WHERE event_id=p_event) THEN RETURN; END IF;
 SELECT * INTO s FROM finance_settings WHERE id FOR UPDATE;
 -- Invoice generation is enabled. Identity must be configured before issuance.
 IF NOT s.invoices_enabled OR length(trim(s.registered_name))<3 OR length(trim(s.registered_address))<5 OR s.tin='' THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM finance_invoices WHERE event_id=p_event) THEN RETURN; END IF;
 SELECT * INTO o FROM orders WHERE id=event.order_id;
 SELECT jsonb_build_object('name',COALESCE(to_jsonb(p)->>'full_name',o.delivery_name,'Customer')) INTO buyer FROM profiles p WHERE p.id=o.customer_id;
 buyer:=COALESCE(buyer,jsonb_build_object('name',COALESCE(o.delivery_name,'Customer')));
 IF event.kind='refund' THEN
  SELECT id,number INTO original,original_number FROM finance_invoices WHERE event_id=event.reverses;
  IF original IS NULL THEN RETURN; END IF;
  serial:=s.next_credit_note; invoice_number:=s.invoice_prefix||'-CN-'||lpad(serial::text,GREATEST(8,length(serial::text)),'0');
  UPDATE finance_settings SET next_credit_note=next_credit_note+1 WHERE id;
 ELSE
  serial:=s.next_invoice; invoice_number:=s.invoice_prefix||'-'||lpad(serial::text,GREATEST(8,length(serial::text)),'0');
  IF s.compliance_verified AND (serial<s.registered_serial_start OR serial>s.registered_serial_end) THEN RETURN; END IF;
  UPDATE finance_settings SET next_invoice=next_invoice+1 WHERE id;
 END IF;
 INSERT INTO finance_invoices(event_id,order_id,kind,number,original_invoice,original_number,business,buyer,breakdown)
 VALUES(event.id,event.order_id,CASE WHEN event.kind='sale' THEN 'invoice' ELSE 'credit_note' END,invoice_number,original,original_number,
  jsonb_build_object('registered_name',s.registered_name,'trade_name',s.trade_name,'tin',s.tin,'branch_code',s.branch_code,'address',s.registered_address,
   'numbering',CASE WHEN s.compliance_verified AND event.kind='sale' THEN 'registered_serial' ELSE 'system_generated' END,'authority_basis',s.authority_basis,
   'authorization_reference',s.authorization_reference,'authorization_date',s.authorization_date,'approved_serial_start',s.registered_serial_start,'approved_serial_end',s.registered_serial_end),buyer,event.breakdown);
END $$;

-- Keep imported records out of official numbering and physical verification.
CREATE OR REPLACE FUNCTION public.inv_activate(p_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM inv_require_admin();
 IF p_enabled THEN
   IF EXISTS(SELECT 1 FROM orders WHERE status IN ('pending','confirmed','preparing','ready') AND NOT is_parked) THEN RAISE EXCEPTION 'Settle active orders before activation'; END IF;
   IF EXISTS(SELECT 1 FROM menu_items m WHERE status='active' AND manually_available AND NOT EXISTS(SELECT 1 FROM menu_item_ingredients WHERE menu_item_id=m.id)) THEN RAISE EXCEPTION 'Map stock requirements for every enabled product'; END IF;
   IF EXISTS(SELECT 1 FROM ingredients i WHERE is_active AND NOT EXISTS(SELECT 1 FROM stocktakes s WHERE s.ingredient_id=i.id AND s.state='posted' AND s.synthetic_dataset_id IS NULL AND s.counted=i.current_stock AND NOT EXISTS(SELECT 1 FROM stock_movements m WHERE m.ingredient_id=i.id AND m.created_at>s.created_at AND m.source_id IS DISTINCT FROM s.id))) THEN RAISE EXCEPTION 'Post current physical counts for all active stock items before activation'; END IF;
   IF EXISTS(SELECT 1 FROM ingredients WHERE is_active AND (unit NOT IN ('g','ml','pcs') OR current_stock<0)) THEN RAISE EXCEPTION 'Resolve base units and negative balances before activation'; END IF;
 END IF;
 UPDATE inventory_settings SET enforcement_enabled=p_enabled,updated_at=now() WHERE id;
 INSERT INTO admin_audit(actor_id,action,entity,reason,after_data) VALUES(auth.uid(),'enforcement','inventory_settings','Inventory activation changed',jsonb_build_object('enabled',p_enabled));
 UPDATE catalog_state SET version=version+1,updated_at=now() WHERE id;
END $$;

-- Keep imported records out of official numbering and physical verification.
CREATE OR REPLACE FUNCTION public.get_inventory_readiness() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM inv_require_admin();
 SELECT jsonb_build_object(
  'enforcement_enabled',(SELECT enforcement_enabled FROM inventory_settings WHERE id),
  'active_orders',(SELECT count(*) FROM orders WHERE status IN ('pending','confirmed','preparing','ready') AND NOT is_parked),
  'active_stock_items',(SELECT count(*) FROM ingredients WHERE is_active),
  'missing_recipes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'name',m.name) ORDER BY m.name)
    FROM menu_items m WHERE m.status='active' AND m.manually_available
    AND NOT EXISTS(SELECT 1 FROM menu_item_ingredients r WHERE r.menu_item_id=m.id)), '[]'::jsonb),
  'missing_counts',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'name',i.name) ORDER BY i.name)
    FROM ingredients i WHERE i.is_active AND NOT EXISTS(
      SELECT 1 FROM stocktakes s WHERE s.ingredient_id=i.id AND s.state='posted' AND s.synthetic_dataset_id IS NULL AND s.counted=i.current_stock
      AND NOT EXISTS(SELECT 1 FROM stock_movements m WHERE m.ingredient_id=i.id AND m.created_at>s.created_at AND m.source_id IS DISTINCT FROM s.id))), '[]'::jsonb),
  'invalid_stock',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'name',i.name) ORDER BY i.name)
    FROM ingredients i WHERE i.is_active AND (i.unit NOT IN ('g','ml','pcs') OR i.current_stock<0)), '[]'::jsonb)
 ) INTO result;
 RETURN result || jsonb_build_object('ready',
  (result->>'active_orders')::integer=0 AND jsonb_array_length(result->'missing_recipes')=0
  AND jsonb_array_length(result->'missing_counts')=0 AND jsonb_array_length(result->'invalid_stock')=0);
END $$;

-- Keep imported records out of official numbering and physical verification.
CREATE OR REPLACE FUNCTION public.customer_verify_production(p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM inv_require_admin();
 IF length(trim(COALESCE(p_reason,'')))<20 THEN RAISE EXCEPTION 'Describe verification of actual physical stock and actual recipe portions'; END IF;
 IF NOT(SELECT enforcement_enabled FROM inventory_settings WHERE id) THEN RAISE EXCEPTION 'Activate inventory after real stock and recipe verification'; END IF;
 IF EXISTS(SELECT 1 FROM menu_items m WHERE status='active' AND manually_available AND NOT EXISTS(SELECT 1 FROM menu_item_ingredients WHERE menu_item_id=m.id)) THEN RAISE EXCEPTION 'Map actual stock requirements for every enabled product'; END IF;
 IF EXISTS(SELECT 1 FROM ingredients i WHERE is_active AND NOT EXISTS(SELECT 1 FROM stocktakes s WHERE s.ingredient_id=i.id AND s.state='posted' AND s.synthetic_dataset_id IS NULL AND s.counted=i.current_stock
  AND s.reason NOT LIKE 'Thesis demo%' AND NOT EXISTS(SELECT 1 FROM stock_movements m WHERE m.ingredient_id=i.id AND m.created_at>s.created_at AND m.source_id IS DISTINCT FROM s.id))) THEN
  RAISE EXCEPTION 'Post current physical counts for all active stock items; demo opening counts do not certify production';
 END IF;
 UPDATE customer_branch_settings SET production_verified_at=now(),production_verified_by=auth.uid(),production_recipe_fingerprint=customer_recipe_fingerprint(),production_verification_reason=p_reason,updated_at=now() WHERE id;
 INSERT INTO admin_audit(actor_id,action,entity,reason) VALUES(auth.uid(),'verify_production','customer_branch_settings',p_reason);
END $$;

-- Keep imported records out of official numbering and physical verification.
CREATE OR REPLACE FUNCTION public.admin_export_tables() RETURNS TABLE(table_name text,section text,excluded_fields jsonb,columns jsonb)
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
 WHERE n.nspname='public' AND c.relkind IN('r','p') AND c.relname !~ '^(admin_export_|cafe_history_)'
 AND c.relname NOT IN('customer_guest_order_grants','pickup_tokens','void_tokens','store_settings','customer_push_subscriptions','spatial_ref_sys');
$$;
