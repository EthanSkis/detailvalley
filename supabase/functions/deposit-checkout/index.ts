// Spring lock-in deposits, for the booking page.
//
// Actions (POST JSON, all keyed by booking_id):
//   { action: "intent" }        -> { client_secret }  PaymentIntent for our own
//                                  payment form (Stripe Payment Element)
//   { action: "confirm", payment_intent: "pi_..." }
//                               -> { paid: true }     checks the PaymentIntent with
//                                  Stripe and marks the booking's deposit paid
//   { action: "release" }       -> { released }       customer backed out: cancel the
//                                  unpaid hold so the date frees up
//   { action: "status" }        -> { ok }             is the hold still payable?
//   { embedded: true }          -> { client_secret }  Embedded Checkout (legacy)
//   {}                          -> { url }            Stripe-hosted Checkout page
//                                  (fallback + "Copy pay link" on the job board)
//   { client_error, ua }        -> 204                logs why the page's form failed
//
// Public endpoint (no JWT): it only ever charges the deposit for a real, pending,
// unpaid lock-in booking, and the amount is decided here, never by the browser.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY   sk_live_... / sk_test_...
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://detailvalley.com";
const ALLOWED_ORIGINS = [
  "https://detailvalley.com",
  "https://www.detailvalley.com",
  "https://ethanskis.github.io",
];

