// Creates a Stripe Checkout session for a booking's spring lock-in deposit.
// Called by the booking page right after a booking is saved (and again from the
// "pay deposit" prompt if the customer backed out of checkout).
//
// Public endpoint (no JWT): it only ever charges the deposit for a real, pending,
// unpaid lock-in booking, and the amount is decided here, never by the browser.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY   sk_live_... / sk_test_... (or a restricted key with
//                       Checkout Sessions: write)
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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method" }, 405, origin);

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ error: "payments_not_configured" }, 503, origin);

  let bookingId = "", embedded = false;
  try {
    const body = await req.json();
    bookingId = String(body.booking_id || "");
    embedded = body.embedded === true;   // in-page checkout instead of a redirect
  } catch { /* bad body */ }
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return json({ error: "bad_booking" }, 400, origin);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: b, error } = await sb
    .from("bookings")
    .select("id, package, status, slot_start, customer_name, deposit_paid_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !b) return json({ error: "not_found" }, 404, origin);
  if (b.status === "cancelled") return json({ error: "cancelled" }, 409, origin);
  if (b.deposit_paid_at) return json({ error: "already_paid" }, 409, origin);
  if (!String(b.package).includes("Lock-in")) return json({ error: "no_deposit_due" }, 409, origin);

  const amount = depositFor(String(b.package));
  const when = new Date(b.slot_start).toLocaleDateString("en-US", {
    timeZone: "America/Boise", weekday: "short", month: "short", day: "numeric",
  });
  const pkgName = String(b.package).split(" · ")[0];

  const form = new URLSearchParams({
    mode: "payment",
    client_reference_id: b.id,
    "metadata[booking_id]": b.id,
    "payment_intent_data[metadata][booking_id]": b.id,
    "payment_intent_data[description]": `Lock-in deposit: ${pkgName}, ${when}`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amount * 100),
    "line_items[0][price_data][product_data][name]": "Spring lock-in deposit",
    "line_items[0][price_data][product_data][description]": `${pkgName} on ${when}. Comes off your total on the day.`,
  });
  if (embedded) {
    // Embedded Checkout: stays on the booking page; only payment methods that
    // need a bank redirect ever leave it, and they come back to the paid notice.
    form.set("ui_mode", "embedded");
    form.set("redirect_on_completion", "if_required");
    form.set("return_url", `${SITE}/?deposit=paid`);
  } else {
    form.set("success_url", `${SITE}/?deposit=paid`);
    form.set("cancel_url", `${SITE}/?deposit=cancelled&b=${b.id}`);
  }

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const s = await r.json();
  if (!r.ok || !(embedded ? s.client_secret : s.url)) {
    console.error("stripe error", r.status, s?.error?.message);
    return json({ error: "stripe" }, 502, origin);
  }
  return json(embedded ? { client_secret: s.client_secret } : { url: s.url }, 200, origin);
});
