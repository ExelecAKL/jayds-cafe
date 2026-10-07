-- Close legacy direct PostgREST privileges that checked a role but not current approval.
-- This changes policies only; existing business rows, grants and checked RPCs are preserved.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_true_admin() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.customer_approved_admin();
$$;

DO $$
DECLARE p record; approval text; statement text;
BEGIN
 FOR p IN SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND (
   (tablename IN('categories','menu_items','item_variants','vouchers','loyalty_tiers') AND policyname LIKE 'Admin %') OR
   (tablename='clock_entries' AND policyname IN('Admin sees all clock entries','Staff manages own clock entries','Staff updates own clock entries')) OR
   (tablename='store_settings' AND policyname='store_settings_admin') OR
   (tablename='void_logs' AND policyname IN('void_logs_admin_read','void_logs_staff_insert')) OR
   (tablename='void_tokens' AND policyname IN('void_tokens_admin','void_tokens_staff_read','void_tokens_staff_use')) OR
   (tablename='pickup_tokens' AND policyname='pickup_tokens_staff') OR
   (tablename='guest_receipts' AND policyname='guest_receipts_staff_write') OR
   (tablename='inventory_logs' AND policyname IN('inv_logs_read','inv_logs_insert','Staff and Admin can insert logs')) OR
   (tablename='orders' AND policyname IN('Staff can view all orders','Staff and admin can view all orders','Staff and admin can insert orders','Staff can update orders','Staff and admin can update orders')) OR
   (tablename='order_items' AND policyname IN('Staff and admin can view all order items','Staff and admin can insert order items')) OR
   (tablename='order_status_history' AND policyname IN('Staff and admin can view all order status history','Staff and admin can insert order status history')) OR
   (tablename='voucher_claims' AND policyname='Admin manages voucher claims')
 ) LOOP
   approval:=CASE WHEN p.tablename IN('categories','menu_items','item_variants','vouchers','loyalty_tiers','store_settings','voucher_claims') OR
     p.policyname IN('Admin sees all clock entries','void_logs_admin_read','void_tokens_admin') THEN 'public.customer_approved_admin()' ELSE 'public.customer_approved_staff()' END;
   statement:=format('ALTER POLICY %I ON public.%I TO authenticated',p.policyname,p.tablename);
   IF p.cmd IN('ALL','SELECT','UPDATE','DELETE') THEN
     statement:=statement||format(' USING ((%s) AND %s)',COALESCE(p.qual,'true'),approval);
   END IF;
   IF p.cmd IN('ALL','INSERT','UPDATE') THEN
     statement:=statement||format(' WITH CHECK ((%s) AND %s)',COALESCE(p.with_check,p.qual,'true'),approval);
   END IF;
   EXECUTE statement;
 END LOOP;
END $$;

-- These policies mix ownership and privileged access. Keep the owner branch;
-- approval applies only to the staff/admin branch, including public broadcasts.
ALTER POLICY "System can insert notifications" ON public.notifications TO authenticated
 WITH CHECK (auth.uid()=user_id OR public.customer_approved_staff());
ALTER POLICY "System inserts voucher claims" ON public.voucher_claims TO authenticated
 WITH CHECK (auth.uid()=user_id OR public.customer_approved_admin());
ALTER POLICY shifts_read ON public.shifts TO authenticated
 USING (staff_id=auth.uid() OR public.customer_approved_admin());
ALTER POLICY shifts_write ON public.shifts TO authenticated
 USING ((staff_id=auth.uid() AND public.customer_approved_staff()) OR public.customer_approved_admin())
 WITH CHECK ((staff_id=auth.uid() AND public.customer_approved_staff()) OR public.customer_approved_admin());

COMMIT;
