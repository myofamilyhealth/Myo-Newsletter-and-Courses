# Myo Family Health — Courses, Shop & Newsletter

The Myo Family Health learning site: online courses, a shop, member sign-in with
locked paid lessons, newsletter sign-up, and an **owner dashboard** for creating
courses without touching code.

**Breathe Better… Live Better!**

## What's in it

| Page | What it does |
|---|---|
| `/` | Home: hero, featured courses, topics, shop preview, newsletter sign-up |
| `/courses.html` | Full catalog, filterable by topic, audience (kids / families / adults / professionals), free or paid, and search |
| `/course.html?c=<slug>` | Course sales page: what you'll learn, description, curriculum, price and Buy button |
| `/learn.html?c=<slug>&l=<id>` | Lesson player: video, notes, downloads, progress, next/previous |
| `/shop.html` | Bundles, digital downloads, physical products, sessions |
| `/account.html` | "My courses": passwordless sign-in and progress |
| `/admin/` | **Owner dashboard** (password protected) |

### Owner dashboard

- **Courses**: create, edit, duplicate, delete; draft or published; price and "was" price;
  category, audience, level, card colour, cover image, featured on home page, display order.
- **Lessons**: add, edit, reorder; group into sections or modules; video link (YouTube,
  Vimeo, Loom or .mp4); lesson notes with formatting and live preview; download link;
  mark any lesson as a **free preview**.
- **Shop**: bundles (choose which courses they include), downloads, products, sessions.
- **Categories**: the topics visitors filter by.
- **Members**: give someone a course, remove access, copy a one-time sign-in link.
- **Newsletter**: every sign-up from the site, with a CSV download.

### How access works

- **Free course** (price 0): open to everyone, no sign-in needed. Signing in saves progress.
- **Paid course**: lessons are locked on the **server**. A visitor sees titles only until
  they own the course. Lessons marked *free preview* are open to all.
- **Members** sign in with a one-time email link. There are no passwords to forget or leak.

## Payments: SamCart

SamCart runs checkout, **upsells, downsells and order bumps** on its own pages. This
site only needs to know which SamCart products unlock which courses:

1. In SamCart, create a product for each course, plus any upsell, downsell or bump products.
2. In the dashboard, open the course and paste:
   - **SamCart checkout link**: the course's Buy button opens it.
   - **SamCart product ID(s)**: buying any of these unlocks the course, including as an
     upsell or downsell. For bundles, use **Shop** and tick the included courses.
3. Set the secret part of the notification address (any long random string):
   `npx wrangler secret put SAMCART_WEBHOOK_SECRET`
4. Copy the address from **Dashboard → Payments** into SamCart's webhook / Notify URL
   settings, for orders, upsells and refunds.

After that, a purchase unlocks the course(s) for the buyer's email, and a refund removes
access to the refunded course. Every notification is logged under **Dashboard → Payments**
(with a *Details* view of exactly what SamCart sent), so the first real test purchase can be
checked there. SamCart's notification fields have varied between event types, so
`readSamcart()` in `src/worker.js` accepts the known shapes; adjust it there if a real
notification shows a different one.

## Not connected yet (by design)

Payments and email are left as clearly marked hooks in `src/worker.js`:

| Hook | Today | Later |
|---|---|---|
| **Payments** | Built for SamCart (see above). Until `SAMCART_WEBHOOK_SECRET` is set, owners grant access under **Members**. | — |
| **Email**: `sendEmail()` | Sign-in links aren't emailed. Owners use **Copy sign-in link** in Members. Newsletter sign-ups are stored and exportable as CSV. | Plug in an email provider and set `EMAIL_PROVIDER`. Sync subscribers to the email list. |

## Safe to be public

This repository contains **no secrets and no customer data**:

- The dashboard password and session key are **Cloudflare secrets**
  (`wrangler secret put`), never in code. `.dev.vars` (local only) is git-ignored.
- The dashboard password is checked on the server, with a lockout after repeated wrong guesses.
- Paid lesson content is only sent by the server to people who own the course.
- Sign-in links are single-use, expire after 30 minutes and are stored only as a hash.
- The sign-in form gives the same answer for any email, so it can't reveal who bought what.
- Requests from other websites are refused; cookies are `HttpOnly` and `SameSite`.
- Links and videos must be `http(s)`, and course text is escaped before display, so nothing
  typed in the dashboard can inject code.
- No card data ever touches this site. Payments happen on the provider's checkout page.
- The database ID in `wrangler.toml` is not a secret. It's useless without the Cloudflare account.

For paid videos, use **unlisted** YouTube or **private/domain-locked** Vimeo videos so they
can't be found by searching.

## Two ways it runs

| | **GitHub Pages** (free, live now) | **Cloudflare** (full site) |
|---|---|---|
| URL | https://myofamilyhealth.github.io/Myo-Newsletter-and-Courses/ | `https://myo-courses.<account>.workers.dev` or your domain |
| Catalog, course pages, shop | ✓ | ✓ |
| Free courses + free previews | ✓ | ✓ |
| Newsletter sign-up | ✓ (your Brevo form) | ✓ (saved in the dashboard) |
| Paid lessons | Locked (content is never published to Pages) | Unlock for buyers |
| Member sign-in, progress | — | ✓ |
| Owner dashboard | — | ✓ |

GitHub Pages is rebuilt on every push by `.github/workflows/pages.yml`, which runs
`scripts/export-static.mjs` to turn `seed.sql` into `public/data/*.json`. Only free
courses and free-preview lessons are exported. **Never put real paid lesson content in
`seed.sql`**: the repo is public. Paid content belongs in the dashboard (Cloudflare database).

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars          # local-only password + secret
npm run db:init:local                    # creates tables + sample content
npm run dev                              # http://localhost:8787
```

The dashboard is at http://localhost:8787/admin/ (password from `.dev.vars`).
Locally, `DEV_SHOW_LOGIN_LINKS=true` shows member sign-in links on screen.

## Deploy (Cloudflare Workers, free tier)

```bash
npx wrangler login
npx wrangler d1 create myo-courses             # copy the database_id into wrangler.toml
npm run db:init:remote                          # create tables
npm run db:seed:remote                          # optional: sample content
npx wrangler secret put ADMIN_PASSWORD          # the owners' dashboard password
npx wrangler secret put SESSION_SECRET          # any long random string
npx wrangler secret put SAMCART_WEBHOOK_SECRET  # any long random string (for SamCart)
npm run deploy
```

Then add a custom domain (e.g. `learn.myofamilyhealth.com`) in Cloudflare and set
`SITE_URL` in `wrangler.toml` to match.

## Files

```
src/worker.js        API + security + payment/email hooks
schema.sql           database tables
seed.sql             sample courses (edit or delete in the dashboard)
public/              the website (HTML, CSS, JS, brand assets)
  admin/             owner dashboard
  js/common.js       shared header/footer, cards, safe formatting, video embeds
  css/site.css       brand styles (teal, sage, slate, sand)
```
