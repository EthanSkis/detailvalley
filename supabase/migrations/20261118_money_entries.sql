-- Money view on the job board: itemized business expenses, business miles and
-- other business income (tips, cash jobs, kept deposits), plus per-year tax
-- settings. Owner-only: admins can read and write, nobody else can see a row.
create table if not exists public.money_entries (
  id          uuid primary key default gen_random_uuid(),
  entry_date  date not null,
  kind        text not null check (kind in ('expense','miles','income')),
  category    text check (char_length(category) <= 40),
  amount_usd  numeric(10,2) not null default 0 check (amount_usd >= 0 and amount_usd <= 1000000),
  miles       numeric(8,1)  not null default 0 check (miles >= 0 and miles <= 100000),
  note        text check (char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  check ((kind = 'miles' and miles > 0) or (kind <> 'miles' and amount_usd > 0))
);
create index if not exists money_entries_date_idx on public.money_entries (entry_date);

create table if not exists public.tax_settings (
  year          integer primary key check (year between 2020 and 2100),
  mileage_rate  numeric(6,4) check (mileage_rate >= 0 and mileage_rate <= 5),
  idaho_rate    numeric(5,3) check (idaho_rate >= 0 and idaho_rate <= 20),
  other_wages   numeric(12,2) not null default 0 check (other_wages >= 0 and other_wages <= 10000000),
  updated_at    timestamptz not null default now()
);

alter table public.money_entries enable row level security;
alter table public.tax_settings  enable row level security;
revoke all on public.money_entries, public.tax_settings from anon;

drop policy if exists "admins manage money entries" on public.money_entries;
create policy "admins manage money entries" on public.money_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage tax settings" on public.tax_settings;
create policy "admins manage tax settings" on public.tax_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
