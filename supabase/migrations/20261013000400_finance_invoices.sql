-- Forward-only financial records. Existing sales without tax snapshots stay unknown.
CREATE TABLE public.finance_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 registered_name text NOT NULL DEFAULT '', trade_name text NOT NULL DEFAULT 'Jayds Café',
 tin text NOT NULL DEFAULT '', branch_code text NOT NULL DEFAULT '', registered_address text NOT NULL DEFAULT '',
 invoices_enabled boolean NOT NULL DEFAULT true,
 authority_basis text NOT NULL DEFAULT 'Owner reports RDO confirmation that Form 2303 suffices',
 authorization_reference text, authorization_date date, registered_serial_start bigint, registered_serial_end bigint,
 compliance_verified boolean NOT NULL DEFAULT false,
 invoice_prefix text NOT NULL DEFAULT 'JD', next_invoice bigint NOT NULL DEFAULT 1 CHECK(next_invoice>0),
 next_credit_note bigint NOT NULL DEFAULT 1 CHECK(next_credit_note>0),
 delivery_tax_treatment text NOT NULL DEFAULT 'pending' CHECK(delivery_tax_treatment IN('pending','pass_through','vat_inclusive')),
 other_taxable_income numeric NOT NULL DEFAULT 0 CHECK(other_taxable_income>=0),
 income_tax_credits numeric NOT NULL DEFAULT 0 CHECK(income_tax_credits>=0),
 income_setup_confirmed boolean NOT NULL DEFAULT false,
 tax_year integer NOT NULL DEFAULT extract(year FROM now() AT TIME ZONE 'Asia/Manila'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.finance_settings(id) VALUES(true);
CREATE TABLE public.order_financials (
 order_id uuid PRIMARY KEY REFERENCES orders(id), breakdown jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.financial_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
 kind text NOT NULL CHECK(kind IN('sale','refund')), reverses uuid REFERENCES financial_events(id),
 breakdown jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 business_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Manila')::date,
 UNIQUE(order_id,kind), CHECK((kind='sale' AND reverses IS NULL) OR (kind='refund' AND reverses IS NOT NULL))
);
CREATE TABLE public.finance_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL UNIQUE REFERENCES financial_events(id),
 order_id uuid NOT NULL REFERENCES orders(id), kind text NOT NULL CHECK(kind IN('invoice','credit_note')),
 number text NOT NULL UNIQUE, original_invoice uuid REFERENCES finance_invoices(id),
 original_number text,
 business jsonb NOT NULL, buyer jsonb NOT NULL, breakdown jsonb NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.finance_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_date date NOT NULL,
 request_key uuid NOT NULL UNIQUE, request_fingerprint text NOT NULL,
 category text NOT NULL CHECK(category IN('rent','utilities','wages','transport','supplies','other')),
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 3 AND 500),
 gross_centavos bigint NOT NULL CHECK(gross_centavos>0), input_vat_centavos bigint NOT NULL DEFAULT 0 CHECK(input_vat_centavos>=0 AND input_vat_centavos<=gross_centavos),
 input_vat_reviewed boolean NOT NULL DEFAULT false, document_reference text,
 actor_id uuid NOT NULL REFERENCES profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(input_vat_centavos=0 OR (input_vat_reviewed AND COALESCE(length(trim(document_reference)),0)>2))
);
CREATE TABLE public.finance_expense_reversals (
 expense_id uuid PRIMARY KEY REFERENCES finance_expenses(id), reason text NOT NULL CHECK(length(trim(reason))>=5),
 actor_id uuid NOT NULL REFERENCES profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 business_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Manila')::date
);
CREATE FUNCTION public.finance_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM profiles p WHERE p.id=auth.uid() AND p.role='admin' AND COALESCE((to_jsonb(p)->>'is_approved')::boolean,false))
$$;
CREATE FUNCTION public.finance_require_admin() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT finance_admin() THEN RAISE EXCEPTION 'Approved Admin access required' USING ERRCODE='42501'; END IF;
END $$;
ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expense_reversals ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_settings_admin ON public.finance_settings FOR SELECT TO authenticated USING(finance_admin());
CREATE POLICY financials_admin ON public.order_financials FOR SELECT TO authenticated USING(finance_admin());
CREATE POLICY financial_events_admin ON public.financial_events FOR SELECT TO authenticated USING(finance_admin());
CREATE POLICY invoices_admin ON public.finance_invoices FOR SELECT TO authenticated USING(finance_admin());
CREATE POLICY expenses_admin ON public.finance_expenses FOR SELECT TO authenticated USING(finance_admin());
CREATE POLICY reversals_admin ON public.finance_expense_reversals FOR SELECT TO authenticated USING(finance_admin());
GRANT SELECT ON public.finance_settings,public.order_financials,public.financial_events,public.finance_invoices,public.finance_expenses,public.finance_expense_reversals TO authenticated;
GRANT ALL ON public.finance_settings,public.order_financials,public.financial_events,public.finance_invoices,public.finance_expenses,public.finance_expense_reversals TO service_role;
CREATE FUNCTION public.finance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Posted financial records are immutable; use a linked reversal'; END $$;
CREATE TRIGGER immutable_financial_snapshot BEFORE UPDATE OR DELETE ON public.order_financials FOR EACH ROW EXECUTE FUNCTION public.finance_immutable();
CREATE TRIGGER immutable_financial_event BEFORE UPDATE OR DELETE ON public.financial_events FOR EACH ROW EXECUTE FUNCTION public.finance_immutable();
CREATE TRIGGER immutable_invoice BEFORE UPDATE OR DELETE ON public.finance_invoices FOR EACH ROW EXECUTE FUNCTION public.finance_immutable();
CREATE TRIGGER immutable_expense BEFORE UPDATE OR DELETE ON public.finance_expenses FOR EACH ROW EXECUTE FUNCTION public.finance_immutable();
CREATE TRIGGER immutable_expense_reversal BEFORE UPDATE OR DELETE ON public.finance_expense_reversals FOR EACH ROW EXECUTE FUNCTION public.finance_immutable();
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS unit_cost numeric;
CREATE FUNCTION public.finance_capture_consumption_cost() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.movement_type='consumption' AND NEW.batch_id IS NOT NULL THEN
  SELECT unit_cost INTO NEW.unit_cost FROM stock_batches WHERE id=NEW.batch_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_consumption_cost BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.finance_capture_consumption_cost();

