# Migration Plan — Static Site Replacing WordPress

**Status:** **Cutover complete and verified live**
**Prepared:** 2026-10-15
**Last updated:** 2026-10-23
**Scope:** Replace the existing WordPress site at `https://midfloridawindowsanddoors.com/` with this static site.

---

## 0. Progress log

Every row below was re-verified against production on **2026-10-23**, not against staging.

| Item | State |
|---|---|
| Site deployed to Cloudflare Pages | **Done** — project `midfloridawindowsanddoors` |
| Custom domains attached | **Done** — apex serves the build; `www` 301s to the apex (§5.3) |
| DNS cutover | **Done** — apex and `www` resolve to Pages; old WordPress origin is off the public record |
| Form delivery (risk #1) | **Done** — Formspree (`mljganyg`) from [`js/main.js`](js/main.js:249). No silent-drop path. |
| `_redirects` (risk #2) | **Done and verified** — 62 rules, every source returns 301 to a 200 |
| Clean URLs (risk #3) | **Verified** — `/products`, `/service-area`, … all 200; `*.html` 308s to the extensionless form |
| `robots.txt` | **Done** — advertises `sitemap.xml`, disallows internal tooling |
| Canonicals on every content page | **Done** — 9 pages |
| `sitemap.xml` | **Done** — 9 URLs, `lastmod` refreshed to 2026-10-23 |
| `404.html` | **Verified** — unknown paths return 404 |
| Social share card | **Done** — [`images/og-card.jpg`](images/og-card.jpg) 1200×630, wired to `og:image` + `twitter:image` on all 9 pages |
| PDF viewer zoom + fit (§5.4) | **Done and verified in production** — `+`/`-` scale the page; Fit width is default, Fit page one click away |
| Email/DNS housekeeping (§8) | **Partly done** — duplicate SPF already merged; DMARC and Google DKIM still open |

---

## 1. Goal

Cut over the live WordPress site to this static build (HTML/CSS/JS) with:

- Zero loss of inbound leads (the estimate form must work before cutover).
- Zero loss of organic search equity (every indexed URL must resolve).
- No impact to email (`dondavid@midfloridawindowsanddoors.com` on Google Workspace).

**Principle:** preserve what ranks, restore what converts, change nothing about mail.

---

## 2. Current vs. target state

| Aspect | Before (WordPress) | Now (this project) |
|---|---|---|
| Platform | WordPress + Contact Form 7 v6.2.2 | Static HTML/CSS/JS |
| Hosting | cPanel server `185.181.255.109`, proxied by Cloudflare | Cloudflare Pages |
| DNS | Cloudflare (`gerald`/`lucy.ns.cloudflare.com`) | Same zone, web records repointed |
| Mail | Google Workspace (`aspmx.l.google.com` + `alt1–4`) | **Unchanged** |
| Form delivery | CF7 → server-side email | Client-side → Formspree |
| Indexed URLs | ~45 (from `sitemap-xag.xml`) | 9 pages in [`sitemap.xml`](sitemap.xml:1), all old URLs redirected |
| URL style | Trailing-slash, e.g. `/products/` | Extensionless, e.g. `/products` (`.html` and trailing-slash variants redirect) |
| Sitemap | `sitemap-xag.xml` (3 child sitemaps) | [`sitemap.xml`](sitemap.xml:1); old paths 301 here |

---

## 3. Risk register — final status

| # | Risk | Impact | Outcome |
|---|---|---|---|
| 1 | **Form stops delivering** — retiring WordPress removes Contact Form 7 and `admin-ajax.php`; nothing replaces it. | High — silent lead loss | **Closed.** Formspree endpoint in every form's `action`; [`js/main.js`](js/main.js:270) rejects any non-`formspree.io` host so a tampered action cannot exfiltrate leads. Failure path shows the phone number instead of a false success. |
| 2 | **SEO loss** — ~45 live URLs vs. 9 new pages → mass 404s. | High — ranking and traffic loss | **Closed.** All 62 rules verified 301 → 200 (§4). |
| 3 | **URL style mismatch** — sitemap lists extensionless paths but files are `*.html`. | Medium — 404s if host doesn't rewrite | **Closed.** Cloudflare Pages serves `/products` and 308s `/products.html` → `/products`. |
| 4 | **DNS cutover breaks mail** | High — email outage | **Closed.** MX untouched; Google Workspace records intact (§7.4). |
| 5 | **SPF/DMARC problems** — duplicate SPF, no DMARC, Google DKIM off. | Medium — deliverability/spoofing | **Partially closed.** SPF is now a single record; DMARC and Google DKIM remain (§8). |
| 6 | **Content parity gaps** | Low–Medium | **Closed.** Archive audit of the old site found no content URL without a mapping (§4.3). |
| 7 | **Indexed PDFs/assets** under `/wp-content/uploads/` 404 after move. | Low | **Closed.** Both documents that had been published are handled — one redirected to `/door-catalogs`, one recovered to [`pdfs/pgt-warranty.pdf`](pdfs/pgt-warranty.pdf). |

---

## 4. URL inventory and redirect map

Source: live `sitemap-xag.xml` plus a Wayback CDX crawl of the whole domain, cross-checked on 2026-10-23.

### 4.1 Verified redirects

[`_redirects`](_redirects:1) holds **62 rules**. A full sweep of every source URL returned the expected status, and every destination returned 200:

| Group | Rules | Result |
|---|---|---|
| Core pages (`/service-area/`, `/testimonials/`, `/warranty/`, `/plastpro-warranty/`, `/contact-us/`) | 5 | 301 → 200 |
| Product + brand pages → `/products` | 32 | 301 → 200 |
| Junk pages → `/` | 9 | 301 → 200 |
| WordPress internals (`/wp-admin/*`, `/wp-login.php`, `/wp-content/*`, `/wp-includes/*`, `/wp-json`, `/feed`, `/author/*`, `/comments/feed/`) | 10 | 301 → 200 |
| Sitemap handoff (`/sitemap-xag*.xml`, `/sitemap_index.xml`, `/wp-sitemap*.xml`) | 7 | 301 → 200 |
| Published documents (Atrium brochure, PGT warranty PDF) | 2 | 301 → 200 |

### 4.2 Product page consolidation (decision recorded)

The old site was page-per-product; the new site consolidates onto `/products`. This discards the individual rankings of ~30 low-authority product pages, which was the tradeoff accepted in §12 Q1.

**If Search Console later shows organic traffic to any specific product URL**, rebuild that one page and change its single `_redirects` line from `/products` to the new page. Nothing else has to move.

### 4.3 Junk pages

Nine test/placeholder pages 301 to `/` rather than returning 410. Cloudflare Pages does honour `410` in `_redirects` if a faster de-index is wanted later.

### 4.4 Assets

| Old pattern | Handling |
|---|---|
| `/wp-content/uploads/2020/09/Atrium-Series-130-Brochure-1.pdf` | 301 → `/door-catalogs` |
| `/wp-content/uploads/2021/11/1._all_residential_products_warranty_6.2016-1.pdf` | 301 → [`pdfs/pgt-warranty.pdf`](pdfs/pgt-warranty.pdf) (recovered from the old origin before decommissioning) |
| Other `/wp-content/uploads/...` images | 301 → `/` via the `/wp-content/*` wildcard. The old image files were decorative page furniture; no page links to them any more. |

There are **no `wp-content` references left in any HTML, CSS, or JS file** — verified by a repo-wide grep.

### 4.5 New pages (no live equivalent)

`/photos`, `/licensing`, `/financing`, `/door-catalogs` — net-new, in [`sitemap.xml`](sitemap.xml:1) and [`llms.txt`](llms.txt:59).

### 4.6 Off-site links

Third-party PDF links (millworksales, pgtindustries, simonton, soft-lite, reeb, customhurricaneproducts) remain outbound and are the manufacturers' to keep alive.

---

## 5. Hosting configuration (Cloudflare Pages)

### 5.1 Clean URLs — verified

- `/products` → **200**
- `/products.html` → **308** → `/products`
- `/products/` → **308** → `/products`

### 5.2 `_redirects`

Shipped at the repo root and live in production. Sources keep the trailing slash the old site published, since that is the form Google indexed. Rule order matters: the two specific `/wp-content/uploads/*.pdf` rules sit **above** the `/wp-content/*` wildcard.

### 5.3 Canonical host — `www` → apex

Both `midfloridawindowsanddoors.com` and `www.midfloridawindowsanddoors.com` are attached to the Pages project, so by default both answer `200` with byte-identical HTML — two URLs for every page, which splits ranking signals.

This **cannot** be solved in `_redirects`: that file matches on path only and has no access to the request hostname. It is handled instead by a Pages Function at [`functions/_middleware.js`](functions/_middleware.js), which runs before the asset is served:

```js
if (REDIRECT_HOSTS.has(url.hostname)) {
  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  url.port = "";
  return Response.redirect(url.toString(), 301);
}
return context.next();
```

- `301` (not `308`) — intentional permanent host move; crawlers and browsers should cache it and stop asking.
- Path, query string, and trailing segments all survive the hop (`/products?utm_source=fb` → apex `/products?utm_source=fb`).
- Apex requests fall straight through to the static asset; no rewriting, so `_redirects` and the `404.html` fallback behave exactly as before.
- Verified consistent with every canonical tag and `og:url` in the repo — all nine indexable pages already declare the **apex** as canonical, so the redirect direction is the one the markup was already asserting.

Verified live after deploy:

```
$ curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://www.midfloridawindowsanddoors.com/products
301 https://midfloridawindowsanddoors.com/products

$ curl -sL -o /dev/null -w '%{url_effective} %{http_code} %{num_redirects}\n' \
    'https://www.midfloridawindowsanddoors.com/products?utm_source=fb'
https://midfloridawindowsanddoors.com/products?utm_source=fb 200 1
```

One hop, apex returns `200`, query string intact, and the apex `404` and `_redirects` behaviour are unchanged. `http://www` takes two hops (`http→https`, then `www→apex`) because Cloudflare's Always Use HTTPS rule runs first — expected, and harmless.

> Pages picked up `functions/` automatically. If it ever stops doing so, the equivalent fallback is a zone-level **Redirect Rule**: `host eq www.midfloridawindowsanddoors.com` → `concat("https://midfloridawindowsanddoors.com", http.request.uri.path)`, with query-string preservation enabled.

### 5.4 PDF viewer — zoom and fit behaviour

[`pdf-viewer.html`](pdf-viewer.html:1) renders a whitelisted PDF with PDF.js. Two defects were fixed here; both were live before the fix.

**Dead `+` / `-` buttons.** [`scaleFor()`](js/pdf-viewer.js:157) returned the fit-width scale and never multiplied by `zoom`, so every click relabelled the percentage and re-rendered every page at an identical size. Two further faults would have masked the repair: [`max-width: 100%`](css/styles.css:1558) on `.pdf-page-wrap`/`.pdf-page` clamped zoom-in straight back to fit-width, and `buildPages()` set only `min-height`, leaving placeholders with no width to scroll horizontally against. Removed the clamps, set an explicit wrapper width, and rounded canvas dimensions to match it so no 1px seam shows.

**Three scrolls per page on desktop.** Fit-width was the only mode, and on a 1106px stage it renders a Letter page 1390px tall inside ~656px of visible area — 2.11 screens per page. Mobile was never affected (fit-width yields a 358px page there), which is exactly why the complaint was desktop-only.

[`fitMode`](js/pdf-viewer.js:129) adds a second mode so the whole sheet can be brought into view in one click. **Fit width is the default**, at every viewport: it is the familiar behaviour, it keeps the text at full legible size, and it matches what phones already did. Fit page is the deliberate opt-in for reading layout rather than detail.

| Viewport | Default (Fit width) | After clicking Fit page |
|---|---|---|
| Desktop 1440×900 | 1072×1387 — 2.11 screens/page | 507×656 — **1.00 screen** |
| Desktop 1280×800 | 912×1180 — 2.12 screens/page | 430×556 — **1.00 screen** |
| Tablet 820×1180 | 722×934 — 1.00 screen | 722×934 — 1.00 screen |
| Phone 390×844 | 277×358 — 0.60 screen | 277×358 — 0.60 screen |

So the desktop complaint now has a one-click answer instead of requiring `Ctrl`-zoom on the browser. Text stays legible by default and the reader chooses when to trade that for the whole page.

`Fit width` and `Fit page` are persistent modes (`aria-pressed`), not one-shot resets — the old single button could not leave page mode. An explicit choice survives resize; the default only re-applies until the reader picks one. The static markup marks `Fit width` active, so the correct button looks pressed before the script runs.

> `pageHeightPt` comes from page 1. A document with mixed page sizes would lay out every page at page 1's height. Current catalogues are uniform, so this is latent, not active.

---

## 6. Form delivery

**Shipped: Formspree.** All nine forms post to `https://formspree.io/f/mljganyg`.

- `action` is read per-form, never hard-coded in JS.
- [`js/main.js`](js/main.js:270) validates the endpoint host is `formspree.io` before posting, so a script-injected or copy-pasted `action` cannot redirect submissions elsewhere.
- Required-field validation with inline red borders; a failure never shows a success message.
- 422 shows Formspree's per-field errors; 429 (monthly quota) and network errors both fall back to the phone numbers.
- `Accept: application/json` + `FormData` keeps the native form POST working without JS.

The Apps Script / Worker bridge described in earlier revisions of this document was **not** needed — Formspree removed the dependency on the old mail path entirely, so no MX, SPF, or DKIM change was required to start collecting leads.

### 6.1 Remaining form work

- [ ] **Bot guard.** There is no honeypot field `<form>`; Formspree's own spam filtering is the only protection. Add a CSS-hidden `_gotcha` field to each form if spam appears.
- [ ] Confirm a real submission — and a reply to it — lands in `dondavid@midfloridawindowsanddoors.com` (owner inbox check, cannot be done from here).
- [ ] Add `_replyto` handling confirmation: Formspree uses the `email` field automatically, but a manual test per form is worth one pass.

---

## 7. DNS cutover — done

### 7.1 What changed

Apex and `www` both resolve to the Pages deployment:

```
$ curl -sI https://midfloridawindowsanddoors.com/ | grep -i server
server: cloudflare
```

The apex serves the static build with `200`. `www` is attached as a custom domain but is now `301`'d to the apex by [`functions/_middleware.js`](functions/_middleware.js) (§5.3), so only one hostname ever serves content.

The four proxied apex records that pointed at the cPanel origin (`104.21.16.193`, `172.67.215.145`, and the two `2606:4700:*` AAAA records) are no longer in front of the site.

### 7.2 Rollback

Rollback is now a **DNS-only** operation, because the old WordPress origin was never deleted — it still answers directly:

```
$ curl -s -o /dev/null -w '%{http_code}' http://185.181.255.109/
200
```

If a rollback were ever needed: point the apex and `www` back at the old host (`185.181.255.109`, proxied), and the WordPress site returns exactly as it was. No file restore required. **Keep that cPanel account alive** until this document is retired.

> The exact unproxied target values from before cutover were not recorded in this repo (§7.4 of the prior revision listed them as TODO). They are not needed — the origin IP above is the same server, and it responds.

### 7.3 Mail safety

MX still points at Google Workspace and was never touched:

```
1  aspmx.l.google.com
5  alt1.aspmx.l.google.com
5  alt2.aspmx.l.google.com
10 alt3.aspmx.l.google.com
10 alt4.aspmx.l.google.com
```

### 7.4 cPanel subdomains — resolved

`cpanel.`, `cpcalendars.`, `cpcontacts.`, `webdisk.`, `webmail.`, `whm.` and `ftp.` **return no A records**. They were removed at cutover; no cPanel hostnames remain in the zone.

---

## 8. Email/DNS housekeeping — remaining owner actions

Re-verified live on 2026-10-23. Three items from the original audit, one of which is now fixed:

1. **SPF — fixed.** A single record remains:
   ```
   "v=spf1 include:_spf.google.com ~all"
   ```
   The duplicate `+a +mx +ip4:170.39.76.57` record is gone, so receivers no longer see a PermError.

2. **DMARC — still missing.** `_dmarc.midfloridawindowsanddoors.com` returns nothing. Add a TXT record:
   ```
   _dmarc  TXT  "v=DMARC1; p=none; rua=mailto:dondavid@midfloridawindowsanddoors.com"
   ```
   Start at `p=none` and collect reports for 2–4 weeks before tightening to `quarantine`.

3. **Google DKIM — still off.** `google._domainkey` returns nothing. Enable it in **Google Admin console → Apps → Google Workspace → Gmail → Authenticate email**, generate the 2048-bit key, and publish the TXT record it gives you. Without it, mail sent as the Workspace mailbox does not DKIM-align, which is exactly the case DMARC will judge.

Both remaining items are **dashboard-only** — the deployed `wrangler` OAuth token has `zone (read)` + `pages (write)` and cannot write DNS records:

```
$ curl .../zones/$ZONE/dns_records
{"success": false, "errors": [{"code": 10000, "message": "Authentication error"}]}
```

To do these from the CLI, refresh the token with **Zone → DNS → Edit** via `wrangler login`.

---

## 9. SEO parity

- [x] [`robots.txt`](robots.txt:1) exists and advertises our [`sitemap.xml`](sitemap.xml:1), not the old `sitemap-xag.xml`.
- [x] Old WordPress crawl directives are gone (`/wp-admin/` is only present as a redirect source, not a crawl rule).
- [x] Per-page `<title>` / `<meta description>` present on all 9 indexable pages.
- [x] Canonical + `og:url` on all 9 pages, each self-referencing on the canonical host.
- [x] Structured data validates as JSON (`HomeAndConstructionBusiness` + `FAQPage` on the home page, `LocalBusiness` on the interior pages) and NAP matches [`llms.txt`](llms.txt:12) exactly: *2451 McMullen Booth Road Ste. 258, Clearwater, FL 33759*.
- [x] [`llms.txt`](llms.txt:1) page list covers all 9 pages including `/door-catalogs`.
- [x] `og:image` / `twitter:image` on all 9 pages — previously missing on 8 of them, so shared links had no preview.
- [x] `ezmax.html` no longer advertises `customhurricaneproducts.com` as its canonical URL; it is `noindex, follow` on our own domain. `pdf-viewer.html` is also `noindex`.
- [ ] **Submit the new sitemap in Search Console** and request indexing for the four net-new pages. Owner action — needs the GSC account.
- [ ] **Watch 404s daily for two weeks** in Cloudflare Analytics (Pages → the project → Analytics) and in GSC's Pages report.

---

## 10. Pre-launch QA — results

- [x] Every redirect returns 301 to a 200 (all 62 rules swept programmatically).
- [x] Clean URLs work; `.html` and trailing-slash variants redirect.
- [x] `404.html` serves on unknown paths.
- [x] No internal links or image paths reference `wp-content`.
- [x] `sitemap.xml` is well-formed XML; all JSON-LD blocks parse.
- [x] `favicon.svg` and [`logo.svg`](logo.svg) load; social card renders at 1200×630.
- [ ] Mobile nav, product dropdowns, gallery/lightbox, PDF viewer — **verify on a real device**. Code paths in [`js/main.js`](js/main.js:1) and [`js/pdf-viewer.js`](js/pdf-viewer.js:1) are unchanged since staging, so this is a confirmation pass, not a fix.
- [ ] Lighthouse run on production. The hero image is 2688×1152 ([`images/header-hero.jpg`](images/header-hero.jpg)) with a 960px variant already present ([`images/header-hero-960.jpg`](images/header-hero-960.jpg)) — check that mobile picks the smaller one.

---

## 11. Rollback plan

1. In Cloudflare DNS, repoint apex + `www` at `185.181.255.109` (proxied).
2. The WordPress site is untouched and answers on that IP today, so the old site returns immediately.
3. Email was never on that host path — MX is Google — so mail is not at risk in either direction.

Static files stay in the repo and on Pages regardless, so re-cutting over is the same one-record change.

---

## 12. Open questions — resolved

| # | Question | Decision |
|---|---|---|
| 1 | Product pages: keep ~30 separate or 301 into `/products`? | **Consolidated into `/products`.** Revisit per-URL if GSC shows traffic (§4.2). |
| 2 | Junk URLs: 410 or 301 to home? | **301 to `/`.** Revisit to `410` after monitoring settles. |
| 3 | Host: Cloudflare Pages or something else? | **Cloudflare Pages.** |
| 4 | Form bridge: Apps Script or Worker + Gmail API? | **Neither — Formspree.** Removed the mail dependency entirely. |
| 5 | Old assets: keep serving or redirect? | **Redirect.** The one document still in use was recovered locally. |
| 6 | `/contact-us/`: fold into `/#free-estimate` or keep a page? | **Fold into the home page form.** |
| 7 | cPanel subdomains: remove or leave? | **Removed** — they no longer resolve. |

---

## 13. What is left

Everything below needs an owner account; none of it can be done from this repo.

1. **Publish `google._domainkey`** — enable DKIM in the Google Admin console (§8.3).
2. **Add the `_dmarc` TXT record** at `p=none` (§8.2).
3. **Submit `sitemap.xml` in Search Console** and request indexing for `/photos`, `/licensing`, `/financing`, `/door-catalogs`.
4. **Verify the form** end-to-end once: submit from the live site, confirm delivery and reply-to behaviour.
5. **Keep the old cPanel host alive** until the rollback window closes; it is the entire rollback plan.
