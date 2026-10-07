-- Read-only setup diagnostics. Activation still uses inv_activate's checked transaction.
CREATE FUNCTION public.get_inventory_readiness() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM inv_require_admin();
 SELECT jsonb_build_object(
  'enforcement_enabled',(SELECT enforcement_enabled FROM inventory_settings WHERE id),
  'active_orders',(SELECT count(*) FROM orders WHERE status IN ('pending','confirmed','preparing','ready') AND NOT is_parked),
  'active_stock_items',(SELECT count(*) FROM ingredients WHERE is_active),
  'missing_recipes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'name',m.name) ORDER BY m.name)
    FROM menu_items m WHERE m.status='active' AND m.manually_available
    AND NOT EXISTS(SELECT 1 FROM menu_item_ingredients r WHERE r.menu_item_id=m.id)), '[]'::jsonb),
  'missing_counts',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'name',i.name) ORDER BY i.name)
    FROM ingredients i WHERE i.is_active AND NOT EXISTS(
      SELECT 1 FROM stocktakes s WHERE s.ingredient_id=i.id AND s.state='posted' AND s.counted=i.current_stock
      AND NOT EXISTS(SELECT 1 FROM stock_movements m WHERE m.ingredient_id=i.id AND m.created_at>s.created_at AND m.source_id IS DISTINCT FROM s.id))), '[]'::jsonb),
  'invalid_stock',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'name',i.name) ORDER BY i.name)
    FROM ingredients i WHERE i.is_active AND (i.unit NOT IN ('g','ml','pcs') OR i.current_stock<0)), '[]'::jsonb)
 ) INTO result;
 RETURN result || jsonb_build_object('ready',
  (result->>'active_orders')::integer=0 AND jsonb_array_length(result->'missing_recipes')=0
  AND jsonb_array_length(result->'missing_counts')=0 AND jsonb_array_length(result->'invalid_stock')=0);
END $$;
REVOKE ALL ON FUNCTION public.get_inventory_readiness() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_readiness() TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
