# Detail Valley

Marketing + booking site for **Detail Valley**, a mobile car detailing business
serving Valley County, Idaho (McCall · Cascade · Donnelly).

It's a single-page, conversion-focused static site with a built-in multi-step
booking flow (package → add-ons → pick a day & time on a calendar → details →
confirm) that saves real bookings to a Supabase database. The flow is built
mobile-first with large tap targets, a step progress bar, an auto-formatting
phone field, and a real month-grid calendar so it's easy to use one-handed on a
phone. No build step — just HTML, CSS, and a little vanilla JavaScript (plus the
Supabase client from a CDN).

## The site

`index.html` is the production site. Open it in any browser to preview it, or
host it on any static host. `service-areas.html` is a companion local-SEO page
covering the towns we serve (McCall · Cascade · Donnelly). `robots.txt` and
`sitemap.xml` help search engines crawl the site (the sitemap lists the public
pages; `admin.html` is disallowed).

> `index.html`, `service-areas.html`, `logo.svg`, and `logo.png` must live in
> the **same folder** — the pages reference them by relative path.

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
| `admin.html` | Private **owner job board** — sign in to manage bookings on your phone. See [Owner dashboard](#owner-dashboard-adminhtml). |
| `CNAME` | Custom domain for GitHub Pages (`detailvalley.com`). |
| `logo.svg` | The logo, as vector — used on the site (hero, footer, favicon). Scales crisply at any size. |
| `logo.png` | Raster version of the logo — social profile picture / raster fallback. |
| `alternate-designs/ridgeline-mountain.html` | Earlier "alpine garage" concept (rugged, mountain-themed, under the working name *Ridgeline Detail*). Kept for reference; not used live. |

## Before going fully live

A few things in `index.html` are still placeholders:

- **Phone number** — set to `(208) 315-1420` in the footer. (The booking form's phone field keeps `(555) 000-0000` as an example for customers to fill in.)
- **Email** — `ethan@detailvalley.com` (make sure that inbox actually exists / forwards to you).
- **Social links** — Instagram and TikTok point to `@detailvalleyid`; Facebook
  points to the page profile (`facebook.com/profile.php?id=61590927205017`).
  Make sure each account has a post or two before promoting it.
- **Booking form** — live: it writes real bookings to Supabase (see below).
  Nothing more required, though you may want to add email/SMS alerts on new bookings.
- **Prices & package details** — confirm against your real time-per-car before launch.

## Bookings (Supabase)

The booking flow is backed by a Supabase project (**valleydetail1**). Confirmed
bookings are written to a `public.bookings` table, and the calendar only offers
slots that aren't already taken.

**Pricing is authoritative on the backend.** Each booking sends its structured
selection (`pkg_id`, `size_id`, `addon_ids`) and a `BEFORE INSERT` trigger
(`compute_booking_total`) recomputes `total_usd` from a canonical
`public.service_prices` table — so the saved (and emailed) total always matches
the advertised prices, even if the browser's copy is stale, cached, or tampered.
The package already bundling an add-on (e.g. interior glass in Full/Showroom)
isn't double-charged. **When you change a price, update it in *both* places:** the
`PACKAGES` / `SIZES` / `ADDONS` arrays in `index.html` (what customers see) and
the `public.service_prices` table (what gets charged). They must stay in sync.

**See your bookings:** the easiest way is the [**owner dashboard**](#owner-dashboard-adminhtml)
(`admin.html`) — a phone-friendly job board with one-tap status buttons. You can
also read the raw rows in the Supabase dashboard → your project → **Table editor →
`bookings`**. Each row has the package, add-ons, customer name + phone, the
service address + town, the chosen slot, and total. Set a booking's `status` to `cancelled` to free that
slot back up, or `confirmed` / `completed` to track it.

**How availability works:**
- Start times are generated in code, in Mountain Time, on a grid within your
  working hours — and **each booking blocks off the time its job actually
  needs** (package + vehicle size + add-ons), plus a travel/cleanup buffer. So a
  quick Maintenance Wash only ties up ~1¼ hr while a Showroom takes most of the day, and
  the calendar never offers a time that would overlap an existing job.
- Customers see a month-grid **calendar**: days with openings are highlighted
  (with a dot), full/out-of-range days are greyed out, and tapping a day reveals
  that day's available start times (each labelled with roughly when it finishes).
- Knobs near the top of the `<script>` in `index.html`:
  - `HOURS` — working hours per weekday (omit a day to close it; Sunday is closed)
  - `STEP_MIN` — spacing of offered start times (default 60 min)
  - `BUFFER_MIN` — travel/cleanup gap kept between jobs (default 45 min)
  - `MAX_JOBS_PER_DAY` — daily job cap (default **3**)
  - `PKG_MIN` / `SIZE_MIN` / `ADDON_MIN` — how long each job runs, which drives
    how much time it blocks. Tune these to your real time-per-car.
  - `OPEN_FROM` — closed until this date (currently `2026-07-01`; `''` to remove)
  - `MIN_LEAD_DAYS` — minimum lead time (currently **3** days out)
  - `DAYS_AHEAD` — how big a window to show, starting from the first bookable day
- **Double-booking is impossible**: a database exclusion constraint rejects any
  two active jobs whose times overlap (and the calendar won't offer them in the
  first place).

**Security:** the key in `index.html` is the Supabase *publishable* key — it's
meant to be public. Row-level security lets visitors only *create* a booking and
*see which slots are taken*; nobody can read other customers' names or phone
numbers through the public API. Only you, via the dashboard, can read them.

**Optional next step:** get notified on new bookings — a Supabase Database
Webhook or a small Edge Function can email or text you whenever a row is inserted.
(Detail Valley already does this via Resend.)

## Owner dashboard (`admin.html`)

`admin.html` is a private, mobile-first **job board** for managing bookings —
the day-to-day way to keep track of jobs instead of digging through the raw
Supabase table. It's deployed alongside the site (e.g. `detailvalley.com/admin.html`).

**What it does**
- Lists every booking grouped by day, soonest first, with a colour-coded status
  badge (**New → Confirmed → Done → Cancelled**).
- One-tap actions move a job through its lifecycle: **Confirm**, **Mark done**,
  **Cancel**, **Reopen**, **Restore**.
- Tap the phone number to call/text, tap the address to open Google Maps.
- A per-job **notes** field (gate codes, "big dog in yard", reminders) — saved
  automatically, never visible to customers.
- Filter chips (To do · New · Confirmed · Done · Cancelled · All) and a summary
  strip (new count · upcoming count · dollars booked).

**Signing in.** The dashboard uses Supabase Auth, so only you can read customer
details — the page itself is harmless to host publicly. Sign in with your owner
email (`ethangardner298@gmail.com`) and password.

**Face ID on iPhone.** The first time you sign in, iOS offers to **save the
password to iCloud Keychain** — tap *Save*. After that, the email + password
autofill behind **Face ID**, so signing in is just a glance. To set your own
password, open the dashboard → **Account & password** → *Set a new password*
(this also re-prompts your phone to save it to Keychain).

**Email-link fallback.** If you'd rather not use a password, tap **"Email me a
sign-in link instead"**. For that link to return you to the dashboard, set it up
once in Supabase → **Authentication → URL Configuration**: set **Site URL** to
`https://detailvalley.com` and add your dashboard URL(s) to **Redirect URLs**:
- `https://detailvalley.com/admin.html`
- `https://ethanskis.github.io/detailvalley/admin.html` (only if you also use the GitHub Pages URL)

(The password sign-in needs none of that.)

**How access is locked down**
- A `public.admins` allowlist table holds the user IDs allowed to manage
  bookings; an `is_admin()` helper checks it. It's seeded with your account.
- Row-level security on `bookings` grants **read + update only to admins**
  (`is_admin()`), so a signed-in non-admin sees zero rows. Anonymous visitors
  still can't read any booking through the API (they can only insert one and see
  which slots are taken). This was verified per-role before launch.
- **Add another person** (e.g. an employee) later by inserting their auth user ID
  into `public.admins`:
  ```sql
  insert into public.admins (user_id) values ('THEIR-AUTH-USER-UUID');
  ```
