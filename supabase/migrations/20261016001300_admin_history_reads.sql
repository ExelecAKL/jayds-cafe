-- Keep recent timelines bounded before RLS checks, and avoid thousands of
-- repeated nested REST joins while loading the purchasing workspace.
CREATE INDEX admin_movement_timeline ON public.stock_movements(created_at DESC,id DESC);
CREATE INDEX admin_movement_source ON public.stock_movements(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX admin_purchase_lines_order ON public.purchase_order_lines(purchase_order_id);
CREATE INDEX admin_purchase_lines_stock ON public.purchase_order_lines(ingredient_id);
CREATE INDEX admin_receipt_timeline ON public.goods_receipts(created_at DESC,id DESC);
CREATE INDEX admin_count_timeline ON public.stocktakes(created_at DESC,id DESC);
CREATE INDEX admin_audit_timeline ON public.admin_audit(created_at DESC,id DESC);
CREATE INDEX admin_positive_lots ON public.stock_batches(expires_on,id) WHERE quantity>0;
CREATE FUNCTION public.admin_purchase_orders() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM finance_require_admin();
 WITH lines AS MATERIALIZED (
  SELECT purchase_order_id,jsonb_agg(to_jsonb(l) ORDER BY l.id) rows
  FROM purchase_order_lines l GROUP BY purchase_order_id
 ) SELECT COALESCE(jsonb_agg(to_jsonb(p)||jsonb_build_object('supplier',to_jsonb(s),'lines',COALESCE(l.rows,'[]')) ORDER BY p.created_at DESC,p.id),'[]')
 INTO result FROM purchase_orders p LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN lines l ON l.purchase_order_id=p.id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_purchase_orders() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_purchase_orders() TO authenticated,service_role;
ANALYZE public.stock_movements;
ANALYZE public.order_stock_requirements;
ANALYZE public.stock_batches;
ANALYZE public.purchase_orders;
ANALYZE public.purchase_order_lines;