-- Compatibility for callers without a versioned server snapshot: allocate the
-- accepted discount by largest remainder, then extract VAT from inclusive prices.
CREATE FUNCTION public.finance_standard_snapshot(p_order orders,p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; treatment text; delivery bigint:=round(COALESCE(p_order.delivery_fee,0)*100);
BEGIN
 SELECT delivery_tax_treatment INTO treatment FROM finance_settings WHERE id;
 WITH raw AS (
  SELECT x,ord-1 index,round((x->>'price')::numeric*(x->>'quantity')::integer*100)::bigint gross FROM jsonb_array_elements(p_items) WITH ORDINALITY a(x,ord)
 ), weights AS (
  SELECT *,sum(gross) OVER() all_gross,round(p_order.discount*100)::bigint discount FROM raw
 ), allocated AS (
  SELECT *,CASE WHEN all_gross=0 THEN 0 ELSE floor(discount::numeric*gross/all_gross)::bigint END part,
   CASE WHEN all_gross=0 THEN 0 ELSE mod(discount::numeric*gross,all_gross) END remainder FROM weights
 ), ranked AS (
  SELECT *,row_number() OVER(ORDER BY remainder DESC,index) rank,discount-sum(part) OVER() extras FROM allocated
 ), lines AS (
  SELECT *,part+CASE WHEN rank<=extras THEN 1 ELSE 0 END actual_discount FROM ranked
 ), totals AS (
  SELECT *,round((gross-actual_discount)::numeric*100/112)::bigint net FROM lines
 )
 SELECT jsonb_build_object('version',1,'currency','PHP','lines',jsonb_agg(jsonb_build_object(
  'index',index,'menu_item_id',x->>'menu_item_id','name',x->>'name','quantity',(x->>'quantity')::integer,'eligible_quantity',0,
  'gross',gross,'vat_relief',0,'discount',actual_discount,'taxable_sales',net,'exempt_sales',0,'vat',gross-actual_discount-net,'total',gross-actual_discount) ORDER BY index),
  'gross',sum(gross),'vat_relief',0,'discount',sum(actual_discount),'savings',sum(actual_discount),'taxable_sales',sum(net),'exempt_sales',0,
  'vat',sum(gross-actual_discount-net),'net_sales',sum(net),'osd_gross_sales',sum(net),'delivery',delivery,
  'delivery_tax',CASE WHEN delivery=0 OR treatment='pass_through' THEN 0 WHEN treatment='vat_inclusive' THEN delivery-round(delivery::numeric*100/112)::bigint ELSE NULL END,
  'total',sum(gross-actual_discount)+delivery,'mode',CASE WHEN p_order.discount>0 THEN 'promotion' ELSE 'standard' END,'points_used',p_order.points_redeemed)
 INTO result FROM totals;
 RETURN result;
END $$;

CREATE FUNCTION public.finance_validate_snapshot(p_order orders,p_items jsonb,p_snapshot jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE line jsonb; item jsonb; k text; aggregate_value bigint;
BEGIN
 FOREACH k IN ARRAY ARRAY['gross','vat_relief','discount','savings','taxable_sales','exempt_sales','vat','net_sales','osd_gross_sales','delivery','total','points_used'] LOOP
  IF p_snapshot->>k IS NULL OR (p_snapshot->>k)::numeric::text IN('NaN','Infinity','-Infinity') OR (p_snapshot->>k)::numeric<0 OR (p_snapshot->>k)::numeric<>trunc((p_snapshot->>k)::numeric) THEN RAISE EXCEPTION 'Financial totals require nonnegative integer centavos'; END IF;
 END LOOP;
 IF p_snapshot->>'version'<>'1' OR p_snapshot->>'currency'<>'PHP' OR jsonb_typeof(p_snapshot->'lines')<>'array'
 OR jsonb_array_length(p_snapshot->'lines')<>jsonb_array_length(p_items) THEN RAISE EXCEPTION 'Invalid financial snapshot'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_snapshot->'lines') LOOP
  item:=p_items->((line->>'index')::integer);
  IF item IS NULL OR line->>'quantity' IS NULL OR (line->>'eligible_quantity')::integer>(line->>'quantity')::integer OR line->>'menu_item_id' IS DISTINCT FROM item->>'menu_item_id' OR line->>'name' IS DISTINCT FROM item->>'name'
  OR (line->>'quantity')::integer<>(item->>'quantity')::integer OR (line->>'gross')::bigint<>round((item->>'price')::numeric*(item->>'quantity')::integer*100)
  OR (line->>'total')::bigint<>(line->>'taxable_sales')::bigint+(line->>'exempt_sales')::bigint+(line->>'vat')::bigint
  OR (line->>'total')::bigint<>(line->>'gross')::bigint-(line->>'vat_relief')::bigint-(line->>'discount')::bigint THEN RAISE EXCEPTION 'Financial line does not match accepted item'; END IF;
  FOREACH k IN ARRAY ARRAY['gross','vat_relief','discount','taxable_sales','exempt_sales','vat','total','eligible_quantity'] LOOP
   IF line->>k IS NULL OR (line->>k)::numeric<0 OR (line->>k)::numeric<>trunc((line->>k)::numeric) THEN RAISE EXCEPTION 'Financial amounts must be nonnegative centavos'; END IF;
  END LOOP;
  IF round(((line->>'taxable_sales')::bigint+(line->>'vat')::bigint)::numeric*100/112)<>(line->>'taxable_sales')::bigint THEN RAISE EXCEPTION 'VAT does not reconcile to inclusive sales'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT x->>'index') FROM jsonb_array_elements(p_snapshot->'lines') x)<>jsonb_array_length(p_items) THEN RAISE EXCEPTION 'Duplicate financial line'; END IF;
 FOREACH k IN ARRAY ARRAY['gross','vat_relief','discount','taxable_sales','exempt_sales','vat'] LOOP
  SELECT sum((x->>k)::bigint) INTO aggregate_value FROM jsonb_array_elements(p_snapshot->'lines') x;
  IF aggregate_value IS DISTINCT FROM (p_snapshot->>k)::bigint THEN RAISE EXCEPTION 'Financial totals do not reconcile'; END IF;
 END LOOP;
 IF (p_snapshot->>'gross')::bigint<>round(p_order.subtotal*100) OR (p_snapshot->>'total')::bigint<>round(p_order.total*100)
 OR (p_snapshot->>'delivery')::bigint<>round(COALESCE(p_order.delivery_fee,0)*100)
 OR (p_snapshot->>'savings')::bigint<>round(p_order.discount*100)
 OR (p_snapshot->>'net_sales')::bigint<>(p_snapshot->>'taxable_sales')::bigint+(p_snapshot->>'exempt_sales')::bigint
 OR (p_snapshot->>'total')::bigint<>(p_snapshot->>'net_sales')::bigint+(p_snapshot->>'vat')::bigint+(p_snapshot->>'delivery')::bigint
 THEN RAISE EXCEPTION 'Financial totals do not match accepted order'; END IF;
