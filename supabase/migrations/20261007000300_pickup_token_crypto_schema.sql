-- Checkout pins its search_path to public. Supabase installs pgcrypto in
-- extensions, so the legacy trigger's unqualified call fails for account orders.
CREATE OR REPLACE FUNCTION public.generate_pickup_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    INSERT INTO public.pickup_tokens (order_id, token_hash)
    VALUES (NEW.id, pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
