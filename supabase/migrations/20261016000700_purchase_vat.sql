-- Reviewed supplier VAT is an input-tax entry, not a second inventory expense.
CREATE TABLE public.finance_purchase_vat (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receipt_id uuid NOT NULL REFERENCES goods_receipts(id),
 request_key uuid NOT NULL UNIQUE, fingerprint text NOT NULL, business_date date NOT NULL DEFAULT inv_business_date(),
 gross_centavos bigint NOT NULL CHECK(gross_centavos>0), input_vat_centavos bigint NOT NULL CHECK(input_vat_centavos>0 AND input_vat_centavos<=gross_centavos),
 cogs_relief_centavos bigint NOT NULL, writeoff_relief_centavos bigint NOT NULL,
 document_id uuid NOT NULL REFERENCES finance_documents(id), document_reference text NOT NULL CHECK(length(trim(document_reference))>=3),
 actor_id uuid NOT NULL REFERENCES profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.finance_purchase_vat_reversals (
 entry_id uuid PRIMARY KEY REFERENCES finance_purchase_vat(id), reason text NOT NULL CHECK(length(trim(reason))>=5),
 business_date date NOT NULL DEFAULT inv_business_date(), cogs_charge_centavos bigint NOT NULL, writeoff_charge_centavos bigint NOT NULL,
 actor_id uuid NOT NULL REFERENCES profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_purchase_vat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_purchase_vat_reversals ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_vat_admin ON public.finance_purchase_vat FOR SELECT TO authenticated USING(finance_admin());
CREATE POLICY purchase_vat_reversals_admin ON public.finance_purchase_vat_reversals FOR SELECT TO authenticated USING(finance_admin());
GRANT SELECT ON public.finance_purchase_vat,public.finance_purchase_vat_reversals TO authenticated;
GRANT ALL ON public.finance_purchase_vat,public.finance_purchase_vat_reversals TO service_role;
CREATE TRIGGER immutable_purchase_vat BEFORE UPDATE OR DELETE ON public.finance_purchase_vat FOR EACH ROW EXECUTE FUNCTION finance_immutable();
CREATE TRIGGER immutable_purchase_vat_reversal BEFORE UPDATE OR DELETE ON public.finance_purchase_vat_reversals FOR EACH ROW EXECUTE FUNCTION finance_immutable();
CREATE INDEX purchase_vat_receipt ON public.finance_purchase_vat(receipt_id);
CREATE FUNCTION public.finance_receipt_gross(p_receipt uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT round(COALESCE(sum(m.quantity*b.unit_cost),0)*100)::bigint FROM stock_movements m JOIN stock_batches b ON b.id=m.batch_id WHERE m.movement_type='receipt' AND m.source_id=p_receipt AND b.receipt_id=p_receipt
$$;
CREATE FUNCTION public.finance_purchase_relief(p_receipt uuid,p_ratio numeric) RETURNS TABLE(cogs bigint,writeoff bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT round(COALESCE(sum(abs(m.quantity)*b.unit_cost) FILTER(WHERE m.movement_type='consumption'),0)*p_ratio*100)::bigint,
 round(COALESCE(sum(abs(m.quantity)*b.unit_cost) FILTER(WHERE m.movement_type IN('waste','count')),0)*p_ratio*100)::bigint
 FROM stock_movements m JOIN stock_batches b ON b.id=m.batch_id WHERE b.receipt_id=p_receipt AND m.quantity<0 AND m.created_at<=now()
$$;
CREATE FUNCTION public.finance_review_purchase_vat(p_entry jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved finance_purchase_vat; receipt uuid:=(p_entry->>'receipt_id')::uuid; doc finance_documents; gross bigint; vat bigint:=round((p_entry->>'input_vat')::numeric*100); relief record; fingerprint text:=md5((p_entry-'request_key')::text);
BEGIN
 PERFORM finance_require_admin();
 IF p_entry->>'request_key' IS NULL THEN RAISE EXCEPTION 'A submission key is required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_entry->>'request_key',7));
 SELECT * INTO saved FROM finance_purchase_vat WHERE request_key=(p_entry->>'request_key')::uuid;
 IF FOUND THEN IF saved.fingerprint<>fingerprint THEN RAISE EXCEPTION 'Submission key reused with changed data'; END IF; RETURN saved.id; END IF;
 SELECT * INTO doc FROM finance_documents WHERE id=(p_entry->>'document_id')::uuid FOR UPDATE;
 IF NOT FOUND OR doc.linked_id IS NOT NULL OR doc.actor_id IS DISTINCT FROM auth.uid() OR doc.expires_at<=now() THEN RAISE EXCEPTION 'Upload an available supporting invoice photo'; END IF;
 PERFORM 1 FROM goods_receipts WHERE id=receipt FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receiving record not found'; END IF;
 IF EXISTS(SELECT 1 FROM finance_purchase_vat v WHERE v.receipt_id=receipt AND NOT EXISTS(SELECT 1 FROM finance_purchase_vat_reversals r WHERE r.entry_id=v.id)) THEN RAISE EXCEPTION 'This delivery already has a reviewed VAT entry'; END IF;
 PERFORM 1 FROM ingredients WHERE id IN(SELECT ingredient_id FROM stock_batches WHERE receipt_id=receipt) ORDER BY id FOR UPDATE;
 gross:=finance_receipt_gross(receipt);
 IF gross<=0 OR vat IS NULL OR vat<=0 OR vat>round(gross::numeric*12/112) OR COALESCE((p_entry->>'reviewed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Review the supplier invoice and enter creditable VAT within its VAT-inclusive total'; END IF;
 SELECT * INTO relief FROM finance_purchase_relief(receipt,vat::numeric/gross);
 INSERT INTO finance_purchase_vat(receipt_id,request_key,fingerprint,gross_centavos,input_vat_centavos,cogs_relief_centavos,writeoff_relief_centavos,document_id,document_reference,actor_id)
 VALUES(receipt,(p_entry->>'request_key')::uuid,fingerprint,gross,vat,relief.cogs,relief.writeoff,doc.id,p_entry->>'document_reference',auth.uid()) RETURNING * INTO saved;
 UPDATE finance_documents SET linked_entity='purchase_vat',linked_id=saved.id,expires_at=NULL WHERE id=doc.id;
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason) VALUES(auth.uid(),'review_purchase_vat','finance_purchase_vat',saved.id,'Supplier invoice reviewed');
 RETURN saved.id;
END $$;
CREATE FUNCTION public.finance_reverse_purchase_vat(p_entry uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE entry finance_purchase_vat; relief record;
BEGIN
 PERFORM finance_require_admin();
 SELECT * INTO entry FROM finance_purchase_vat WHERE id=p_entry;
 IF NOT FOUND THEN RAISE EXCEPTION 'VAT review not found'; END IF;
 PERFORM 1 FROM goods_receipts WHERE id=entry.receipt_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM finance_purchase_vat_reversals WHERE entry_id=entry.id) THEN RAISE EXCEPTION 'This VAT review is already reversed'; END IF;
 PERFORM 1 FROM ingredients WHERE id IN(SELECT ingredient_id FROM stock_batches WHERE receipt_id=entry.receipt_id) ORDER BY id FOR UPDATE;
 SELECT * INTO relief FROM finance_purchase_relief(entry.receipt_id,entry.input_vat_centavos::numeric/entry.gross_centavos);
 INSERT INTO finance_purchase_vat_reversals(entry_id,reason,cogs_charge_centavos,writeoff_charge_centavos,actor_id) VALUES(entry.id,p_reason,relief.cogs,relief.writeoff,auth.uid());
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason) VALUES(auth.uid(),'reverse_purchase_vat','finance_purchase_vat',entry.id,p_reason);
END $$;
-- Preserve supplier lot costs. Future recognized consumption/write-offs capture
-- the net cost; linked adjustment entries reconcile consumption before review.
CREATE OR REPLACE FUNCTION public.finance_capture_consumption_cost() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE batch stock_batches; ratio numeric:=0;
BEGIN
 IF NEW.quantity<0 AND NEW.movement_type IN('consumption','waste','count') AND NEW.batch_id IS NOT NULL THEN
  SELECT * INTO batch FROM stock_batches WHERE id=NEW.batch_id;
  SELECT COALESCE(v.input_vat_centavos::numeric/v.gross_centavos,0) INTO ratio FROM finance_purchase_vat v WHERE v.receipt_id=batch.receipt_id AND NOT EXISTS(SELECT 1 FROM finance_purchase_vat_reversals r WHERE r.entry_id=v.id) LIMIT 1;
  NEW.unit_cost:=batch.unit_cost*(1-COALESCE(ratio,0));
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION public.finance_report(date,date) RENAME TO finance_legacy_report;
REVOKE ALL ON FUNCTION public.finance_legacy_report(date,date) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.finance_report(p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; purchase_input bigint; cogs_adjustment bigint; writeoff_adjustment bigint; writeoffs bigint; input_vat bigint;
BEGIN
 result:=finance_legacy_report(p_from,p_to);
 SELECT COALESCE(sum(input_vat_centavos),0),COALESCE(sum(cogs_relief_centavos),0),COALESCE(sum(writeoff_relief_centavos),0) INTO purchase_input,cogs_adjustment,writeoff_adjustment FROM finance_purchase_vat WHERE business_date BETWEEN p_from AND p_to;
 SELECT purchase_input-COALESCE(sum(v.input_vat_centavos),0),cogs_adjustment-COALESCE(sum(r.cogs_charge_centavos),0),writeoff_adjustment-COALESCE(sum(r.writeoff_charge_centavos),0) INTO purchase_input,cogs_adjustment,writeoff_adjustment FROM finance_purchase_vat_reversals r JOIN finance_purchase_vat v ON v.id=r.entry_id WHERE r.business_date BETWEEN p_from AND p_to;
 SELECT round(COALESCE(sum(abs(quantity)*unit_cost),0)*100)::bigint-writeoff_adjustment INTO writeoffs FROM stock_movements WHERE quantity<0 AND movement_type IN('waste','count') AND (created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to;
 input_vat:=(result->>'input_vat')::bigint+purchase_input;
 RETURN result||jsonb_build_object('cogs',(result->>'cogs')::bigint-cogs_adjustment,'stock_writeoffs',writeoffs,
  'operating_profit',(result->>'operating_profit')::bigint+cogs_adjustment-writeoffs,'input_vat',input_vat,'purchase_input_vat',purchase_input,'vat_balance',(result->>'output_vat')::bigint-input_vat,
  'stock_writeoff_cost_unknown',(SELECT count(*) FROM stock_movements WHERE quantity<0 AND movement_type IN('waste','count') AND unit_cost IS NULL AND (created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to),
  'inventory_value', (SELECT round(COALESCE(sum(b.quantity*b.unit_cost*(1-COALESCE((SELECT v.input_vat_centavos::numeric/v.gross_centavos FROM finance_purchase_vat v WHERE v.receipt_id=b.receipt_id AND NOT EXISTS(SELECT 1 FROM finance_purchase_vat_reversals r WHERE r.entry_id=v.id) LIMIT 1),0))),0)*100) FROM stock_batches b),
  'purchases',COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY created_at DESC) FROM (SELECT g.id,g.reference,g.created_at,p.number purchase_number,s.name supplier,finance_receipt_gross(g.id) gross_centavos,
    (SELECT to_jsonb(v)||jsonb_build_object('reversed',EXISTS(SELECT 1 FROM finance_purchase_vat_reversals r WHERE r.entry_id=v.id)) FROM finance_purchase_vat v WHERE v.receipt_id=g.id ORDER BY v.created_at DESC,v.id LIMIT 1) vat_review
   FROM goods_receipts g LEFT JOIN purchase_orders p ON p.id=g.purchase_order_id LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE (g.created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to ORDER BY g.created_at DESC,g.id LIMIT 100) q),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.finance_receipt_gross(uuid),public.finance_purchase_relief(uuid,numeric),public.finance_review_purchase_vat(jsonb),public.finance_reverse_purchase_vat(uuid,text),public.finance_report(date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_review_purchase_vat(jsonb),public.finance_reverse_purchase_vat(uuid,text),public.finance_report(date,date) TO authenticated,service_role;
