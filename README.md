# Detail Valley

Marketing + booking site for **Detail Valley**, a mobile car detailing business
serving Valley County, Idaho (McCall · Cascade · Donnelly).

It's a single-page, conversion-focused static site with a built-in multi-step
booking flow (package → add-ons → details → confirm). No build step, no
dependencies — just HTML, CSS, and a little vanilla JavaScript.

## The site

`index.html` is the production site. Open it in any browser to preview it, or
host it on any static host.

> `index.html` and `logo.png` must live in the **same folder** — the page
> references the logo by relative path (`logo.png`).

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
- **Booking form** — currently a front-end demo: confirming shows a success
  screen but **does not send anything**. Wire it to Formspree, Netlify Forms,
  or a Google Form to actually receive bookings.
- **Prices & package details** — confirm against your real time-per-car before launch.
