# Migration Plan — Static Site Replacing WordPress

**Status:** Staging complete — blocked on the DNS record change
**Prepared:** 2026-10-15
**Last updated:** 2026-10-23
**Scope:** Replace the existing WordPress site at `https://midfloridawindowsanddoors.com/` with this static site.

---

## 0. Progress log

Everything below is verified against the live staging deployment
`https://midfloridawinwowsdoors.pages.dev`.

| Item | State |
|---|---|
| Site deployed to Cloudflare Pages | **Done** — project `midfloridawindowsanddoors` |
| Form delivery (risk #1) | **Done** — replaced CF7 with Formspree (`js/main.js`). No silent-drop path. |
| `_redirects` (risk #2) | **Done** — 53 explicit rules + 5 wildcards, all returning 301 to a 200 |
| Clean URLs (risk #3) | **Verified** — `/products`, `/service-area`, … all 200 on staging |
| `robots.txt` | **Done** — added, advertises `sitemap.xml` |
| Canonicals on every content page | **Done** — 9 pages |
| `sitemap.xml` | **Done** — `door-catalogs` added, now 9 URLs |
| `404.html` | **Verified** — unknown paths return 404 |
| Custom domains attached to Pages | **Done** — apex + `www`, status `pending` |
| **DNS record change (the actual cutover)** | **BLOCKED** — see §7 |
| Email/DNS housekeeping (§8) | Not started — independent of cutover |

---

## 1. Goal

Cut over the live WordPress site to this static build (HTML/CSS/JS) with:

- Zero loss of inbound leads (the estimate form must work before cutover).
- Zero loss of organic search equity (every indexed URL must resolve).
- No impact to email (`dondavid@midfloridawindowsanddoors.com` on Google Workspace).

**Principle:** preserve what ranks, restore what converts, change nothing about mail.

---

## 2. Current vs. target state

| Aspect | Current (live) | Target (this project) |
|---|---|---|
| Platform | WordPress + Contact Form 7 v6.2.2 | Static HTML/CSS/JS |
| Hosting | cPanel server `185.181.255.109`, proxied by Cloudflare | Static host (Cloudflare Pages recommended) |
| DNS | Cloudflare (`gerald`/`lucy.ns.cloudflare.com`) | Same — DNS unchanged except web record |
| Mail | Google Workspace (`aspmx.l.google.com` + `alt1–4`) | **Unchanged** |
| Form delivery | CF7 → server-side email | Client-side → bridge (to be built) |
| Indexed URLs | ~45 (from `sitemap-xag.xml`) | 8 pages in [`sitemap.xml`](sitemap.xml:1) |
| URL style | Trailing-slash, e.g. `/products/` | Extensionless, e.g. `/products` |
| Sitemap | `sitemap-xag.xml` (3 child sitemaps) | [`sitemap.xml`](sitemap.xml:1) |

---

## 3. Risk register

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **Form stops delivering** — retiring WordPress removes Contact Form 7 and `admin-ajax.php`; nothing replaces it. | High — silent lead loss | Build the send bridge (§6) **before** cutover. Verify end-to-end on a staging URL. |
| 2 | **SEO loss** — ~45 live URLs vs. 8 new pages → mass 404s. | High — ranking and traffic loss | 301 redirect map (§4) shipped in host config (§5). |
| 3 | **URL style mismatch** — new sitemap lists extensionless paths but files are `*.html`. | Medium — 404s if host doesn't rewrite | Confirm clean-URL behavior and configure rewrites (§5). |
| 4 | **DNS cutover breaks mail** | High — email outage | Touch only the web A/CNAME record; never edit MX/SPF/DKIM during cutover (§7). |
| 5 | **Existing SPF/DMARC problems** — duplicate SPF, no DMARC, Google DKIM off. | Medium — deliverability/spoofing | Housekeeping in §8 (independent of cutover). |
| 6 | **Content parity gaps** — live pages with no equivalent. | Low–Medium | Explicit mappings in §4; decide per URL. |
| 7 | **Indexed PDFs/assets** under `/wp-content/uploads/` 404 after move. | Low | Redirect to [`pdfs/`](pdfs) or keep the files (§4). |

---

## 4. URL inventory and redirect map

Source: live `https://midfloridawindowsanddoors.com/sitemap-xag.xml` → `sitemap-xagio-page.xml`, `-post.xml`, `-category.xml`.
Target: pages in this repo — [`index.html`](index.html:1), [`products.html`](products.html:1), [`service-area.html`](service-area.html:1), [`testimonials.html`](testimonials.html:1), [`photos.html`](photos.html:1), [`warranty.html`](warranty.html:1), [`licensing.html`](licensing.html:1), [`financing.html`](financing.html:1).

### 4.1 Core pages

| Live URL | New target | Type | Notes |
|---|---|---|---|
| `/` | `/` | 301 | Home incl. estimate form |
| `/service-area/` | `/service-area` | 301 | Direct equivalent |
| `/testimonials/` | `/testimonials` | 301 | Direct equivalent |
| `/warranty/` | `/warranty` | 301 | Direct equivalent |
| `/plastpro-warranty/` | `/warranty` | 301 | Warranty content |
| `/contact-us/` | `/#free-estimate` | 301 | Form now lives on the home page |

### 4.2 Product / brand pages → `/products`

The live site is a page-per-product build; the new site consolidates these onto one products page. All map to `/products` (or a section anchor if we add IDs).

| Live URLs | New target |
|---|---|
| `/windows/`, `/doors/` | `/products` |
| `/double-hung/`, `/double-hung-2/`, `/double-hung-sp/`, `/double-hung-1800-series/` | `/products` |
| `/casement/`, `/casement-sp/` | `/products` |
| `/picture-window/`, `/picture-window-sp/`, `/impact-picture-window-2/` | `/products` |
| `/geometric-window/`, `/geometric-window-sp/` | `/products` |
| `/5300-series-windows/`, `/5400-series-windows/` | `/products` |
| `/2-lite-slider/`, `/2-lite-slider-sp/`, `/3-lite-slider/` | `/products` |
| `/6300-6400-patio-doors/`, `/pgt-doors/` | `/products` |
| `/french-entry-doors/` | `/products` |
| `/plastpro/`, `/plastpro-entry-doors/`, `/plastpro-french-doors/` | `/products` |
| `/pgt/` | `/products` |
| `/simonton/`, `/simonton-2/`, `/simonton-3/`, `/simonton-4/` | `/products` |
| `/jeld-wen/`, `/gorell/`, `/yale-locksets/` | `/products` |

> **Decision needed:** consolidating ~30 product pages into one 301 target discards their individual rankings. If any of these have meaningful organic traffic, the better long-term play is to **rebuild them as dedicated pages** and 301 one-to-one. Review Search Console top pages before finalizing (see §12, Q1).

### 4.3 Low-value / junk pages → home or 410

| Live URL | Recommendation |
|---|---|
| `/sample-page/`, `/1345-2/`, `/1541-2/`, `/video-1/`, `/video-2/`, `/666/`, `/energy-star-logo/`, `/jd-power-logo/`, `/category/uncategorized/` | **410 Gone** (preferred) or 301 to `/` |

### 4.4 Assets

| Live URL pattern | Recommendation |
|---|---|
| `/wp-content/uploads/.../*.pdf` (e.g. Atrium brochure) | 301 to [`pdfs/`](pdfs) equivalent, or keep the file if we want to preserve the link |
| `/wp-content/uploads/.../*.{jpg,png,webp}` | 301 to [`images/`](images) equivalent, or keep |

### 4.5 New pages (no live equivalent)

`/photos`, `/licensing`, `/financing` — net-new; no redirects needed. Ensure they are linked from nav and added to [`sitemap.xml`](sitemap.xml:1) (already present).

### 4.6 Off-site links found in the sitemap

The live sitemap includes outbound third-party PDF links (millworksales, pgtindustries, simonton, soft-lite, reeb, secureservercdn). These are external — **no action**, but confirm any that are linked from our pages still resolve.

---

## 5. Hosting configuration (Cloudflare Pages)

**Recommended host:** Cloudflare Pages — DNS is already on Cloudflare, so cutover is one record change and redirects ship with the deploy.

### 5.1 Clean URLs

This repo's [`sitemap.xml`](sitemap.xml:1) advertises extensionless paths (`/products`), but the files are `products.html`. Requirements:

- Confirm the host serves `/products` for `products.html` (Cloudflare Pages does this by default, and 308-redirects `/products.html` → `/products`).
- If the host does **not**, either add rewrites or change links/sitemap to `.html`.
- **Must be verified on a preview URL before cutover** — this is the single most common cutover 404.

### 5.2 `_redirects` file (to add at repo root)

Format: `/from /to 301`. Trailing slashes on the *source* must match the live URLs.

```
# Core pages
/service-area/                /service-area          301
/testimonials/                /testimonials          301
/warranty/                    /warranty              301
/plastpro-warranty/           /warranty              301
/contact-us/                  /#free-estimate        301

# Product + brand pages → /products
/windows/                     /products              301
/doors/                       /products              301
/double-hung/                 /products              301
/double-hung-2/               /products              301
/double-hung-sp/              /products              301
/double-hung-1800-series/     /products              301
/casement/                    /products              301
/casement-sp/                 /products              301
/picture-window/              /products              301
/picture-window-sp/           /products              301
/impact-picture-window-2/     /products              301
/geometric-window/            /products              301
/geometric-window-sp/         /products              301
/5300-series-windows/         /products              301
/5400-series-windows/         /products              301
/2-lite-slider/               /products              301
/2-lite-slider-sp/            /products              301
/3-lite-slider/               /products              301
/6300-6400-patio-doors/       /products              301
/pgt-doors/                   /products              301
/french-entry-doors/          /products              301
/plastpro/                    /products              301
/plastpro-entry-doors/        /products              301
/plastpro-french-doors/       /products              301
/pgt/                         /products              301
/simonton/                    /products              301
/simonton-2/                  /products              301
/simonton-3/                  /products              301
/simonton-4/                  /products              301
/jeld-wen/                    /products              301
/gorell/                      /products              301
/yale-locksets/               /products              301

# Junk pages → gone
/sample-page/                 /                      301
/1345-2/                      /                      301
/1541-2/                      /                      301
/video-1/                     /                      301
/video-2/                     /                      301
/666/                         /                      301
/energy-star-logo/            /                      301
/jd-power-logo/               /                      301
/category/uncategorized/      /                      301
```

> Preferred over 301-to-home for junk: a true `410` where the host supports it, so Google drops them faster.

---

## 6. Form delivery (highest priority)

Retiring WordPress removes Contact Form 7, so the static form in [`js/main.js`](js/main.js:231) currently only *simulates* a submission and would silently drop leads. A send bridge is required.

### 6.1 Decision

Use the **existing Google Workspace account** to send. Verified live: mail is Google (`aspmx.l.google.com` + `alt1–4`, `mx.google.com … gsmtp`), so mail sent as the Workspace mailbox inherits Google's SPF/DKIM.

### 6.2 Option A — Google Apps Script Web App (recommended)

- Apps Script bound to the Workspace account; `doPost` sends via `MailApp.sendEmail({ to: "dondavid@midfloridawindowsanddoors.com", replyTo: <visitor>, … })` and optionally logs each submission to a Google Sheet.
- Deploy **Execute as: Me**, **Access: Anyone**.
- Quota: **1,500 recipients/day** on Workspace — ample.
- No DNS change; free.
- **Caveat:** Apps Script web apps do not answer CORS preflight. Client posts with `mode: "no-cors"` + `Content-Type: text/plain`, so the response is opaque → show an optimistic confirmation, not a server-read status.

### 6.3 Option B — Cloudflare Worker + Gmail API

- Worker holds a service-account key (domain-wide delegation) and calls `gmail.users.messages.send`.
- Real status codes, no CORS workaround; more setup (Google Cloud project, service account, scopes, Worker deploy).

### 6.4 Implementation checklist (either option)

- [ ] Wire the form to the chosen endpoint and re-introduce real validation (required/email/phone) plus inline error styling.
- [ ] Set `replyTo` to the submitter so replies reach them, not the site.
- [ ] Add a honeypot or lightweight bot guard (the static form has none today).
- [ ] Test: valid submit, invalid email, missing required field, network failure fallback.
- [ ] Confirm the message arrives in `dondavid@…` and replies route to the visitor.

---

## 7. DNS cutover (Cloudflare)

Authoritative NS: `gerald.ns.cloudflare.com`, `lucy.ns.cloudflare.com`.
Zone ID: `2cb921da49e702c83b259be6682a8e81` (active).
Account: `5536466c3f67bdd91b75891340bcdaea`.

### 7.1 What is done

- [x] Deployed this site to Cloudflare Pages (project `midfloridawindowsanddoors`).
- [x] Attached `midfloridawindowsanddoors.com` and `www.midfloridawindowsanddoors.com`
      as custom domains via the Pages API — both return `success: true`,
      status `pending`.

### 7.2 What is blocked, and why

**The current `wrangler` OAuth token cannot modify DNS.** Its scopes are
`zone (read)` and `pages (write)` — there is no `dns_records` scope:

```
$ curl .../zones/$ZONE/dns_records
{"success": false, "errors": [{"code": 10000,
  "message": "Authentication error"}]}
```

So the domains sit at `pending` and the apex still resolves to the WordPress
origin. Because the apex already carries proxied `A` records, Cloudflare's
automatic DNS-record creation for a Pages custom domain does not fire — those
records have to be replaced, not added.

### 7.3 The one remaining action

Either grant the token `dns_records:edit` (or run `wrangler login` with a token
that has **Zone → DNS → Edit**), or make the change in the dashboard. Then, in
Cloudflare → DNS, replace the apex records:

| Type | Name | Current | Change to |
|---|---|---|---|
| `A` | `midfloridawindowsanddoors.com` | `104.21.16.193` | delete |
| `A` | `midfloridawindowsanddoors.com` | `172.67.215.145` | delete |
| `AAAA` | `midfloridawindowsanddoors.com` | `2606:4700:3033::6815:10c1` | delete |
| `AAAA` | `midfloridawindowsanddoors.com` | `2606:4700:3037::ac43:d791` | delete |

…then add a single **proxied CNAME** at `@` →
`midfloridawinwowsdoors.pages.dev`. Do the same for `www`.

> **The target hostname is misspelled — this is not a typo in this document.**
> The Pages project was created with the subdomain
> `midfloridawinwowsdoors.pages.dev` ("**winwows**"), while the project *name*
> is correctly `midfloridawindowsanddoors`. Confirmed against the API:
>
> ```
> project name : midfloridawindowsanddoors
> subdomain    : midfloridawinwowsdoors.pages.dev
> ```
>
> `midfloridawindowsanddoors.pages.dev` **does not resolve at all**, so a CNAME
> pointed at it would take the site down. A `PATCH` on the project with the
> corrected `subdomain` returns `success: true` but does not change it — the
> subdomain is fixed at creation. To get the clean name the project must be
> **deleted and recreated** as `midfloridawindowsanddoors` (then re-deploy, since
> the git integration would need reconnecting).
>
> This is cosmetic only: a custom domain (`midfloridawindowsanddoors.com`) does
> not depend on the `*.pages.dev` subdomain, so the cutover works fine with the
> misspelled subdomain left in place.

The 104.x/172.x addresses are Cloudflare's own anycast ranges, so the origin
behind them cannot be read from outside — it may or may not be the WordPress host.

### 7.4 Rollback

The origin behind those four records is **not recoverable from public DNS**,
because they are proxied Cloudflare IPs. Before deleting them, read the real
targets in the dashboard (DNS → Records → toggle "Proxy status" off, or open each
record) and save them here:

```
apex A     -> ........................................
apex AAAA  -> ........................................
www        -> ........................................
```

With those written down, rollback is: delete the Pages CNAMEs, re-create the
saved records, re-enable proxying.

### 7.5 Cutover checklist

- [ ] Record the real (unproxied) origin values above.
- [ ] Lower the TTL on the apex records to 300s and wait ~24h.
- [ ] Do **not** touch: `MX` (Google), root `TXT` SPF/DKIM/verification, `_dmarc`, `_acme-challenge`.
- [ ] Review cPanel-style subdomains (`cpanel.`, `cpcalendars.`, `cpcontacts.`, `webdisk.`, `webmail.`, `whm.`, `ftp.`) — they point at the old host; decide whether to remove or leave.
- [ ] Lower TTL on the root record to 300s ~24h before cutover; restore after validation.
- [ ] Keep the cPanel/WordPress host live (unused) for at least 2 weeks for rollback.

---

## 8. Email/DNS housekeeping (independent of cutover)

Verified live; recommend fixing regardless of hosting decision:

1. **Duplicate SPF records — merge into one.** Two live `v=spf1` records cause a PermError at receivers:
   - `"v=spf1 include:_spf.google.com ~all"`
   - `"v=spf1 +a +mx +ip4:170.39.76.57 ~all"`
   - Merge to a single record (Google include first; add the other sources only if still used).
2. **Add DMARC** — `_dmarc` currently returns nothing. Start with `v=DMARC1; p=none; rua=mailto:dondavid@…` and tighten later.
3. **Enable DKIM in the Google Admin console** — `google._domainkey` is absent; only the cPanel `default._domainkey` exists, which Google-sent mail won't align to.

---

## 9. SEO parity

- [ ] Replace/redirect the live `sitemap-xag.xml` reference: [`robots.txt`](robots.txt) must point to our [`sitemap.xml`](sitemap.xml:1). *(No `robots.txt` exists in this repo yet — add one.)*
- [ ] Remove live-only crawl directives (`/wp-admin/` rules) that no longer apply.
- [ ] Verify per-page `<title>`/`<meta description>` cover the terms the old product pages ranked for (see [`index.html`](index.html:8)).
- [ ] Confirm canonical tags and Open Graph URLs on every page.
- [ ] Check structured data (`LocalBusiness` in [`index.html`](index.html:35)) validates and matches NAP details in [`llms.txt`](llms.txt:9).
- [ ] Update [`llms.txt`](llms.txt:1) page list if any URL changes.
- [ ] Submit the new sitemap in Search Console immediately post-cutover; use the Change of Address tool if moving hosts/URLs.

---

## 10. Pre-launch QA checklist

- [ ] Every redirect in §5.2 returns 301 to a 200 (spot-check the whole list with a crawler).
- [ ] Clean URLs work (`/products`, `/service-area`, …) and `.html` variants redirect or resolve.
- [ ] Form: valid submit delivered, invalid input blocked, failure path handled (§6.4).
- [ ] `404.html` serves on unknown paths.
- [ ] Mobile nav, product dropdowns, gallery/lightbox, PDF viewer behave ([`js/main.js`](js/main.js:1), [`js/pdf-viewer.js`](js/pdf-viewer.js:1)).
- [ ] Internal links and image paths resolve (no `wp-content` leftovers).
- [ ] Page speed / Lighthouse check on the preview URL.
- [ ] `favicon.svg`, [`logo.svg`](logo.svg) load; social share preview renders.

---

## 11. Rollback plan

- Keep the WordPress host live and the DNS record value recorded before change.
- If issues arise: restore the root DNS record to `185.181.255.109`; propagation is fast (low TTL) and the old site is untouched.
- Because mail is on separate MX records, email is never at risk during rollback.

---

## 12. Open questions (need answers before implementation)

1. **Product pages:** keep ~30 separate pages (preserve rankings) or 301 them all into `/products`? Check Search Console top pages.
2. **Junk URLs:** 410 Gone or 301 to home?
3. **Host:** confirm Cloudflare Pages as the target, or a different static host.
4. **Form bridge:** Option A (Apps Script) or Option B (Cloudflare Worker + Gmail API)?
5. **Old assets:** keep `/wp-content/uploads/` files served, or redirect to `pdfs/` + `images/`?
6. **`/contact-us/`:** OK to fold into `/#free-estimate`, or should a dedicated contact page exist?
7. **cPanel subdomains:** remove (`cpanel.`, `whm.`, `webdisk.`, …) or leave in DNS?

---

## 13. Suggested execution order

1. Decide §12 items 4 and 1 (form bridge + product-page strategy) — they shape the rest.
2. Build and test the form bridge (§6).
3. Create `_redirects` (§5.2) and `robots.txt` (§9).
4. Deploy to a preview/staging URL; run §10 QA there.
5. Housekeeping §8 (SPF/DKIM/DMARC) on a low-risk day.
6. Cutover §7; validate; submit sitemap; monitor 404s daily for two weeks.
