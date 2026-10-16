-- Read-only quote checks. Payment/order entrypoints still revalidate transactionally.
CREATE FUNCTION public.finance_check_quote(p_items jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; r record; enabled boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted quote server required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Add valid items before requesting a quote'; END IF;
 SELECT enforcement_enabled INTO enabled FROM inventory_settings WHERE id;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF COALESCE(jsonb_typeof(item->'variants'),'')<>'array' OR (item->>'quantity')::numeric<1 OR (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric) THEN RAISE EXCEPTION 'Invalid quantity or options'; END IF;
  IF EXISTS(SELECT 1 FROM item_variants v WHERE v.menu_item_id=(item->>'menu_item_id')::uuid AND v.variant_group<>'add_on' AND (v.applicable_items IS NULL OR v.applicable_items ? (item->>'menu_item_id')) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item->'variants') x WHERE x->>'variant_group'=v.variant_group)) THEN RAISE EXCEPTION 'Choose all required product options'; END IF;
  IF NOT (get_item_availability((item->>'menu_item_id')::uuid,item->'variants',(item->>'quantity')::integer)->>'available')::boolean THEN RAISE EXCEPTION 'An item is no longer available. Review your bag'; END IF;
 END LOOP;
 IF enabled THEN
  FOR r IN SELECT req.ingredient_id,sum(req.quantity) quantity FROM jsonb_array_elements(p_items) x CROSS JOIN LATERAL inv_requirements((x->>'menu_item_id')::uuid,x->'variants',(x->>'quantity')::integer) req GROUP BY req.ingredient_id LOOP
   IF r.quantity>(SELECT COALESCE(sum(GREATEST(0,b.quantity-b.reserved)),0) FROM stock_batches b JOIN ingredients i ON i.id=b.ingredient_id WHERE b.ingredient_id=r.ingredient_id AND i.is_active AND (b.expires_on IS NULL OR b.expires_on>=inv_business_date())) THEN RAISE EXCEPTION 'Not enough stock for the complete bag. Reduce quantities or change items'; END IF;
  END LOOP;
 END IF;
END $$;
CREATE FUNCTION public.finance_unpaid_quote(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted quote server required' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM orders WHERE id=p_order;
 IF NOT FOUND OR o.payment_status<>'pending' OR o.payment_method<>'cash' OR o.is_parked OR o.status IN('cancelled','completed') OR o.payment_review_required THEN RAISE EXCEPTION 'This ticket cannot accept cash'; END IF;
 RETURN jsonb_build_object('total',o.total,'breakdown',(SELECT breakdown FROM order_financials WHERE order_id=o.id));
END $$;
REVOKE ALL ON FUNCTION public.finance_check_quote(jsonb), public.finance_unpaid_quote(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_check_quote(jsonb), public.finance_unpaid_quote(uuid) TO service_role;