END $$;

ALTER FUNCTION public.inv_create_order(jsonb,jsonb,text,uuid,uuid,text) RENAME TO finance_legacy_create_order;
REVOKE ALL ON FUNCTION public.finance_legacy_create_order(jsonb,jsonb,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.inv_create_order(p_order jsonb,p_items jsonb,p_key text,p_actor uuid,p_voucher uuid DEFAULT NULL,p_fingerprint text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; saved orders; snapshot jsonb; accepted_items jsonb; already_exists boolean; treatment text; delivery_tax bigint; delivery_income bigint; osd_sales bigint;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted order server required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key,0));
 already_exists:=EXISTS(SELECT 1 FROM orders WHERE idempotency_key=p_key);
 result:=finance_legacy_create_order(p_order,p_items,p_key,p_actor,p_voucher,p_fingerprint);
 IF already_exists THEN RETURN result; END IF;
 SELECT * INTO saved FROM orders WHERE id=(result->>'id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM order_financials WHERE order_id=saved.id) AND saved.payment_status='pending' THEN
  -- Canonical names/prices are read back from the accepted transaction, never the browser.
  SELECT jsonb_agg(x||jsonb_build_object('name',m.name) ORDER BY ord) INTO accepted_items FROM jsonb_array_elements(p_items) WITH ORDINALITY a(x,ord) JOIN menu_items m ON m.id=(x->>'menu_item_id')::uuid;
  snapshot:=COALESCE(p_order->'financial_breakdown',finance_standard_snapshot(saved,accepted_items));
  SELECT delivery_tax_treatment INTO treatment FROM finance_settings WHERE id;
  delivery_tax:=CASE WHEN COALESCE(saved.delivery_fee,0)=0 OR treatment='pass_through' THEN 0 WHEN treatment='vat_inclusive' THEN round(saved.delivery_fee*100)-round(saved.delivery_fee*10000/112) ELSE NULL END;
  delivery_income:=CASE WHEN treatment='vat_inclusive' THEN round(COALESCE(saved.delivery_fee,0)*100)-delivery_tax ELSE 0 END;
  SELECT sum((x->>'taxable_sales')::bigint+round((x->>'gross')::numeric/(x->>'quantity')::integer*(x->>'eligible_quantity')::integer*100/112)) INTO osd_sales FROM jsonb_array_elements(snapshot->'lines') x;
  snapshot:=snapshot||jsonb_build_object('delivery_tax_treatment',treatment,'delivery_tax',delivery_tax,'osd_gross_sales',osd_sales+delivery_income);
  PERFORM finance_validate_snapshot(saved,accepted_items,snapshot);
  INSERT INTO order_financials(order_id,breakdown) VALUES(saved.id,snapshot);
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.finance_guard_order_amounts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM order_financials WHERE order_id=OLD.id) AND (NEW.total IS DISTINCT FROM OLD.total OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.discount IS DISTINCT FROM OLD.discount OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee OR NEW.points_redeemed IS DISTINCT FROM OLD.points_redeemed) THEN
  RAISE EXCEPTION 'Accepted financial amounts are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_guard_amounts BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.finance_guard_order_amounts();
