-- Gift cards: bought online (Stripe), used at booking (deposit) or on the day (job board).
-- Paid value is kept separate from the promotional bonus, which expires.

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^DV-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  amount_paid_usd integer not null check (amount_paid_usd between 25 and 1000),
  bonus_usd integer not null default 0 check (bonus_usd between 0 and 200),
  bonus_expires date,
  balance_usd integer not null default 0 check (balance_usd >= 0),          -- paid value left
  bonus_balance_usd integer not null default 0 check (bonus_balance_usd >= 0),
  buyer_name text check (char_length(buyer_name) <= 120),
  buyer_email text check (char_length(buyer_email) <= 200),
  recipient_name text check (char_length(recipient_name) <= 120),
  message text check (char_length(message) <= 300),
  status text not null default 'pending' check (status in ('pending','active','void')),
  stripe_payment_intent text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.gift_cards enable row level security;
drop policy if exists "admins read gift cards" on public.gift_cards;
create policy "admins read gift cards" on public.gift_cards for select to authenticated using (public.is_admin());
drop policy if exists "admins update gift cards" on public.gift_cards;
create policy "admins update gift cards" on public.gift_cards for update to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.gift_card_uses (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.gift_cards(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  amount_usd integer not null check (amount_usd > 0),
  kind text not null default 'job' check (kind in ('job','deposit','refund','adjust')),
  created_at timestamptz not null default now()
);
alter table public.gift_card_uses enable row level security;
drop policy if exists "admins read gift card uses" on public.gift_card_uses;
create policy "admins read gift card uses" on public.gift_card_uses for select to authenticated using (public.is_admin());

alter table public.bookings add column if not exists gift_card_code text
  check (gift_card_code is null or gift_card_code ~ '^DV-[A-Z0-9]{4}-[A-Z0-9]{4}$');

-- Paid (webhook or page): turn a pending card on. Returns true if it activated now.
create or replace function public.activate_gift_card(p_card uuid, p_pi text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  update public.gift_cards
     set status = 'active', paid_at = now(),
         balance_usd = amount_paid_usd, bonus_balance_usd = bonus_usd
   where id = p_card and status = 'pending' and stripe_payment_intent = p_pi;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.activate_gift_card(uuid, text) from public, anon, authenticated;
grant execute on function public.activate_gift_card(uuid, text) to service_role;

-- Spend from a card: unexpired bonus first, then paid value. Returns what was spent.
create or replace function public.gift_card_spend(p_card uuid, p_amount integer, p_booking uuid, p_kind text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare c public.gift_cards; bonus_ok integer; from_bonus integer; from_paid integer;
begin
  if p_amount is null or p_amount <= 0 then return 0; end if;
  select * into c from public.gift_cards where id = p_card and status = 'active' for update;
  if not found then return 0; end if;
  bonus_ok := case when c.bonus_expires is null or c.bonus_expires >= (now() at time zone 'America/Boise')::date
                   then c.bonus_balance_usd else 0 end;
  from_bonus := least(bonus_ok, p_amount);
  from_paid := least(c.balance_usd, p_amount - from_bonus);
  if from_bonus + from_paid = 0 then return 0; end if;
  update public.gift_cards set bonus_balance_usd = bonus_balance_usd - from_bonus, balance_usd = balance_usd - from_paid
   where id = c.id;
  insert into public.gift_card_uses (card_id, booking_id, amount_usd, kind) values (c.id, p_booking, from_bonus + from_paid, coalesce(p_kind,'job'));
  return from_bonus + from_paid;
end $$;
revoke all on function public.gift_card_spend(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.gift_card_spend(uuid, integer, uuid, text) to service_role;

-- Job board: use a card on the day. Owner only.
create or replace function public.redeem_gift_card(p_code text, p_amount integer, p_booking uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare cid uuid;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select id into cid from public.gift_cards where code = upper(trim(p_code)) and status = 'active';
  if cid is null then return 0; end if;
  return public.gift_card_spend(cid, p_amount, p_booking, 'job');
end $$;
revoke all on function public.redeem_gift_card(text, integer, uuid) from public, anon;
grant execute on function public.redeem_gift_card(text, integer, uuid) to authenticated;

-- Emails when a card is paid: the card to the buyer, a heads-up to the owner.
create or replace function public.notify_gift_card()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_key text; v_from text := 'Detail Valley <bookings@detailvalley.com>'; v_owner text := 'ethan@detailvalley.com';
  v_to text; v_from_name text; v_msg text; v_total integer; v_bonus text := ''; v_html text;
  e_to text; e_from text; e_msg text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if v_key is null then return new; end if;
  e_to   := replace(replace(replace(coalesce(new.recipient_name,''),'&','&amp;'),'<','&lt;'),'>','&gt;');
  e_from := replace(replace(replace(coalesce(new.buyer_name,''),'&','&amp;'),'<','&lt;'),'>','&gt;');
  e_msg  := replace(replace(replace(coalesce(new.message,''),'&','&amp;'),'<','&lt;'),'>','&gt;');
  v_total := new.amount_paid_usd + new.bonus_usd;
  if new.bonus_usd > 0 then
    v_bonus := '<div style="font-size:13px;color:#c3d0db;padding-top:6px">$' || new.amount_paid_usd || ' + $' || new.bonus_usd
            || ' bonus (bonus good through ' || to_char(new.bonus_expires, 'FMMonth FMDD, YYYY') || ')</div>';
  end if;
  v_html :=
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:26px 12px"><tr><td align="center">'
    || '<table width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Arial,sans-serif">'
    || '<tr><td style="background:#0b2a45;border-radius:18px;padding:26px 26px 24px;color:#ffffff">'
    || '<div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#c3d0db">Detail Valley · Gift card</div>'
    || '<div style="font-size:52px;font-weight:700;color:#f0c29e;padding:14px 0 0">$' || v_total || '</div>' || v_bonus
    || case when e_to <> '' then '<div style="font-size:16px;padding-top:16px">For <b>' || e_to || '</b>' || case when e_from <> '' then ', from ' || e_from else '' end || '</div>' else '' end
    || case when e_msg <> '' then '<div style="font-size:15px;color:#c3d0db;padding-top:8px;font-style:italic">“' || e_msg || '”</div>' else '' end
    || '<div style="margin-top:20px;background:#ffffff;color:#0b2a45;border-radius:12px;padding:14px;text-align:center;font-size:24px;font-weight:700;letter-spacing:3px">' || new.code || '</div>'
    || '</td></tr>'
    || '<tr><td style="padding:18px 6px 0;color:#3d566b;font-size:14px;line-height:1.5">'
    || '<b style="color:#0b2a45">How to use it:</b> book at <a href="https://detailvalley.com" style="color:#a4521f">detailvalley.com</a> and enter the code on the last step. '
    || 'It can cover the spring deposit, and the rest comes off on the day. Interior details all winter in a heated or attached garage; everything else from April.<br><br>'
    || 'Forward this email or print it to give it. Questions? Text (208) 315-1420.'
    || '</td></tr></table></td></tr></table>';

  if coalesce(new.buyer_email,'') <> '' then
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization','Bearer '||v_key, 'Content-Type','application/json'),
      body := jsonb_build_object('from', v_from, 'to', jsonb_build_array(new.buyer_email),
        'subject', 'Your Detail Valley gift card: $' || v_total || ' · ' || new.code, 'html', v_html));
  end if;
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization','Bearer '||v_key, 'Content-Type','application/json'),
    body := jsonb_build_object('from', v_from, 'to', jsonb_build_array(v_owner),
      'subject', 'Gift card sold: $' || new.amount_paid_usd || coalesce(' for ' || nullif(new.recipient_name,''), '') || ' · ' || new.code, 'html', v_html));
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists trg_notify_gift_card on public.gift_cards;
create trigger trg_notify_gift_card after update of status on public.gift_cards
  for each row when (old.status = 'pending' and new.status = 'active')
  execute function public.notify_gift_card();
