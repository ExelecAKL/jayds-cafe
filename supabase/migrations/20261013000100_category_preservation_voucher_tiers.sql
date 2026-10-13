-- Forward-only defense fixes: preserve catalog rows and enforce voucher eligibility
-- in the transaction, even if an API caller omits the preliminary tier check.
BEGIN;
ALTER TABLE public.menu_items ALTER COLUMN category_id DROP NOT NULL;
DO $$
DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN
  SELECT c.conname FROM pg_constraint c
  WHERE c.conrelid='public.menu_items'::regclass AND c.confrelid='public.categories'::regclass
    AND c.contype='f' AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.menu_items'::regclass AND attname='category_id')]
 LOOP EXECUTE format('ALTER TABLE public.menu_items DROP CONSTRAINT %I',constraint_name); END LOOP;
END $$;
ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_category_id_fkey
 FOREIGN KEY(category_id) REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE FUNCTION public.enforce_order_voucher_tier() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target text; customer_tier text;
BEGIN
 IF NEW.redeemed_voucher_id IS NULL THEN RETURN NEW; END IF;
 SELECT nullif(lower(btrim(target_tier)),'') INTO target FROM vouchers WHERE id=NEW.redeemed_voucher_id FOR SHARE;
 IF target IS NULL THEN RETURN NEW; END IF;
 IF NEW.customer_id IS NULL THEN RAISE EXCEPTION 'Sign in with an eligible loyalty tier for this voucher'; END IF;
 SELECT lower(btrim(loyalty_tier)) INTO customer_tier FROM profiles WHERE id=NEW.customer_id FOR SHARE;
 IF customer_tier IS DISTINCT FROM target THEN RAISE EXCEPTION 'This voucher requires the % loyalty tier',target; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_order_voucher_tier() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER order_voucher_tier BEFORE INSERT OR UPDATE OF redeemed_voucher_id,customer_id
 ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_order_voucher_tier();
COMMIT;
