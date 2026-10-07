-- Security hardening for CafeOS
-- Focus:
-- 1. Prevent role / loyalty stat escalation through self-updates
-- 2. Prevent client-side tampering of protected order/payment fields
-- 3. Tighten overly broad RLS WITH CHECK clauses
-- 4. Add baseline integrity constraints for common abuse cases

drop policy if exists "Service role can insert profiles" on profiles;
create policy "Service role can insert profiles"
  on profiles for insert
  with check (auth.role() = 'service_role');

drop policy if exists "Admin can update any profile" on profiles;
create policy "Admin can update any profile"
  on profiles for update
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

drop policy if exists "Staff can update orders" on orders;
drop policy if exists "Staff and admin can update orders" on orders;
create policy "Staff can update orders"
  on orders for update
  using (get_my_role() in ('staff', 'admin'))
  with check (get_my_role() in ('staff', 'admin'));

drop policy if exists "Admin can update categories" on categories;
create policy "Admin can update categories"
  on categories for update
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

drop policy if exists "Admin can update menu items" on menu_items;
create policy "Admin can update menu items"
  on menu_items for update
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

drop policy if exists "Admin can update item variants" on item_variants;
create policy "Admin can update item variants"
  on item_variants for update
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

drop policy if exists "Admin can update vouchers" on vouchers;
create policy "Admin can update vouchers"
  on vouchers for update
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create or replace function public.guard_profile_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role user_role;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Allow trusted nested trigger updates such as loyalty awards on order completion.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if auth.role() = 'service_role' then
    return new;
  end if;

  actor_role := get_my_role();

  if actor_role = 'admin' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only admins can change roles';
  end if;

  if new.points is distinct from old.points
     or new.total_orders is distinct from old.total_orders
     or new.last_check_in is distinct from old.last_check_in then
    raise exception 'Only trusted backend processes can change loyalty fields';
  end if;

  if new.email is distinct from old.email then
    raise exception 'Email must be changed through Supabase Auth';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_mutation on profiles;
create trigger protect_profile_mutation
  before update on profiles
  for each row execute function public.guard_profile_mutation();

create or replace function public.guard_order_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role user_role;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if auth.role() = 'service_role' then
    return new;
  end if;

  actor_role := get_my_role();

  if actor_role not in ('staff', 'admin') then
    return new;
  end if;

  if new.order_number is distinct from old.order_number
     or new.customer_id is distinct from old.customer_id
     or new.order_type is distinct from old.order_type
     or new.payment_method is distinct from old.payment_method
     or new.subtotal is distinct from old.subtotal
     or new.total is distinct from old.total
     or new.points_earned is distinct from old.points_earned
     or new.maya_checkout_id is distinct from old.maya_checkout_id
     or new.maya_payment_id is distinct from old.maya_payment_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Protected order fields cannot be changed from client sessions';
  end if;

  if old.payment_method = 'maya'
     and new.payment_status is distinct from old.payment_status then
    raise exception 'Only the trusted backend can update Maya payment status';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_order_mutation on orders;
create trigger protect_order_mutation
  before update on orders
  for each row execute function public.guard_order_mutation();

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_email_not_blank_chk'
  ) then
    alter table profiles
      add constraint profiles_email_not_blank_chk
      check (length(trim(email)) > 3);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_email_format_chk'
  ) then
    alter table profiles
      add constraint profiles_email_format_chk
      check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_phone_digits_chk'
  ) then
    alter table profiles
      add constraint profiles_phone_digits_chk
      check (
        phone is null
        or length(regexp_replace(phone, '\D', '', 'g')) between 10 and 15
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_non_negative_amounts_chk'
  ) then
    alter table orders
      add constraint orders_non_negative_amounts_chk
      check (subtotal >= 0 and total >= 0 and points_earned >= 0 and total <= subtotal);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_maya_checkout_id_scope_chk'
  ) then
    alter table orders
      add constraint orders_maya_checkout_id_scope_chk
      check (maya_checkout_id is null or payment_method = 'maya');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_maya_payment_id_scope_chk'
  ) then
    alter table orders
      add constraint orders_maya_payment_id_scope_chk
      check (maya_payment_id is null or payment_method = 'maya');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vouchers_code_format_chk'
  ) then
    alter table vouchers
      add constraint vouchers_code_format_chk
      check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,32}$');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vouchers_discount_valid_chk'
  ) then
    alter table vouchers
      add constraint vouchers_discount_valid_chk
      check (
        discount_value > 0
        and min_order_amount >= 0
        and (max_uses is null or max_uses > 0)
        and (valid_until is null or valid_from is null or valid_until >= valid_from)
      );
  end if;
end $$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.log_order_status_change() from public;
revoke all on function public.update_updated_at() from public;
revoke all on function public.award_points_on_completion() from public;
revoke all on function public.guard_profile_mutation() from public;
revoke all on function public.guard_order_mutation() from public;

revoke all on function public.get_my_role() from public;
grant execute on function public.get_my_role() to anon, authenticated, service_role;
