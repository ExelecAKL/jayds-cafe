-- Expand current recipes only for legacy orders with no accepted stock snapshot.
CREATE OR REPLACE VIEW public.inventory_daily_usage AS
WITH legacy_orders AS MATERIALIZED (
 SELECT id,created_at FROM orders o WHERE o.status='completed'
 AND NOT EXISTS(SELECT 1 FROM order_stock_requirements r WHERE r.order_id=o.id)
)
SELECT (COALESCE(o.pickup_window_start,o.created_at) AT TIME ZONE 'Asia/Manila')::date business_date,r.ingredient_id,sum(r.quantity) quantity,false estimated
FROM orders o JOIN order_stock_requirements r ON r.order_id=o.id WHERE o.status='completed' GROUP BY 1,2
UNION ALL
SELECT (o.created_at AT TIME ZONE 'Asia/Manila')::date,r.ingredient_id,sum(r.quantity),true
FROM legacy_orders o JOIN order_items oi ON oi.order_id=o.id
CROSS JOIN LATERAL inv_requirements(oi.menu_item_id,COALESCE(oi.variants,'[]'),oi.quantity) r GROUP BY 1,2;
