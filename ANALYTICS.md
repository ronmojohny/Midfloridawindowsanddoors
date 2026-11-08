# Analytics — Google Tag Manager + GA4

The site runs GTM container **`GTM-MM3HDJWG`**, which is already wired to GA4
measurement ID **`G-3VN4E9V8L8`**. Pageviews and GA4 enhanced measurement
(outbound clicks, downloads, scroll, form interactions, history changes) start
recording as soon as this is deployed — no further GTM work required.

## Where everything lives

| Piece | Where | Notes |
| --- | --- | --- |
| Container loader | [`js/gtm.js`](js/gtm.js) | Holds `GTM_CONTAINER_ID`, pushes `gtm.start`, then async-loads `gtm.js`. |
| Loader tag | `<head>` of all 12 pages | `<script src="js/gtm.js?v=20261108c" defer>`, immediately before `</head>`. |
| `noscript` iframe | Top of `<body>` on all 12 pages | Fallback for JS-disabled visitors. |
| Data layer events | [`js/main.js`](js/main.js) | `phone_click`, `generate_lead`. |

### Container history

`GTM-KCHL479X` was an earlier container created during setup. It has no tags
published (the served payload is `"tags":[]`), so it collects nothing. It has
been replaced everywhere by `GTM-MM3HDJWG`; if you don't need the empty one,
delete it in the GTM UI to avoid confusion later.

### Why the loader is deferred, not inline

The stock GTM snippet is synchronous and sits before the stylesheet. On this
site the header banner is the LCP element and is deliberately given an
uncontested network start (see the comments in [`index.html`](index.html:32) and
[`css/styles.css`](css/styles.css)). A render-blocking third-party script ahead
of it would cost far more than GTM gains by running a few milliseconds earlier.
`defer` still executes before `DOMContentLoaded` and before `js/main.js`, so the
`gtm.js` event and pageview timing are correct.

## What the container already does

Confirmed by inspecting the published container payload:

- GA4 configuration tag for `G-3VN4E9V8L8`
- GA4 enhanced measurement: page views, scrolls, outbound clicks, downloads,
  site search, video engagement, form interactions
- Conversion marking, automatic PII redaction, region-scoped settings
- Consent mode support (`__gct`) using `analytics_storage`, `ad_storage`,
  `ad_user_data`, `ad_personalization`

Note that enhanced measurement's "form interactions" only records that a form
was *started* or *submitted* — it does not know whether the submission
succeeded, and it uploads nothing about the fields. That is why the custom
`generate_lead` event below still matters.

## Still needed: two custom events

`phone_click` and `generate_lead` are pushed to the data layer by
[`main.js`](js/main.js:5) but the container has no triggers or tags for them
yet, so GA4 is not receiving them. Add the following in the GTM UI:

### Variables

| Variable | Type | Definition |
| --- | --- | --- |
| `DLV - phone_number` | Data Layer Variable | `phone_number` |
| `DLV - link_text` | Data Layer Variable | `link_text` |
| `DLV - form_id` | Data Layer Variable | `form_id` |
| `DLV - page_path` | Data Layer Variable | `page_path` |

### Triggers

| Trigger | Type | Condition |
| --- | --- | --- |
| `CE - phone_click` | Custom Event | `phone_click` |
| `CE - generate_lead` | Custom Event | `generate_lead` |

### Tags

| Tag | Type | Fires on |
| --- | --- | --- |
| `GA4 - phone_click` | GA4 Event, name `phone_click`, params: `phone_number`, `link_text` | `CE - phone_click` |
| `GA4 - generate_lead` | GA4 Event, name `generate_lead`, params: `form_id`, `page_path` | `CE - generate_lead` |

Both reuse the existing `G-3VN4E9V8L8` Google Tag — no new Google Tag is needed.
Then in GA4 mark `generate_lead` as a **key event**; optionally import
`phone_click` as one too, since for this business phone calls are the
higher-volume lead signal.

### Debugging without publishing

GTM **Preview** mode works without publishing anything. Enter the site URL, then
click a phone number: `phone_click` should appear in the event list even though
no tag fires for it yet. That confirms the site side works before you commit to
the GA4 tags.

## Events the site emits

### `phone_click`

Fires on any `tel:` link, anywhere: header numbers, body copy, the "Call"
buttons, and the footer. Delegated at the document level, so new phone links are
tracked automatically.

