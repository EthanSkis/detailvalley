-- Remove leftovers from an old, unrelated app that shared this Supabase project
-- (a nurse pay site: wage_reports, job_openings, profiles), and the old
-- server-side price list (service_prices). dv-pricing.js is the one price list;
-- the site never sends pkg_id, so compute_booking_total had gone dormant, and a
-- second copy of the prices would have gone stale at the April 1 increase.
-- profiles was filled by a hook on auth.users, dropped with it so new accounts
-- can still be created.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop trigger if exists trg_compute_booking_total on public.bookings;
drop function if exists public.compute_booking_total();
drop table if exists public.wage_reports;
drop table if exists public.job_openings;
drop table if exists public.profiles;
drop table if exists public.service_prices;
