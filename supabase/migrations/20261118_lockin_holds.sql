-- Spring lock-in holds: expire unpaid holds after 35 minutes, treat them as free
-- on the calendar, and email the owner when the deposit is paid (not on the hold).
create or replace function public.expire_unpaid_holds()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  update public.bookings
     set status = 'cancelled',
         notes = trim(both ' ' from coalesce(notes,'') || ' [Auto-released: deposit not paid]')
   where status = 'pending'
     and deposit_paid_at is null
     and position('Lock-in' in coalesce(package,'')) > 0
     and created_at < now() - interval '35 minutes';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_unpaid_holds() from public;
grant execute on function public.expire_unpaid_holds() to anon, authenticated, service_role;

create or replace function public.trg_expire_holds_before_insert()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.expire_unpaid_holds();
  return new;
end $$;
drop trigger if exists trg_expire_holds on public.bookings;
create trigger trg_expire_holds before insert on public.bookings
  for each statement execute function public.trg_expire_holds_before_insert();

create or replace function public.taken_slots(p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(slot_start timestamp with time zone, duration_min integer)
 language sql stable security definer set search_path to 'public'
as $function$
  select b.slot_start, b.duration_min
  from public.bookings b
  where b.status <> 'cancelled'
    and not (b.status = 'pending' and b.deposit_paid_at is null
             and position('Lock-in' in coalesce(b.package,'')) > 0
             and b.created_at < now() - interval '35 minutes')
    and b.slot_start >= p_from
    and b.slot_start <  p_to;
$function$;

drop trigger if exists trg_notify_booking on public.bookings;
create trigger trg_notify_booking after insert on public.bookings
  for each row when (position('Lock-in' in coalesce(new.package,'')) = 0)
  execute function public.notify_booking();
drop trigger if exists trg_notify_booking_paid on public.bookings;
create trigger trg_notify_booking_paid after update of deposit_paid_at on public.bookings
  for each row when (old.deposit_paid_at is null and new.deposit_paid_at is not null and new.status <> 'cancelled')
  execute function public.notify_booking();
