// Stripe webhook: marks a booking's deposit as paid when its Checkout session
// completes or a PaymentIntent from our own payment form succeeds. Point a Stripe
// webhook endpoint at this function's URL with the events
// `checkout.session.completed` and `payment_intent.succeeded`.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   STRIPE_WEBHOOK_SECRET   whsec_... from that Stripe webhook endpoint
import { createClient } from "jsr:@supabase/supabase-js@2";

const enc = new TextEncoder();

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Stripe-Signature: t=timestamp,v1=hmac_sha256(`${t}.${payload}`, secret)
async function verify(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string]),
  );
  const t = parts["t"];
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // 5 min tolerance
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", k, enc.encode(`${t}.${payload}`)));
  return sigs.some((s) => safeEqual(s, expected));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return new Response("not configured", { status: 503 });

  const payload = await req.text();
  const ok = await verify(payload, req.headers.get("stripe-signature") || "", secret);
  if (!ok) return new Response("bad signature", { status: 400 });

  const event = JSON.parse(payload);
  const s = event.data.object;
  let bookingId = "", paidUsd = 0, ref = "";
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (s.payment_status !== "paid") return new Response("not paid yet", { status: 200 });
    bookingId = s.metadata?.booking_id || s.client_reference_id;
    paidUsd = Math.round((s.amount_total || 0) / 100);
    ref = s.id;
  } else if (event.type === "payment_intent.succeeded") {
    // Our own payment form (Payment Element). Checkout's intents carry the same
    // metadata; the update below only ever applies once per booking.
    bookingId = s.metadata?.booking_id;
    paidUsd = Math.round((s.amount_received || 0) / 100);
    ref = s.id;
  } else {
    return new Response("ignored", { status: 200 });
  }
  if (!bookingId) return new Response("no booking", { status: 200 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await sb
    .from("bookings")
    .update({
      deposit_paid_usd: paidUsd,
      deposit_paid_at: new Date().toISOString(),
      stripe_session_id: ref,
    })
    .eq("id", bookingId)
    .is("deposit_paid_at", null);
  if (error) {
    console.error("update failed", error.message);
    return new Response("db error", { status: 500 }); // Stripe retries
  }
  return new Response("ok", { status: 200 });
});
