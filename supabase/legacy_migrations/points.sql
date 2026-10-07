-- Add customer loyalty points fields and award points on order completion

alter table profiles
  add column if not exists points int not null default 0,
  add column if not exists total_orders int not null default 0,
  add column if not exists last_check_in date;

alter table orders
  add column if not exists points_earned int not null default 0;

create or replace function award_points_on_completion()
returns trigger as $$
begin
  if new.status = 'completed' and old.status != 'completed' and new.customer_id is not null then
    update profiles
    set
      points = points + new.points_earned,
      total_orders = total_orders + 1
    where id = new.customer_id;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_order_completed on orders;

create trigger on_order_completed
  after update on orders
  for each row execute function award_points_on_completion();