REVOKE ALL ON FUNCTION public.inv_create_order(jsonb,jsonb,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inv_create_order(jsonb,jsonb,text,uuid,uuid,text) TO service_role;

CREATE FUNCTION public.finance_issue_invoice(p_event uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE event financial_events; s finance_settings; o orders; serial bigint; invoice_number text; original uuid; original_number text; buyer jsonb;
BEGIN
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
CREATE FUNCTION public.finance_payment_posting() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; event_id uuid; original financial_events;
BEGIN
 IF COALESCE((to_jsonb(NEW)->>'is_parked')::boolean,false) THEN RETURN NULL; END IF;
 SELECT breakdown INTO snapshot FROM order_financials WHERE order_id=NEW.id;
 IF snapshot IS NULL THEN RETURN NULL; END IF; -- Never invent historical VAT.
 IF NEW.payment_status='paid' AND NEW.status IN('confirmed','preparing','ready','completed') AND NOT COALESCE((to_jsonb(NEW)->>'payment_review_required')::boolean,false) THEN
  INSERT INTO financial_events(order_id,kind,breakdown) VALUES(NEW.id,'sale',snapshot) ON CONFLICT(order_id,kind) DO NOTHING RETURNING id INTO event_id;
  IF event_id IS NOT NULL THEN PERFORM finance_issue_invoice(event_id); END IF;
 ELSIF NEW.payment_status='refunded' THEN
  SELECT * INTO original FROM financial_events WHERE order_id=NEW.id AND kind='sale';
  IF FOUND THEN
   INSERT INTO financial_events(order_id,kind,reverses,breakdown) VALUES(NEW.id,'refund',original.id,original.breakdown) ON CONFLICT(order_id,kind) DO NOTHING RETURNING id INTO event_id;
   IF event_id IS NOT NULL THEN PERFORM finance_issue_invoice(event_id); END IF;
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER zz_finance_payment AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.finance_payment_posting();

CREATE FUNCTION public.finance_save_settings(p_settings jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s finance_settings; r record;
BEGIN
 PERFORM finance_require_admin(); SELECT * INTO s FROM finance_settings WHERE id FOR UPDATE;
 IF length(trim(p_settings->>'registered_name'))<3 OR length(trim(p_settings->>'registered_address'))<5
 OR COALESCE(p_settings->>'tin','') !~ '^\d{3}-?\d{3}-?\d{3}$' OR COALESCE(p_settings->>'branch_code','') !~ '^\d{5}$'
 OR COALESCE(p_settings->>'invoice_prefix','') !~ '^[A-Z0-9-]{2,16}$' THEN RAISE EXCEPTION 'Enter registered name, address, TIN, five-digit branch code and a valid invoice prefix'; END IF;
 IF EXISTS(SELECT 1 FROM finance_invoices) AND p_settings->>'invoice_prefix'<>s.invoice_prefix THEN RAISE EXCEPTION 'Issued invoice series cannot be renamed'; END IF;
 IF COALESCE((p_settings->>'compliance_verified')::boolean,false) AND (NULLIF(p_settings->>'authorization_reference','') IS NULL OR NULLIF(p_settings->>'authorization_date','') IS NULL
 OR (p_settings->>'registered_serial_start')::bigint IS NULL OR (p_settings->>'registered_serial_end')::bigint IS NULL OR (p_settings->>'registered_serial_start')::bigint<1
 OR (p_settings->>'registered_serial_end')::bigint<(p_settings->>'registered_serial_start')::bigint) THEN RAISE EXCEPTION 'Verified registered numbering needs its authorization and approved serial range'; END IF;
 UPDATE finance_settings SET registered_name=trim(p_settings->>'registered_name'),trade_name=trim(COALESCE(p_settings->>'trade_name','Jayds Café')),
 tin=trim(p_settings->>'tin'),branch_code=p_settings->>'branch_code',registered_address=trim(p_settings->>'registered_address'),invoices_enabled=COALESCE((p_settings->>'invoices_enabled')::boolean,true),
 authority_basis=COALESCE(NULLIF(trim(p_settings->>'authority_basis'),''),s.authority_basis),invoice_prefix=p_settings->>'invoice_prefix',
 authorization_reference=NULLIF(p_settings->>'authorization_reference',''),authorization_date=NULLIF(p_settings->>'authorization_date','')::date,
 registered_serial_start=NULLIF(p_settings->>'registered_serial_start','')::bigint,registered_serial_end=NULLIF(p_settings->>'registered_serial_end','')::bigint,
 compliance_verified=COALESCE((p_settings->>'compliance_verified')::boolean,false),delivery_tax_treatment=COALESCE(p_settings->>'delivery_tax_treatment','pending'),
 other_taxable_income=COALESCE((p_settings->>'other_taxable_income')::numeric,0),income_tax_credits=COALESCE((p_settings->>'income_tax_credits')::numeric,0),
 income_setup_confirmed=COALESCE((p_settings->>'income_setup_confirmed')::boolean,false),tax_year=COALESCE((p_settings->>'tax_year')::integer,s.tax_year),updated_at=now() WHERE id;
 IF (SELECT other_taxable_income::text IN('NaN','Infinity','-Infinity') OR income_tax_credits::text IN('NaN','Infinity','-Infinity') OR tax_year NOT BETWEEN 2023 AND 2100 FROM finance_settings WHERE id) THEN RAISE EXCEPTION 'Enter finite tax setup values'; END IF;
 -- Only new snapshotted events may receive delayed invoices; no historical tax backfill.
 FOR r IN SELECT id FROM financial_events ORDER BY created_at,CASE WHEN kind='sale' THEN 0 ELSE 1 END,id LOOP PERFORM finance_issue_invoice(r.id); END LOOP;
 INSERT INTO admin_audit(actor_id,action,entity,reason) VALUES(auth.uid(),'configure_finance','finance_settings','Invoice identity and tax setup updated');
END $$;
CREATE FUNCTION public.finance_post_expense(p_expense jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved uuid; previous finance_expenses; fingerprint text:=md5((p_expense-'request_key')::text);
BEGIN
 PERFORM finance_require_admin();
 IF NULLIF(p_expense->>'request_key','') IS NULL THEN RAISE EXCEPTION 'Expense submission key is required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_expense->>'request_key',3));
 SELECT * INTO previous FROM finance_expenses WHERE request_key=(p_expense->>'request_key')::uuid;
 IF FOUND THEN
  IF previous.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Expense submission key reused with different data'; END IF;
  RETURN previous.id;
 END IF;
 IF p_expense->>'category'='inventory' THEN RAISE EXCEPTION 'Record stock purchases in Purchasing; costs are recognized when ingredients are consumed'; END IF;
 INSERT INTO finance_expenses(request_key,request_fingerprint,business_date,category,description,gross_centavos,input_vat_centavos,input_vat_reviewed,document_reference,actor_id)
 VALUES((p_expense->>'request_key')::uuid,fingerprint,(p_expense->>'business_date')::date,p_expense->>'category',p_expense->>'description',round((p_expense->>'amount')::numeric*100),
  round(COALESCE((p_expense->>'input_vat')::numeric,0)*100),COALESCE((p_expense->>'input_vat_reviewed')::boolean,false),NULLIF(trim(p_expense->>'document_reference'),''),auth.uid()) RETURNING id INTO saved;
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason) VALUES(auth.uid(),'post_expense','finance_expenses',saved,'Operating expense recorded'); RETURN saved;
END $$;
CREATE FUNCTION public.finance_reverse_expense(p_expense uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM finance_require_admin(); INSERT INTO finance_expense_reversals(expense_id,reason,actor_id) VALUES(p_expense,p_reason,auth.uid());
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason) VALUES(auth.uid(),'reverse_expense','finance_expenses',p_expense,p_reason);
END $$;
CREATE FUNCTION public.finance_report(p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM finance_require_admin();
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366 THEN RAISE EXCEPTION 'Choose a report period of up to one year'; END IF;
 WITH events AS (SELECT *,CASE WHEN kind='refund' THEN -1 ELSE 1 END sign FROM financial_events WHERE business_date BETWEEN p_from AND p_to),
 totals AS (SELECT COALESCE(sum(sign*(breakdown->>'net_sales')::bigint),0) net_sales,COALESCE(sum(sign*((breakdown->>'vat')::bigint+COALESCE((breakdown->>'delivery_tax')::bigint,0))),0) vat,
 COALESCE(sum(CASE WHEN breakdown->>'delivery_tax_treatment'='vat_inclusive' THEN sign*((breakdown->>'delivery')::bigint-COALESCE((breakdown->>'delivery_tax')::bigint,0)) ELSE 0 END),0) delivery_income,
 COALESCE(sum(sign*(breakdown->>'total')::bigint),0) collections,COALESCE(sum(sign*(breakdown->>'delivery')::bigint),0) delivery,
 count(*) FILTER(WHERE (breakdown->>'delivery_tax') IS NULL AND (breakdown->>'delivery')::bigint>0) delivery_tax_pending FROM events),
 expenses AS (SELECT COALESCE(sum(gross_centavos-input_vat_centavos),0) amount,COALESCE(sum(input_vat_centavos),0) input_vat FROM finance_expenses WHERE business_date BETWEEN p_from AND p_to),
 reversals AS (SELECT COALESCE(sum(e.gross_centavos-e.input_vat_centavos),0) amount,COALESCE(sum(e.input_vat_centavos),0) input_vat FROM finance_expense_reversals r JOIN finance_expenses e ON e.id=r.expense_id WHERE r.business_date BETWEEN p_from AND p_to),
 cogs AS (SELECT COALESCE(round(sum(abs(m.quantity)*m.unit_cost)*100),0) amount FROM stock_movements m WHERE m.movement_type='consumption' AND (m.created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to),
 daily AS (SELECT business_date,sum(sign*(breakdown->>'net_sales')::bigint) net_sales,sum(sign*(breakdown->>'vat')::bigint) vat FROM events GROUP BY business_date)
 SELECT jsonb_build_object('net_sales',t.net_sales,'output_vat',t.vat,'collections',t.collections,'delivery',t.delivery,'delivery_tax_pending',t.delivery_tax_pending,
 'cogs',c.amount,'operating_expenses',e.amount-r.amount,'input_vat',e.input_vat-r.input_vat,'delivery_income',t.delivery_income,'operating_profit',t.net_sales+t.delivery_income-c.amount-e.amount+r.amount,
 'daily',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY business_date) FROM daily d),'[]'::jsonb),
 'historical_tax_unknown',(SELECT count(*) FROM orders o WHERE o.payment_status IN('paid','refunded') AND NOT o.is_parked AND (o.created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to AND NOT EXISTS(SELECT 1 FROM order_financials f WHERE f.order_id=o.id)),
 'historical_cost_unknown',(SELECT count(*) FROM stock_movements m WHERE m.movement_type='consumption' AND m.unit_cost IS NULL AND (m.created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to),
 'pending_invoices',(SELECT count(*) FROM financial_events e WHERE e.business_date BETWEEN p_from AND p_to AND NOT EXISTS(SELECT 1 FROM finance_invoices i WHERE i.event_id=e.id)),
 'unconsumed_paid_orders',(SELECT count(*) FROM orders o JOIN financial_events f ON f.order_id=o.id AND f.kind='sale' WHERE f.business_date BETWEEN p_from AND p_to AND NOT o.inventory_consumed),
 'settings',(SELECT to_jsonb(s) FROM finance_settings s WHERE id),
 'ytd_osd_gross_sales',(SELECT COALESCE(sum(CASE WHEN kind='refund' THEN -1 ELSE 1 END*(breakdown->>'osd_gross_sales')::bigint),0) FROM financial_events WHERE business_date BETWEEN make_date(extract(year FROM p_to)::integer,1,1) AND p_to),
 'ytd_historical_tax_unknown',(SELECT count(*) FROM orders o WHERE o.payment_status IN('paid','refunded') AND NOT o.is_parked AND (o.created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN make_date(extract(year FROM p_to)::integer,1,1) AND p_to AND NOT EXISTS(SELECT 1 FROM order_financials f WHERE f.order_id=o.id)),
 'ytd_delivery_tax_pending',(SELECT count(*) FROM financial_events e WHERE e.business_date BETWEEN make_date(extract(year FROM p_to)::integer,1,1) AND p_to AND (e.breakdown->>'delivery')::bigint>0 AND (e.breakdown->>'delivery_tax') IS NULL),
 'expenses',COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY business_date DESC) FROM (SELECT e.*,EXISTS(SELECT 1 FROM finance_expense_reversals r WHERE r.expense_id=e.id) reversed FROM finance_expenses e WHERE business_date BETWEEN p_from AND p_to ORDER BY business_date DESC,id LIMIT 100) q),'[]'::jsonb),
 'invoices',COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY issued_at DESC) FROM (SELECT i.* FROM finance_invoices i WHERE (issued_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to ORDER BY issued_at DESC,id LIMIT 100) q),'[]'::jsonb))
 INTO result FROM totals t CROSS JOIN expenses e CROSS JOIN reversals r CROSS JOIN cogs c;
 RETURN result;
