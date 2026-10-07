CREATE FUNCTION public.get_customer_operations() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM inv_require_admin(); RETURN jsonb_build_object(
 'attempts',COALESCE((SELECT jsonb_agg(x) FROM (SELECT id,order_id,provider,state,request_key,created_at FROM customer_provider_attempts WHERE state IN('creating','uncertain','reconciliation') ORDER BY created_at DESC LIMIT 100)x),'[]'::jsonb),
 'failed_push',(SELECT count(*) FROM customer_push_outbox WHERE status='failed'),
 'open_cases',(SELECT count(*) FROM customer_support_cases WHERE status<>'resolved'));
END $$;
REVOKE ALL ON FUNCTION get_customer_operations() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION get_customer_operations() TO authenticated;
