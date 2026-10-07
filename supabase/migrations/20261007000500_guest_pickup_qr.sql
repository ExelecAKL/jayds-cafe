-- Guest mobile pickups have the same private QR capability as account pickups.
-- Keep the reviewed function and all its other checks, including delivery guards.
DO $repair$
DECLARE definition text;
  old_guard text := 'IF target=''completed'' AND o.order_source<>''pos'' AND o.customer_id IS NOT NULL THEN';
  new_guard text := 'IF target=''completed'' AND o.order_source<>''pos'' AND (o.customer_id IS NOT NULL OR o.order_type=''pickup'') THEN';
BEGIN
  definition := pg_get_functiondef('public.pos_order_action(uuid,uuid,text,text)'::regprocedure);
  IF position(new_guard IN definition)>0 THEN RETURN; END IF;
  IF position(old_guard IN definition)=0 OR position('Delivery completion is confirmed by the courier' IN definition)=0 THEN
    RAISE EXCEPTION 'Apply the reviewed pickup/delivery function before the guest pickup correction';
  END IF;
  EXECUTE replace(definition,old_guard,new_guard);
END;
$repair$;
