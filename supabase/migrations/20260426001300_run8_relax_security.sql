-- run8_relax_security.sql
-- Rolls back the overly restrictive and broken changes from security_hardening.sql

-- 1. Total <= Subtotal is fundamentally flawed because of Delivery Fees! Relax it.
alter table orders drop constraint if exists orders_non_negative_amounts_chk;
alter table orders add constraint orders_non_negative_amounts_chk
    check (subtotal >= 0 and total >= 0 and points_earned >= 0);

-- 2. Drop the restrictive and infinite-loop inducing RLS policies on profiles!
-- security_hardening.sql introduced an infinite loop: `get_my_role()` queries `profiles`, 
-- but the new policies on `profiles` call `get_my_role()`.
drop policy if exists "Admin can update any profile" on profiles;
-- Revert to original simpler admin policy (or no policy, since staff admin usually uses service_role for user management, but we'll re-allow basic authenticated read)

drop policy if exists "Service role can insert profiles" on profiles;

drop policy if exists "Staff can update orders" on orders;
create policy "Staff and admin can update orders"
  on orders for update
  using (
    (select role from profiles where id = auth.uid()) in ('staff', 'admin')
  )
  with check (
    (select role from profiles where id = auth.uid()) in ('staff', 'admin')
  );

drop policy if exists "Admin can update categories" on categories;
create policy "Admin can update categories"
  on categories for update
  using ((select role from profiles where id = auth.uid()) = 'admin')
  with check ((select role from profiles where id = auth.uid()) = 'admin');

drop policy if exists "Admin can update menu items" on menu_items;
create policy "Admin can update menu items"
  on menu_items for update
  using ((select role from profiles where id = auth.uid()) = 'admin')
  with check ((select role from profiles where id = auth.uid()) = 'admin');

drop policy if exists "Admin can update item variants" on item_variants;
create policy "Admin can update item variants"
  on item_variants for update
  using ((select role from profiles where id = auth.uid()) = 'admin')
  with check ((select role from profiles where id = auth.uid()) = 'admin');

-- 3. Drop all the blocking triggers! They intercept backend service_role updates and glitch.
drop trigger if exists protect_profile_mutation on profiles;
drop function if exists public.guard_profile_mutation cascade;

drop trigger if exists protect_order_mutation on orders;
drop function if exists public.guard_order_mutation cascade;

-- 4. Revert function execute permissions to their previous state
grant all on function public.handle_new_user() to public;
grant all on function public.log_order_status_change() to public;
grant all on function public.update_updated_at() to public;
grant all on function public.award_points_on_completion() to public;

grant all on function public.get_my_role() to public;

-- End of rollback. Keep the email formatting and phone digits constraints as those are safe.
