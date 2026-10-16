CREATE TABLE public.finance_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES profiles(id),
 storage_path text NOT NULL UNIQUE, byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
 linked_entity text CHECK(linked_entity IN('expense','purchase_vat')), linked_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz DEFAULT now()+interval '24 hours',
 CHECK((linked_id IS NULL AND linked_entity IS NULL AND expires_at IS NOT NULL) OR (linked_id IS NOT NULL AND linked_entity IS NOT NULL AND expires_at IS NULL))
);
ALTER TABLE public.finance_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_documents_admin ON public.finance_documents FOR SELECT TO authenticated USING(finance_admin() AND (linked_id IS NOT NULL OR actor_id=auth.uid() AND expires_at>now()));
GRANT SELECT ON public.finance_documents TO authenticated;
GRANT ALL ON public.finance_documents TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('jayds-finance-documents','jayds-finance-documents',false,5242880,ARRAY['image/webp']) ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.finance_expenses ADD COLUMN document_id uuid REFERENCES finance_documents(id);
-- Keep the immutable expense insert and document link in one transaction.
ALTER FUNCTION public.finance_post_expense(jsonb) RENAME TO finance_legacy_post_expense;
REVOKE ALL ON FUNCTION public.finance_legacy_post_expense(jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- The legacy insert uses the new column without editing an immutable posted row.
CREATE FUNCTION public.finance_expense_document() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN NEW.document_id:=NULLIF(current_setting('jayds.expense_document',true),'')::uuid; RETURN NEW; END $$;
-- Resolve the matching uploaded document from the fingerprinted insert payload.
-- A wrapper-local setting is transaction scoped and cannot leak into a later request.
CREATE FUNCTION public.finance_post_expense(p_expense jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved uuid; doc uuid:=NULLIF(p_expense->>'document_id','')::uuid; d finance_documents; previous text:=COALESCE(current_setting('jayds.expense_document',true),'');
BEGIN
 PERFORM finance_require_admin();
 IF round(COALESCE((p_expense->>'input_vat')::numeric,0)*100)>round((p_expense->>'amount')::numeric*100*12/112) THEN RAISE EXCEPTION 'Input VAT exceeds the VAT-inclusive expense total'; END IF;
 IF COALESCE((p_expense->>'input_vat')::numeric,0)>0 AND doc IS NULL THEN RAISE EXCEPTION 'Upload the supporting invoice before claiming input VAT'; END IF;
 IF doc IS NOT NULL THEN
  SELECT * INTO d FROM finance_documents WHERE id=doc FOR UPDATE;
  IF NOT FOUND OR (d.linked_id IS NULL AND (d.actor_id IS DISTINCT FROM auth.uid() OR d.expires_at<=now())) THEN RAISE EXCEPTION 'The invoice upload is unavailable. Upload it again'; END IF;
 END IF;
 PERFORM set_config('jayds.expense_document',COALESCE(doc::text,''),true);
 saved:=finance_legacy_post_expense(p_expense);
 PERFORM set_config('jayds.expense_document',previous,true);
 IF doc IS NOT NULL THEN
  IF d.linked_id IS NOT NULL AND (d.linked_entity<>'expense' OR d.linked_id<>saved) THEN RAISE EXCEPTION 'This document is already linked to another entry'; END IF;
  UPDATE finance_documents SET linked_entity='expense',linked_id=saved,expires_at=NULL WHERE id=doc;
 END IF;
 RETURN saved;
END $$;
CREATE TRIGGER finance_expense_document BEFORE INSERT ON public.finance_expenses FOR EACH ROW EXECUTE FUNCTION public.finance_expense_document();
REVOKE ALL ON FUNCTION public.finance_expense_document(),public.finance_post_expense(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_post_expense(jsonb) TO authenticated,service_role;
