CREATE OR REPLACE FUNCTION public.admin_export_sensitive(p_key text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT lower(regexp_replace(p_key,'([a-z])([A-Z])','\1_\2','g')) ~ '(^|_)(password|passwd|pin|token|secret|credential|authorization|cookie|signature|p256dh|auth|endpoint|session|salt|fingerprint|hash|qr|vapid)(_|$)'
 OR lower(p_key) IN('apikey','api_key','access_key','service_role_key','redirecturl','redirect_url','checkouturl','checkout_url','paymenturl','payment_url','signedurl','signed_url','storage_path','private_path');
$$;
