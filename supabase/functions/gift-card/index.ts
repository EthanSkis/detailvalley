// Gift cards, for gift.html (buying) and the booking flow (checking, paying a
// deposit). Public endpoint (no JWT); every amount and balance is decided here.
//
//   { action: "buy", amount, buyer_name, buyer_email, recipient_name, message }
//        -> { card_id, client_secret, bonus }   pending card + PaymentIntent
//   { action: "confirm", card_id, payment_intent }
//        -> { code, amount, bonus, bonus_expires }   checks Stripe, turns the card on
//   { action: "check", code }
//        -> { valid, available, balance, bonus }     what the card can cover now
//   { action: "pay_deposit", code, booking_id }
//        -> { paid, remaining }   covers a lock-in booking's deposit from the card
//
// Secrets: STRIPE_SECRET_KEY (same as deposit-checkout).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://detailvalley.com";
const ALLOWED_ORIGINS = ["https://detailvalley.com", "https://www.detailvalley.com", "https://ethanskis.github.io"];
// Holiday promo: +$15 for every $100 bought before this date (MT); bonus good until BONUS_EXPIRES.
const BONUS_UNTIL = "2026-12-25";
const BONUS_EXPIRES = "2027-06-30";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O, 1/I

function cors(origin: string | null) {
  const allow = origin && (ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost")) ? origin : SITE;
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info", "Vary": "Origin" };
}
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

async function stripe(key: string, method: string, path: string, form?: URLSearchParams) {
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers, body: form });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  const c = [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
  return `DV-${c.slice(0, 4)}-${c.slice(4)}`;
}
const todayMT = () => new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);   // close enough for a date cutoff
const bonusFor = (amount: number) => todayMT() < BONUS_UNTIL ? Math.floor(amount / 100) * 15 : 0;
const clean = (v: unknown, n: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const normCode = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^DV/, "");
const fmtCode = (c: string) => c.length === 8 ? `DV-${c.slice(0, 4)}-${c.slice(4)}` : "";
const depositFor = (pkg: string) => pkg.startsWith("Maintenance Wash") ? 25 : 50;

