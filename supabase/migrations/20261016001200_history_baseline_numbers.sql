-- JSON transports may change 500.000000 to 500.0. Compare values, not scale.
CREATE FUNCTION public.cafe_history_normalize(p_value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 CASE jsonb_typeof(p_value)
 WHEN 'object' THEN SELECT COALESCE(jsonb_object_agg(key,cafe_history_normalize(value)),'{}') INTO result FROM jsonb_each(p_value);
 WHEN 'array' THEN SELECT COALESCE(jsonb_agg(cafe_history_normalize(value) ORDER BY ordinality),'[]') INTO result FROM jsonb_array_elements(p_value) WITH ORDINALITY;
 WHEN 'number' THEN result:=to_jsonb(trim_scale((p_value#>>'{}')::numeric));
 ELSE result:=p_value;
 END CASE;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.cafe_history_table_hash(p_table text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET timezone='UTC' AS $$
DECLARE result text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted history server required' USING ERRCODE='42501'; END IF;
 IF p_table NOT IN('profiles','ingredients','stock_batches','menu_items','categories','item_variants','menu_item_ingredients','variant_ingredients','customer_provider_attempts','customer_push_outbox','finance_invoices','stock_reservations') THEN RAISE EXCEPTION 'Unsupported baseline table'; END IF;
 EXECUTE format('SELECT md5(COALESCE(string_agg(md5(row_value::text),'''' ORDER BY row_value::text),'''')) FROM (SELECT cafe_history_normalize(to_jsonb(t)) row_value FROM public.%I t) normalized',p_table) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.cafe_history_normalize(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cafe_history_normalize(jsonb) TO service_role;
