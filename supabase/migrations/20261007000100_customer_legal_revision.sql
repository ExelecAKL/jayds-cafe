-- Publish a new legal version without rewriting historical acknowledgements or orders.
ALTER TABLE public.legal_acknowledgements
  DROP CONSTRAINT legal_acknowledgements_version_check;
ALTER TABLE public.legal_acknowledgements
  ADD CONSTRAINT legal_acknowledgements_version_check
  CHECK (version IN ('2026-10-03', '2026-10-07'));

CREATE OR REPLACE FUNCTION public.customer_signup_legal_ack()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE acknowledged_version text := NEW.raw_user_meta_data->>'jayds_legal_version';
BEGIN
  -- Record only the exact published version actually supplied at signup.
  -- Historical accounts and unrecognised versions receive no inferred acceptance.
  IF acknowledged_version IN ('2026-10-03', '2026-10-07')
    AND EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.id) THEN
    INSERT INTO public.legal_acknowledgements(user_id,version,source)
      VALUES(NEW.id,acknowledged_version,'signup') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.customer_signup_legal_ack() FROM PUBLIC,anon,authenticated;