// What a card can spend today: paid balance + unexpired bonus.
function available(c: { balance_usd: number; bonus_balance_usd: number; bonus_expires: string | null }) {
  const bonusOk = !c.bonus_expires || c.bonus_expires >= todayMT() ? c.bonus_balance_usd : 0;
  return { balance: c.balance_usd, bonus: bonusOk, total: c.balance_usd + bonusOk };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method" }, 405, origin);
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ error: "payments_not_configured" }, 503, origin);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* bad body */ }
  const action = String(body.action || "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- buy: make a pending card and a PaymentIntent for it ----
  if (action === "buy") {
    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount < 25 || amount > 1000 || amount % 5) return json({ error: "bad_amount" }, 400, origin);
    const email = clean(body.buyer_email, 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad_email" }, 400, origin);
    const bonus = bonusFor(amount);
    let card = null;
    for (let i = 0; i < 4 && !card; i++) {   // retry on the (very unlikely) duplicate code
      const { data, error } = await sb.from("gift_cards").insert({
        code: newCode(), amount_paid_usd: amount, bonus_usd: bonus, bonus_expires: bonus ? BONUS_EXPIRES : null,
        buyer_name: clean(body.buyer_name, 120), buyer_email: email,
        recipient_name: clean(body.recipient_name, 120), message: clean(body.message, 300),
      }).select("id, code").single();
      if (!error) card = data; else if (error.code !== "23505") { console.error("insert", error.message); return json({ error: "db" }, 500, origin); }
    }
    if (!card) return json({ error: "db" }, 500, origin);
    const r = await stripe(key, "POST", "payment_intents", new URLSearchParams({
      amount: String(amount * 100), currency: "usd",
      description: `Gift card ${card.code}` + (bonus ? ` ($${amount} + $${bonus} bonus)` : ""),
      "payment_method_types[0]": "card", receipt_email: email,
      "metadata[gift_card_id]": card.id, "metadata[gift_card_code]": card.code,
    }));
    if (!r.ok || !r.data.client_secret) { console.error("stripe", r.status, r.data?.error?.message); return json({ error: "stripe" }, 502, origin); }
    await sb.from("gift_cards").update({ stripe_payment_intent: r.data.id }).eq("id", card.id);
    return json({ card_id: card.id, client_secret: r.data.client_secret, bonus }, 200, origin);
  }

  // ---- confirm: page says it paid; check with Stripe, then turn the card on ----
  if (action === "confirm") {
    const id = String(body.card_id || ""), pi = String(body.payment_intent || "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^pi_[A-Za-z0-9]+$/.test(pi)) return json({ error: "bad_request" }, 400, origin);
    const r = await stripe(key, "GET", `payment_intents/${pi}`);
    if (!r.ok) return json({ error: "stripe" }, 502, origin);
    if (r.data.metadata?.gift_card_id !== id) return json({ error: "mismatch" }, 409, origin);
    if (r.data.status !== "succeeded") return json({ paid: false, status: r.data.status }, 200, origin);
    await sb.rpc("activate_gift_card", { p_card: id, p_pi: pi });
    const { data: c } = await sb.from("gift_cards").select("code, amount_paid_usd, bonus_usd, bonus_expires, status").eq("id", id).single();
    if (!c || c.status !== "active") return json({ error: "not_active" }, 500, origin);
    return json({ paid: true, code: c.code, amount: c.amount_paid_usd, bonus: c.bonus_usd, bonus_expires: c.bonus_expires }, 200, origin);
  }

  // ---- check / pay_deposit: look the card up by code ----
  const code = fmtCode(normCode(body.code));
  if (!code) return json({ valid: false, error: "bad_code" }, 200, origin);
  const { data: c } = await sb.from("gift_cards")
    .select("id, code, status, balance_usd, bonus_balance_usd, bonus_expires").eq("code", code).maybeSingle();
  if (!c || c.status !== "active") return json({ valid: false, error: "not_found" }, 200, origin);
  const av = available(c);

  if (action === "check") {
    return json({ valid: true, code: c.code, available: av.total, balance: av.balance, bonus: av.bonus, bonus_expires: c.bonus_expires }, 200, origin);
  }

  if (action === "pay_deposit") {
    const bid = String(body.booking_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(bid)) return json({ error: "bad_booking" }, 400, origin);
    const { data: b } = await sb.from("bookings").select("id, package, status, deposit_paid_at").eq("id", bid).maybeSingle();
    if (!b) return json({ error: "not_found" }, 404, origin);
    if (b.deposit_paid_at) return json({ paid: true, remaining: av.total }, 200, origin);
    if (b.status !== "pending" || !String(b.package).includes("Lock-in")) return json({ error: "no_deposit_due" }, 409, origin);
    const dep = depositFor(String(b.package));
    if (av.total < dep) return json({ error: "not_enough", available: av.total }, 409, origin);
    const { data: spent, error: serr } = await sb.rpc("gift_card_spend", { p_card: c.id, p_amount: dep, p_booking: b.id, p_kind: "deposit" });
    if (serr || spent !== dep) { console.error("spend", serr?.message, spent); return json({ error: "spend_failed" }, 500, origin); }
    const { error: uerr } = await sb.from("bookings").update({
      deposit_paid_usd: dep, deposit_paid_at: new Date().toISOString(), stripe_session_id: `giftcard:${c.code}`, gift_card_code: c.code,
    }).eq("id", b.id).is("deposit_paid_at", null);
    if (uerr) return json({ error: "db" }, 500, origin);
    return json({ paid: true, remaining: av.total - dep }, 200, origin);
  }

  return json({ error: "bad_action" }, 400, origin);
});
