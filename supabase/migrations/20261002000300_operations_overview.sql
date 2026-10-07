CREATE FUNCTION public.inv_dashboard(p_days integer DEFAULT 7) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM inv_require_admin();
 IF p_days NOT IN (7,30) THEN RAISE EXCEPTION 'Invalid reporting period'; END IF;
 SELECT jsonb_build_object(
  'revenue',COALESCE(sum(total) FILTER(WHERE payment_status='paid' AND status<>'cancelled'),0),
  'orders',count(*),'average',COALESCE(avg(total) FILTER(WHERE payment_status='paid' AND status<>'cancelled'),0),
  'active',(SELECT count(*) FROM orders WHERE status IN ('pending','confirmed','preparing','ready') AND NOT is_parked),
  'stock_conflicts',(SELECT count(*) FROM orders WHERE stock_conflict AND status IN ('pending','confirmed')),
  'days',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',d::date,'revenue',COALESCE(s.revenue,0)) ORDER BY d)
    FROM generate_series(inv_business_date()-p_days+1,inv_business_date(),interval '1 day') d
    LEFT JOIN(SELECT (created_at AT TIME ZONE 'Asia/Manila')::date business_day,sum(total) revenue FROM orders WHERE payment_status='paid' AND status<>'cancelled' GROUP BY 1) s ON s.business_day=d::date),'[]'))
 INTO result FROM orders WHERE (created_at AT TIME ZONE 'Asia/Manila')::date>=inv_business_date()-p_days+1;
 RETURN result;
END $$;
-- BEFORE UPDATE makes RETURNING report the completed reversal, so legacy APIs cannot refund twice.
CREATE FUNCTION public.inv_return_cancelled_rewards() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE voucher_ids uuid[];
BEGIN
 IF NEW.status<>'cancelled' OR OLD.status='cancelled' OR OLD.rewards_returned THEN RETURN NEW; END IF;
 SELECT COALESCE(array_agg(DISTINCT voucher_id),'{}') INTO voucher_ids FROM (
   SELECT NEW.redeemed_voucher_id voucher_id UNION SELECT voucher_id FROM voucher_claims WHERE order_id=NEW.id
 ) v WHERE voucher_id IS NOT NULL;
 -- Submission locks vouchers before customer points; reversal uses the same order.
 PERFORM 1 FROM vouchers WHERE id=ANY(voucher_ids) ORDER BY id FOR UPDATE;
 UPDATE vouchers SET uses_count=GREATEST(0,uses_count-1) WHERE id=ANY(voucher_ids);
 IF NEW.points_redeemed>0 AND NEW.customer_id IS NOT NULL THEN UPDATE profiles SET points=points+NEW.points_redeemed WHERE id=NEW.customer_id; END IF;
 DELETE FROM voucher_claims WHERE order_id=NEW.id;
 NEW.rewards_returned:=true;
 INSERT INTO admin_audit(actor_id,action,entity,entity_id,reason,after_data) VALUES(auth.uid(),'return_rewards','orders',NEW.id,'Cancellation or expiry',jsonb_build_object('points',NEW.points_redeemed,'vouchers',voucher_ids));
 RETURN NEW;
