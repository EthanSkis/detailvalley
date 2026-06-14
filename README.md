# Detail Valley

Marketing + booking site for **Detail Valley**, a mobile car detailing business
serving Valley County, Idaho (McCall · Cascade · Donnelly).

It's a single-page, conversion-focused static site with a built-in multi-step
booking flow (package → add-ons → pick a slot → details → confirm) that saves
real bookings to a Supabase database. No build step — just HTML, CSS, and a
little vanilla JavaScript (plus the Supabase client from a CDN).

## The site

`index.html` is the production site. Open it in any browser to preview it, or
host it on any static host.

> `index.html`, `logo.svg`, and `logo.png` must live in the **same folder** —
> the page references them by relative path.

### Deploy on GitHub Pages
1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**, branch `main`, folder `/ (root)`
3. Save. It publishes at `https://<user>.github.io/detailvalley/`, or point the
   custom domain `detailvalley.com` at it.

### Deploy on Netlify
Connect the repo (or drag the folder into the Netlify dashboard). No build
command and no publish directory beyond the root are needed.

## Brand identity

| | |
|---|---|
| **Name** | Detail Valley |
| **Domain** | detailvalley.com |
| **Handle** | @detailvalleyid (Instagram / Facebook / TikTok) |
| **Colors** | navy `#0f2c44`, copper `#b8632c`, mist white |
| **Fonts** | Sora (headings) + Inter (body), via Google Fonts |
| **Logo** | `logo.png` (1254×1254) |

## Files

| File | Purpose |
|------|---------|
| `index.html` | The live Detail Valley site (final, professional design). |
| `CNAME` | Custom domain for GitHub Pages (`detailvalley.com`). |
| `logo.svg` | The logo, as vector — used on the site (hero, footer, favicon). Scales crisply at any size. |
| `logo.png` | Raster version of the logo — social profile picture / raster fallback. |
| `alternate-designs/ridgeline-mountain.html` | Earlier "alpine garage" concept (rugged, mountain-themed, under the working name *Ridgeline Detail*). Kept for reference; not used live. |

## Before going fully live

A few things in `index.html` are still placeholders:

- **Phone number** — set to `(208) 315-1420` in the footer. (The booking form's phone field keeps `(555) 000-0000` as an example for customers to fill in.)
- **Email** — `ethan@detailvalley.com` (make sure that inbox actually exists / forwards to you).
- **Social links** — Facebook and TikTok point to `#`; Instagram points to
  `detailvalleyid`. Turn the others on once those accounts exist and have a post or two.
- **Booking form** — live: it writes real bookings to Supabase (see below).
  Nothing more required, though you may want to add email/SMS alerts on new bookings.
- **Prices & package details** — confirm against your real time-per-car before launch.

## Bookings (Supabase)

The booking flow is backed by a Supabase project (**valleydetail1**). Confirmed
bookings are written to a `public.bookings` table, and the calendar only offers
slots that aren't already taken.

**See your bookings:** Supabase dashboard → your project → **Table editor →
`bookings`**. Each row has the package, add-ons, customer name + phone, the
service address + town, the chosen slot, and total. Set a booking's `status` to `cancelled` to free that
slot back up, or `confirmed` / `completed` to track it.

**How availability works:**
- Slots are generated in code from your hours, in Mountain Time, for the next
  ~3 weeks. Edit `DAY_SLOTS` / `DAYS_AHEAD` near the top of the `<script>` in
  `index.html` to change the times, the number of slots per day, or how far
  ahead people can book.
- Currently **2 slots/day** (a morning and an afternoon), Mon–Sat; Sunday closed.
- A unique database index makes double-booking the same slot impossible.

**Security:** the key in `index.html` is the Supabase *publishable* key — it's
meant to be public. Row-level security lets visitors only *create* a booking and
*see which slots are taken*; nobody can read other customers' names or phone
numbers through the public API. Only you, via the dashboard, can read them.

**Email alerts:** every new booking emails the owner automatically. A Postgres
trigger (`notify_booking` on `public.bookings`) sends the booking details to
**Resend** via the `pg_net` extension the moment a row is inserted. The Resend
API key is stored in **Supabase Vault** — never in this repo or the site code.
Alerts go to `ethan@detailvalley.com`, sent from `bookings@detailvalley.com`
(the verified `detailvalley.com` domain). To change either address, edit `v_to`
or `v_from` in the `notify_booking()` function. Sending is best-effort and never
blocks a booking.