```js
{
  event: "phone_click",
  phone_number: "+18882300243",   // from the href, not the visible text
  link_text: "(888) 230-0243"
}
```

### `generate_lead`

Fires only when Formspree returns a 2xx for an estimate form. Validation
failures, network errors and rate-limit (429) responses do **not** fire it, so
the count stays honest — unlike enhanced measurement's form tracking, which
counts attempts.

```js
{
  event: "generate_lead",
  method: "estimate_form",
  form_id: "estimateForm",
  page_path: "/products.html"
}
```

## Changing the container ID

The ID must be changed in two places, because a `<noscript>` block cannot read
`js/gtm.js`:

- `GTM_CONTAINER_ID` in [`js/gtm.js`](js/gtm.js)
- the `ns.html?id=...` iframe in every page

```sh
perl -pi -e 's/GTM-MM3HDJWG/GTM-NEWID/g' *.html js/gtm.js
```

Then bump the `?v=` query so returning visitors don't keep the cached loader:

```sh
perl -pi -e 's/gtm\.js\?v=[0-9a-z]+/gtm.js?v=20261109a/g' *.html
```

## Testing that GTM is firing

GTM is only in the repo so far — `git log` shows it is not on the live site yet,
so **testing live returns nothing until this is committed and deployed.** Test
locally first:

```sh
python3 -m http.server 8088
# then open http://localhost:8088/index.html
```

Use a real local server, not `file://` — `gtm.js` is loaded by URL and some
browsers restrict script loading from file paths.

### Check 1 — the loader is present and the container loads

DevTools → **Network**, filter for `gtm`. You should see exactly **one**
request:

```
gtm.js?id=GTM-MM3HDJWG        (from js/gtm.js, ~330 KB)
```

Two requests means a duplicate snippet was added somewhere. Zero means the
loader is missing from that page.

### Check 2 — the data layer is being populated

In the **Console**:

```js
dataLayer                    // should be a non-empty array
dataLayer[0]                 // { "gtm.start": ..., event: "gtm.js" }
google_tag_manager["GTM-MM3HDJWG"]   // defined only when GTM booted
```

Then click any phone number and inspect the newest entry:

```js
dataLayer.filter(e => e.event === "phone_click")
```

If that returns an entry, the site side is working.

### Check 3 — GTM Preview mode (best signal)

Install the **Tag Assistant** Chrome extension, or in GTM click **Preview** and
enter `http://localhost:8088`. A debug pane attaches to the page and lists every
event as it happens:

- `Page View` / `Container Loaded` on page load
- `click` on any link click
- `phone_click` when a `tel:` link is clicked

Important distinction: `phone_click` appearing in Preview means **the site
fired the event**. Whether GA4 receives it is a separate question — with no tag
bound to the trigger, Preview shows the event with *no tags fired*. That is the
current expected state until you add the tags in the "Still needed" section
above.

### Check 4 — GA4 is actually receiving data

Only meaningful once deployed (or via Preview with tags published). In GA4 go to
**Reports → Realtime** and open the site in another tab. Within ~10 seconds the
visit should appear. In the Network tab you should then also see requests to
`google-analytics.com/g/collect`.

Enabling **Realtime** debugging: append `&_dbg=1` to a `collect` URL, or use the
Google Analytics Debugger extension.

### Quick reference of expected results today

| Test | Expected now |
| --- | --- |
| `gtm.js?id=GTM-MM3HDJWG` in Network | present |
| `dataLayer[0].event` | `"gtm.js"` |
| Pageviews reaching GA4 after deploy | yes |
| `phone_click` in dataLayer | yes |
| `phone_click` in GA4 | **no** — trigger/tag not built yet |
| `generate_lead` in GA4 | **no** — trigger/tag not built yet |
| Enhanced measurement form events in GA4 | yes, but counts attempts, not successes |

## Deliberately not tracked

- **`ezmax.html`** and **`pdf-viewer.html`** are `noindex` internal/tool pages
  (see [`robots.txt`](robots.txt)). They still load the container — a visitor
  landing there can still call — but filter them out in GA4 reports if you want
  a clean content view.
- No personally identifiable form fields are pushed to the data layer; only the
  form's `id` and the page path. GA4's automatic PII redaction is also enabled
  in the container.
