-- Calculate the same zero-filled weekday/trailing forecasts from one usage scan.
CREATE OR REPLACE FUNCTION public.inv_refresh_forecasts() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM inv_require_admin();
 PERFORM pg_advisory_xact_lock(8712341);
 WITH usage AS MATERIALIZED (
  SELECT ingredient_id,business_date,sum(quantity) quantity,bool_or(estimated) estimated
  FROM inventory_daily_usage GROUP BY ingredient_id,business_date
 ), metadata AS (
  SELECT i.id,COALESCE(LEAST(56,GREATEST(0,inv_business_date()-min(u.business_date))),0) days,
   COALESCE(bool_or(u.estimated) FILTER(WHERE u.business_date>=inv_business_date()-56),false) estimated
  FROM ingredients i LEFT JOIN usage u ON u.ingredient_id=i.id WHERE i.is_active GROUP BY i.id
 ), samples AS (
  SELECT m.id,m.days,m.estimated,f.offset_day,avg(COALESCE(u.quantity,0)) quantity
  FROM metadata m CROSS JOIN generate_series(1,30) f(offset_day)
  CROSS JOIN LATERAL generate_series(1,CASE WHEN m.days>=28 THEN LEAST(m.days,56) ELSE 14 END) d(past_day)
  LEFT JOIN usage u ON u.ingredient_id=m.id AND u.business_date=inv_business_date()-d.past_day
  WHERE m.days<28 OR extract(dow FROM inv_business_date()-d.past_day)=extract(dow FROM inv_business_date()+f.offset_day)
  GROUP BY m.id,m.days,m.estimated,f.offset_day
 )
 INSERT INTO inventory_forecasts(ingredient_id,horizon,demand,daily_demand,history_days,method,historical_estimate,calculated_at)
 SELECT s.id,h.horizon,sum(s.quantity),sum(s.quantity)/h.horizon,s.days,
  CASE WHEN s.days>=28 THEN 'weekday_8_weeks' ELSE 'trailing_14_days' END,s.estimated,now()
 FROM samples s CROSS JOIN (VALUES(7),(14),(30)) h(horizon) WHERE s.offset_day<=h.horizon
 GROUP BY s.id,h.horizon,s.days,s.estimated
 ON CONFLICT(ingredient_id,horizon) DO UPDATE SET demand=EXCLUDED.demand,daily_demand=EXCLUDED.daily_demand,
  history_days=EXCLUDED.history_days,method=EXCLUDED.method,historical_estimate=EXCLUDED.historical_estimate,calculated_at=EXCLUDED.calculated_at;
END $$;
