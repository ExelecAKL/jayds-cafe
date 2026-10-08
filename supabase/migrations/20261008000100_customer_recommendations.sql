-- Private read model only. No business records or balances are changed.
CREATE INDEX IF NOT EXISTS orders_customer_completed_history
 ON public.orders(customer_id,created_at DESC,id)
 WHERE status='completed' AND payment_status='paid' AND NOT is_parked;

CREATE FUNCTION public.get_customer_recommendation_history(p_customer uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH eligible AS (
   SELECT id,created_at FROM orders
   WHERE customer_id=p_customer AND status='completed' AND payment_status='paid' AND NOT is_parked
 ), purchases AS (
   SELECT DISTINCT o.id,o.created_at,i.menu_item_id
   FROM eligible o JOIN order_items i ON i.order_id=o.id WHERE i.menu_item_id IS NOT NULL
 ), stats AS (
   SELECT menu_item_id,count(*) purchase_count,
     sum(power(0.5,GREATEST(0,extract(epoch FROM (now()-created_at))/86400)/60)) weight
   FROM purchases GROUP BY menu_item_id
 ), latest AS (
   SELECT DISTINCT ON (i.menu_item_id) i.menu_item_id,i.name,i.price,i.variants,o.created_at last_order_at
   FROM eligible o JOIN order_items i ON i.order_id=o.id WHERE i.menu_item_id IS NOT NULL
   ORDER BY i.menu_item_id,o.created_at DESC,o.id DESC,i.created_at DESC,i.id DESC
 )
 SELECT jsonb_build_object('hasOrderHistory',EXISTS(SELECT 1 FROM eligible),
   'products',COALESCE((SELECT jsonb_agg(to_jsonb(l)||jsonb_build_object('purchase_count',s.purchase_count,'weight',s.weight)
     ORDER BY l.last_order_at DESC,l.menu_item_id) FROM latest l JOIN stats s USING(menu_item_id)),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.get_customer_recommendation_history(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_recommendation_history(uuid) TO service_role;