function cors(origin: string | null) {
  const allow = origin && (ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost")) ? origin : SITE;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

// $25 for a Maintenance Wash, $50 for everything else. Mirrors deposit() in index.html.
function depositFor(pkg: string) {
  return pkg.startsWith("Maintenance Wash") ? 25 : 50;
}

async function stripe(key: string, method: string, path: string, form?: URLSearchParams, idem?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idem) headers["Idempotency-Key"] = idem;
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers, body: form });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method" }, 405, origin);

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ error: "payments_not_configured" }, 503, origin);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* bad body */ }
  const bookingId = String(body.booking_id || "");
  const action = String(body.action || "");
  const embedded = body.embedded === true;

  // The booking page reports why its payment form failed; just log it.
  if (body.client_error) {
    console.error("payment form failed", JSON.stringify({
      booking: bookingId.slice(0, 36),
      error: String(body.client_error).slice(0, 300),
      ua: String(body.ua || "").slice(0, 200),
    }));
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return json({ error: "bad_booking" }, 400, origin);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Release abandoned holds (no-op until the expire_unpaid_holds migration exists).
  await sb.rpc("expire_unpaid_holds").then(() => {}, () => {});
  const { data: b, error } = await sb
    .from("bookings")
    .select("id, package, status, slot_start, customer_name, deposit_paid_at, created_at, stripe_session_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !b) return json({ error: "not_found" }, 404, origin);

  // ---- confirm: the page says it paid; check with Stripe before believing it ----
  if (action === "confirm") {
    if (b.deposit_paid_at) return json({ paid: true }, 200, origin);
    const pi = String(body.payment_intent || "");
    if (!/^pi_[A-Za-z0-9]+$/.test(pi)) return json({ error: "bad_intent" }, 400, origin);
    const r = await stripe(key, "GET", `payment_intents/${pi}`);
    if (!r.ok) return json({ error: "stripe" }, 502, origin);
    if (r.data.metadata?.booking_id !== b.id) return json({ error: "mismatch" }, 409, origin);
    if (r.data.status !== "succeeded") return json({ paid: false, status: r.data.status }, 200, origin);
    const { error: uerr } = await sb.from("bookings").update({
      deposit_paid_usd: Math.round((r.data.amount_received || 0) / 100),
      deposit_paid_at: new Date().toISOString(),
      stripe_session_id: pi,
    }).eq("id", b.id).is("deposit_paid_at", null);
    if (uerr) return json({ error: "db" }, 500, origin);
    return json({ paid: true }, 200, origin);
  }

  const isHold = String(b.package).includes("Lock-in");

  // ---- release: the customer backed out before paying ----
  if (action === "release") {
    const fresh = Date.now() - new Date(b.created_at).getTime() < 2 * 3600_000;
    if (!isHold || b.deposit_paid_at || b.status !== "pending" || !fresh) return json({ released: false }, 200, origin);
    await sb.from("bookings").update({
      status: "cancelled",
      notes: "[Released: customer left before paying the deposit]",
    }).eq("id", b.id).is("deposit_paid_at", null).eq("status", "pending");
    // Make sure the abandoned PaymentIntent can't be paid later.
    const pi = String(b.stripe_session_id || "");
    if (pi.startsWith("pi_")) await stripe(key, "POST", `payment_intents/${pi}/cancel`, new URLSearchParams());
    return json({ released: true }, 200, origin);
  }

  if (b.status === "cancelled") return json({ error: "cancelled" }, 409, origin);
  if (b.deposit_paid_at) return json({ error: "already_paid" }, 409, origin);
  if (!isHold) return json({ error: "no_deposit_due" }, 409, origin);
  if (action === "status") return json({ ok: true }, 200, origin);

  const amount = depositFor(String(b.package));
  const when = new Date(b.slot_start).toLocaleDateString("en-US", {
    timeZone: "America/Boise", weekday: "short", month: "short", day: "numeric",
  });
  const pkgName = String(b.package).split(" · ")[0];
  const description = `Lock-in deposit: ${pkgName}, ${when}`;

  // ---- intent: for our own payment form (Payment Element) ----
  if (action === "intent") {
    const form = new URLSearchParams({
      amount: String(amount * 100),
      currency: "usd",
      description,
      "payment_method_types[0]": "card",          // cards + Apple Pay / Google Pay
      "metadata[booking_id]": b.id,
    });
    // Same booking -> same PaymentIntent (for 24h), so reopening the form never
    // creates a second charge.
    const r = await stripe(key, "POST", "payment_intents", form, `deposit-intent-${b.id}`);
    if (!r.ok || !r.data.client_secret) {
      console.error("stripe error", r.status, r.data?.error?.message);
      return json({ error: "stripe" }, 502, origin);
    }
    // Remember it so a release can cancel it.
    await sb.from("bookings").update({ stripe_session_id: r.data.id }).eq("id", b.id).is("deposit_paid_at", null);
    return json({ client_secret: r.data.client_secret, amount }, 200, origin);
  }

  // ---- Checkout Session: hosted page (fallback / pay link) or embedded ----
  const form = new URLSearchParams({
    mode: "payment",
    client_reference_id: b.id,
    "metadata[booking_id]": b.id,
    "payment_intent_data[metadata][booking_id]": b.id,
    "payment_intent_data[description]": description,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amount * 100),
    "line_items[0][price_data][product_data][name]": "Spring lock-in deposit",
    "line_items[0][price_data][product_data][description]": `${pkgName} on ${when}`,
    "line_items[0][price_data][product_data][images][0]": `${SITE}/logo.png`,
    submit_type: "book",   // button reads "Book" instead of "Pay"
    "custom_text[submit][message]": "Comes off your total on the day. Moves free with 48 hours' notice; weather reschedules are always free.",
  });
  if (embedded) {
    form.set("ui_mode", "embedded");
    form.set("redirect_on_completion", "if_required");
    form.set("return_url", `${SITE}/?deposit=paid`);
  } else {
    form.set("success_url", `${SITE}/?deposit=paid`);
    form.set("cancel_url", `${SITE}/?deposit=cancelled&b=${b.id}`);
  }
  // Matches the 35-minute hold: an expired hold's checkout can't be paid.
  form.set("expires_at", String(Math.floor(Date.now() / 1000) + 31 * 60));
  const r = await stripe(key, "POST", "checkout/sessions", form);
  if (!r.ok || !(embedded ? r.data.client_secret : r.data.url)) {
    console.error("stripe error", r.status, r.data?.error?.message);
    return json({ error: "stripe" }, 502, origin);
  }
  return json(embedded ? { client_secret: r.data.client_secret } : { url: r.data.url }, 200, origin);
});