END $$;
-- Helpers cannot be called through anonymous/default PUBLIC function privileges.
REVOKE ALL ON FUNCTION public.finance_admin(),public.finance_require_admin(),public.finance_immutable(),public.finance_standard_snapshot(orders,jsonb),public.finance_validate_snapshot(orders,jsonb,jsonb),public.finance_issue_invoice(uuid),public.finance_payment_posting(),public.finance_guard_order_amounts(),public.finance_capture_consumption_cost(),public.finance_save_settings(jsonb),public.finance_post_expense(jsonb),public.finance_reverse_expense(uuid,text),public.finance_report(date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_admin(),public.finance_save_settings(jsonb),public.finance_post_expense(jsonb),public.finance_reverse_expense(uuid,text),public.finance_report(date,date) TO authenticated,service_role;

-- The same issued invoice is available through the existing expiring receipt
-- token. There is no new anonymous lookup by order ID or invoice number.
CREATE OR REPLACE FUNCTION public.get_guest_receipt(p_token text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('id',r.id,'receipt_token',r.receipt_token,
 'receipt_data',r.receipt_data||jsonb_build_object('invoice',(SELECT to_jsonb(i) FROM finance_invoices i WHERE i.order_id=r.order_id AND i.kind='invoice' LIMIT 1)),
 'created_at',r.created_at,'expires_at',r.expires_at)
 FROM guest_receipts r WHERE r.receipt_token=p_token AND r.expires_at>now() LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_guest_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_receipt(text) TO anon,authenticated,service_role;
