BEGIN;
-- Approval applies to direct inventory RPCs and RLS as well as HTTP routes.
-- CREATE OR REPLACE retains the existing helper owner, ACL, and trusted paths.
CREATE OR REPLACE FUNCTION public.inv_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(auth.role()='service_role',false)
    OR (session_user='postgres' AND auth.role() IS NULL)
    OR EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND is_approved=true);
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
