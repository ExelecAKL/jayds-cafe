-- Read-only Sales Reports use complete server aggregates and Philippine dates.
CREATE INDEX orders_admin_paid_report ON public.orders(created_at,id)
WHERE payment_status='paid' AND status IN('confirmed','preparing','ready','completed') AND NOT coalesce(is_parked,false) AND NOT coalesce(payment_review_required,false);

CREATE FUNCTION public.admin_sales_report(p_period text DEFAULT 'today',p_at timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE local_at timestamp; local_start timestamp; previous_start timestamp; previous_end timestamp; from_at timestamptz; before_at timestamptz; result jsonb; unit text;
BEGIN
 PERFORM finance_require_admin();
 IF p_period IS NULL OR p_period NOT IN('today','week','month','year') OR p_at IS NULL OR NOT isfinite(p_at) THEN RAISE EXCEPTION 'Choose Today, This week, This month or This year'; END IF;
 local_at:=p_at AT TIME ZONE 'Asia/Manila'; unit:=CASE p_period WHEN 'today' THEN 'day' ELSE p_period END;
 local_start:=date_trunc(unit,local_at);
 previous_start:=local_start-CASE p_period WHEN 'today' THEN interval '1 day' WHEN 'week' THEN interval '1 week' WHEN 'month' THEN interval '1 month' ELSE interval '1 year' END;
 previous_end:=least(local_start,previous_start+(local_at-local_start));
 from_at:=local_start AT TIME ZONE 'Asia/Manila';before_at:=previous_start AT TIME ZONE 'Asia/Manila';
 WITH eligible AS MATERIALIZED (
  SELECT id,total,created_at,created_at AT TIME ZONE 'Asia/Manila' local_created FROM orders
  WHERE created_at>=before_at AND created_at<p_at AND payment_status='paid' AND status IN('confirmed','preparing','ready','completed')
    AND NOT coalesce(is_parked,false) AND NOT coalesce(payment_review_required,false)
 ), current_sales AS MATERIALIZED (SELECT * FROM eligible WHERE created_at>=from_at),
 buckets AS (
  SELECT d bucket FROM generate_series(local_start,date_trunc(CASE WHEN p_period='today' THEN 'hour' WHEN p_period='year' THEN 'month' ELSE 'day' END,local_at),
    CASE WHEN p_period='today' THEN interval '1 hour' WHEN p_period='year' THEN interval '1 month' ELSE interval '1 day' END) d
 ), grouped_sales AS (
  SELECT date_trunc(CASE WHEN p_period='today' THEN 'hour' WHEN p_period='year' THEN 'month' ELSE 'day' END,local_created) bucket,sum(total) revenue,count(*) orders FROM current_sales GROUP BY 1
 ), chart AS (
  SELECT b.bucket,CASE WHEN p_period='today' THEN to_char(b.bucket,'HH24:MI') WHEN p_period='year' THEN to_char(b.bucket,'Mon') ELSE to_char(b.bucket,'Mon DD') END label,coalesce(g.revenue,0) revenue,coalesce(g.orders,0) orders
  FROM buckets b LEFT JOIN grouped_sales g USING(bucket)
  WHERE p_period<>'today' OR extract(hour FROM b.bucket) BETWEEN 13 AND 21 OR coalesce(g.orders,0)>0
 ), items AS MATERIALIZED (
  SELECT coalesce(oi.menu_item_id::text,'legacy:'||oi.name) item_key,coalesce(m.name,oi.name) name,oi.quantity,oi.subtotal
  FROM order_items oi JOIN current_sales o ON o.id=oi.order_id LEFT JOIN menu_items m ON m.id=oi.menu_item_id
 ), best AS (
  SELECT item_key,min(name) name,sum(quantity) qty,sum(subtotal) revenue FROM items GROUP BY item_key ORDER BY sum(quantity) DESC,item_key LIMIT 10
 ), traffic AS (SELECT extract(dow FROM local_created)::integer AS weekday_idx,extract(hour FROM local_created)::integer AS hour_idx,count(*) orders FROM current_sales GROUP BY 1,2),
 recipe_costs AS (
  SELECT r.menu_item_id,sum(r.quantity_used*i.cost_per_unit) cost FROM menu_item_ingredients r JOIN ingredients i ON i.id=r.ingredient_id GROUP BY r.menu_item_id
 ), pricing AS (
  SELECT m.id,m.name,m.price,c.cost,m.price-c.cost profit,CASE WHEN m.price>0 THEN (m.price-c.cost)/m.price*100 ELSE 0 END margin
  FROM menu_items m JOIN recipe_costs c ON c.menu_item_id=m.id WHERE m.status='active' AND c.cost>0
 )
 SELECT jsonb_build_object('period',p_period,'start',from_at,'end',p_at,'timezone','Asia/Manila','opening_hour',13,'closing_hour',22,
  'revenue',coalesce((SELECT sum(total) FROM current_sales),0),'orders',(SELECT count(*) FROM current_sales),
  'previous_revenue',coalesce((SELECT sum(total) FROM eligible WHERE created_at>=before_at AND created_at<previous_end AT TIME ZONE 'Asia/Manila'),0),
  'chart',coalesce((SELECT jsonb_agg(to_jsonb(c)-'bucket' ORDER BY bucket) FROM chart c),'[]'),
  'best_sellers',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY qty DESC,item_key) FROM best b),'[]'),
  'heatmap',(SELECT jsonb_agg(hour_counts ORDER BY weekday) FROM (SELECT d.weekday,(SELECT jsonb_agg(coalesce(t.orders,0) ORDER BY h.hour_idx) FROM generate_series(13,21) h(hour_idx) LEFT JOIN traffic t ON t.weekday_idx=d.weekday AND t.hour_idx=h.hour_idx) hour_counts FROM generate_series(0,6) d(weekday)) grid),
  'margins',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY margin DESC,id) FROM pricing p),'[]')) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.admin_sales_orders(p_start timestamptz,p_end timestamptz,p_weekday integer DEFAULT NULL,p_hour integer DEFAULT NULL,p_page integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM finance_require_admin();
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<p_start OR p_end-p_start>interval '400 days' OR coalesce(p_page,0)<0 OR coalesce(p_weekday,0) NOT BETWEEN 0 AND 6 OR coalesce(p_hour,0) NOT BETWEEN 0 AND 23 THEN RAISE EXCEPTION 'Choose a valid report range'; END IF;
 WITH matching AS MATERIALIZED (
  SELECT o.id,o.order_number,o.total,o.created_at,jsonb_build_object('full_name',p.full_name) customer
  FROM orders o LEFT JOIN profiles p ON p.id=o.customer_id
  WHERE o.created_at>=p_start AND o.created_at<p_end AND o.payment_status='paid' AND o.status IN('confirmed','preparing','ready','completed') AND NOT coalesce(o.is_parked,false) AND NOT coalesce(o.payment_review_required,false)
  AND (p_weekday IS NULL OR extract(dow FROM o.created_at AT TIME ZONE 'Asia/Manila')=p_weekday)
  AND (p_hour IS NULL OR extract(hour FROM o.created_at AT TIME ZONE 'Asia/Manila')=p_hour)
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'revenue',coalesce((SELECT sum(total) FROM matching),0),
 'orders',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY created_at DESC,id) FROM (SELECT * FROM matching ORDER BY created_at DESC,id LIMIT 10 OFFSET (coalesce(p_page,0)::bigint*10)) x),'[]')) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.admin_sales_item(p_start timestamptz,p_end timestamptz,p_item_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM finance_require_admin();
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<p_start OR p_end-p_start>interval '400 days' OR p_item_key IS NULL THEN RAISE EXCEPTION 'Choose a valid report range and product'; END IF;
 WITH items AS MATERIALIZED (
  SELECT oi.quantity,oi.subtotal,oi.variants,extract(hour FROM o.created_at AT TIME ZONE 'Asia/Manila')::integer AS hour_idx
  FROM order_items oi JOIN orders o ON o.id=oi.order_id
  WHERE o.created_at>=p_start AND o.created_at<p_end AND o.payment_status='paid' AND o.status IN('confirmed','preparing','ready','completed') AND NOT coalesce(o.is_parked,false) AND NOT coalesce(o.payment_review_required,false)
  AND coalesce(oi.menu_item_id::text,'legacy:'||oi.name)=p_item_key
 ), hourly AS (SELECT hour_idx,sum(quantity) qty FROM items GROUP BY hour_idx),
 extras AS (SELECT v->>'label' name,sum(i.quantity) qty FROM items i CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.variants)='array' THEN i.variants ELSE '[]' END) v WHERE v->>'variant_group'='add_on' GROUP BY v->>'label')
 SELECT jsonb_build_object('total_sold',coalesce((SELECT sum(quantity) FROM items),0),'revenue',coalesce((SELECT sum(subtotal) FROM items),0),
 'hourly',coalesce((SELECT jsonb_agg(jsonb_build_object('hour',hour_idx||':00','qty',qty) ORDER BY hour_idx) FROM hourly),'[]'),
 'addons',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY qty DESC,name) FROM extras e),'[]')) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_sales_report(text,timestamptz),public.admin_sales_orders(timestamptz,timestamptz,integer,integer,integer),public.admin_sales_item(timestamptz,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_sales_report(text,timestamptz),public.admin_sales_orders(timestamptz,timestamptz,integer,integer,integer),public.admin_sales_item(timestamptz,timestamptz,text) TO authenticated,service_role;

-- Overview collections and daily bars use the same valid paid-order rule.
CREATE OR REPLACE FUNCTION public.inv_dashboard(p_days integer DEFAULT 7) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM finance_require_admin();
 IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Choose a valid reporting period'; END IF;
 WITH received AS MATERIALIZED(SELECT * FROM orders WHERE NOT coalesce(is_parked,false) AND (created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN inv_business_date()-p_days+1 AND inv_business_date() AND created_at<=now()),
 paid AS MATERIALIZED(SELECT * FROM received WHERE payment_status='paid' AND status IN('confirmed','preparing','ready','completed') AND NOT coalesce(payment_review_required,false)),
 daily AS(SELECT (created_at AT TIME ZONE 'Asia/Manila')::date business_date,sum(total) revenue FROM paid GROUP BY 1)
 SELECT jsonb_build_object('revenue',coalesce((SELECT sum(total) FROM paid),0),'orders',(SELECT count(*) FROM received),'average',coalesce((SELECT avg(total) FROM paid),0),
 'active',(SELECT count(*) FROM orders WHERE status IN('pending','confirmed','preparing','ready') AND NOT coalesce(is_parked,false)),
 'stock_conflicts',(SELECT count(*) FROM orders WHERE stock_conflict AND status IN('pending','confirmed') AND NOT coalesce(is_parked,false)),
 'days',(SELECT jsonb_agg(jsonb_build_object('date',d.business_date,'revenue',coalesce(s.revenue,0)) ORDER BY d.business_date) FROM (SELECT inv_business_date()-p_days+n business_date FROM generate_series(1,p_days) n) d LEFT JOIN daily s USING(business_date))) INTO result;
 RETURN result;
END $$;