END $$;
CREATE TRIGGER inv_return_cancelled_rewards BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.inv_return_cancelled_rewards();
REVOKE ALL ON FUNCTION public.inv_return_cancelled_rewards() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inv_return_cancelled_rewards() TO service_role;
CREATE FUNCTION public.inv_save_variant_recipes(p_group text,p_label text,p_lines jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE line jsonb;
BEGIN
 PERFORM inv_require_admin();
 IF NOT EXISTS(SELECT 1 FROM item_variants WHERE variant_group=p_group AND label=p_label) THEN RAISE EXCEPTION 'Option no longer exists'; END IF;
 PERFORM pg_advisory_xact_lock(8712342);
 DELETE FROM variant_ingredients WHERE variant_group=p_group AND variant_label=p_label;
 FOR line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
   IF (line->>'quantity_used')::numeric IS NULL OR (line->>'quantity_used')::numeric<0 OR ((line->>'quantity_used')::numeric=0 AND NULLIF(line->>'replaces_ingredient_id','') IS NULL) OR (line->>'quantity_used')::numeric::text IN ('NaN','Infinity','-Infinity') OR EXISTS(SELECT 1 FROM jsonb_each_text(COALESCE(line->'size_multipliers','{}')) x WHERE x.value::numeric<=0 OR x.value::numeric::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Positive quantities or an explicit zero-quantity replacement required'; END IF;
   INSERT INTO variant_ingredients(variant_group,variant_label,ingredient_id,quantity_used,replaces_ingredient_id,size_multipliers)
   VALUES(p_group,p_label,(line->>'ingredient_id')::uuid,(line->>'quantity_used')::numeric,NULLIF(line->>'replaces_ingredient_id','')::uuid,COALESCE(line->'size_multipliers','{}'));
 END LOOP;
 INSERT INTO admin_audit(actor_id,action,entity,reason,after_data) VALUES(auth.uid(),'save','variant_ingredients',p_group||' / '||p_label,p_lines);
END $$;
REVOKE ALL ON FUNCTION public.inv_dashboard(integer),public.inv_save_variant_recipes(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inv_dashboard(integer),public.inv_save_variant_recipes(text,text,jsonb) TO authenticated,service_role;
SELECT public.inv_refresh_forecasts();
SELECT public.inv_generate_drafts();

CREATE FUNCTION public.inv_reconcile_reservations(p_item uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o record; previous text:=COALESCE(current_setting('jayds.order_internal',true),'');
BEGIN
 PERFORM inv_require_admin(); PERFORM set_config('jayds.order_internal','1',true);
 FOR o IN SELECT id FROM orders WHERE inventory_managed AND NOT inventory_consumed AND NOT is_parked AND status IN ('pending','confirmed')
   AND (p_item IS NULL OR EXISTS(SELECT 1 FROM order_stock_requirements q WHERE q.order_id=orders.id AND q.ingredient_id=p_item))
   AND (stock_conflict OR EXISTS(SELECT 1 FROM stock_reservations r JOIN stock_batches b ON b.id=r.batch_id WHERE r.order_id=orders.id AND r.state='reserved' AND (b.expires_on<inv_business_date() OR b.reserved>b.quantity))) ORDER BY created_at,id FOR UPDATE LOOP
   BEGIN
     PERFORM inv_release(o.id); PERFORM inv_reserve(o.id); UPDATE orders SET stock_conflict=false WHERE id=o.id;
   EXCEPTION WHEN SQLSTATE 'P0001' THEN UPDATE orders SET stock_conflict=true WHERE id=o.id;
   END;
 END LOOP;
 PERFORM set_config('jayds.order_internal',previous,true);
END $$;
REVOKE ALL ON FUNCTION public.inv_reconcile_reservations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inv_reconcile_reservations(uuid) TO authenticated,service_role;

-- Evaluate options against the exact selected configuration, without disclosing requirements.
CREATE FUNCTION public.get_configuration_availability(p_item uuid,p_variants jsonb DEFAULT '[]',p_quantity integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; options jsonb; v record; config jsonb;
BEGIN
 result:=get_item_availability(p_item,p_variants,p_quantity); options:='{}';
 FOR v IN SELECT variant_group,label FROM item_variants WHERE menu_item_id=p_item LOOP
   SELECT COALESCE(jsonb_agg(x),'[]') INTO config FROM jsonb_array_elements(p_variants) x
   WHERE x->>'variant_group'<>v.variant_group OR (v.variant_group='add_on' AND x->>'label'<>v.label);
   config:=config||jsonb_build_array(jsonb_build_object('variant_group',v.variant_group,'label',v.label));
   options:=options||jsonb_build_object(v.variant_group||':'||v.label,(get_item_availability(p_item,config,p_quantity)->>'available')::boolean);
 END LOOP;
 RETURN result||jsonb_build_object('options',options);
END $$;
REVOKE ALL ON FUNCTION public.get_configuration_availability(uuid,jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_configuration_availability(uuid,jsonb,integer) TO anon,authenticated,service_role;

CREATE FUNCTION public.inv_validate_stock_master() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.current_stock::text IN ('NaN','Infinity','-Infinity') OR NEW.min_stock_alert<0 OR NEW.min_stock_alert::text IN ('NaN','Infinity','-Infinity') OR NEW.cost_per_unit<0 OR NEW.cost_per_unit::text IN ('NaN','Infinity','-Infinity') OR NEW.pack_size::text IN ('NaN','Infinity','-Infinity') OR NEW.max_stock::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Finite nonnegative stock values required'; END IF;
 IF TG_OP='INSERT' AND NEW.current_stock<>0 THEN RAISE EXCEPTION 'Create the stock item, then post a receipt'; END IF;
 IF TG_OP='UPDATE' AND NEW.unit<>OLD.unit AND (EXISTS(SELECT 1 FROM stock_batches WHERE ingredient_id=OLD.id AND quantity>0) OR EXISTS(SELECT 1 FROM menu_item_ingredients WHERE ingredient_id=OLD.id) OR EXISTS(SELECT 1 FROM variant_ingredients WHERE ingredient_id=OLD.id) OR EXISTS(SELECT 1 FROM order_stock_requirements WHERE ingredient_id=OLD.id)) THEN RAISE EXCEPTION 'Base units with recipes or stock history cannot change'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inv_validate_stock_master BEFORE INSERT OR UPDATE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.inv_validate_stock_master();
CREATE FUNCTION public.inv_audit_stock_master() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP<>'UPDATE' OR (to_jsonb(NEW)-ARRAY['current_stock','cost_per_unit','stock_version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_stock','cost_per_unit','stock_version','updated_at']) THEN
  INSERT INTO admin_audit(actor_id,action,entity,entity_id,before_data,after_data) VALUES(auth.uid(),TG_OP,'ingredients',COALESCE(NEW.id,OLD.id),CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER inv_audit_stock_master AFTER INSERT OR UPDATE OR DELETE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.inv_audit_stock_master();
CREATE TRIGGER inv_audit_counts AFTER INSERT OR UPDATE ON public.stocktakes FOR EACH ROW EXECUTE FUNCTION public.inv_audit_change();
CREATE TRIGGER inv_audit_receipts AFTER INSERT ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.inv_audit_change();

CREATE TABLE public.forecast_snapshots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ingredient_id uuid REFERENCES ingredients(id),horizon integer,demand numeric,daily_demand numeric,history_days integer,method text,historical_estimate boolean,calculated_at timestamptz);
ALTER TABLE public.forecast_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_admin_read ON public.forecast_snapshots FOR SELECT TO authenticated USING(inv_admin());
GRANT SELECT ON public.forecast_snapshots TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.forecast_snapshots FROM anon,authenticated;
CREATE FUNCTION public.inv_forecast_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO forecast_snapshots(ingredient_id,horizon,demand,daily_demand,history_days,method,historical_estimate,calculated_at) VALUES(NEW.ingredient_id,NEW.horizon,NEW.demand,NEW.daily_demand,NEW.history_days,NEW.method,NEW.historical_estimate,NEW.calculated_at); RETURN NULL; END $$;
CREATE TRIGGER inv_forecast_snapshot AFTER INSERT OR UPDATE ON public.inventory_forecasts FOR EACH ROW EXECUTE FUNCTION public.inv_forecast_snapshot();
CREATE TRIGGER inv_forecast_immutable BEFORE UPDATE OR DELETE ON public.forecast_snapshots FOR EACH ROW EXECUTE FUNCTION public.inv_immutable();
-- Never permit browser writes to posted stock, even where Supabase default privileges grant them.
REVOKE ALL ON FUNCTION public.inv_validate_stock_master(),public.inv_audit_stock_master(),public.inv_forecast_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inv_validate_stock_master(),public.inv_audit_stock_master(),public.inv_forecast_snapshot() TO service_role;
