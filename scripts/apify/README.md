# Apify competitor research

> **Using Apify from any Cursor project:** see [Make Apify available to every project](#make-apify-available-to-every-project-global-cursor-mcp) at the bottom.

Finds and ranks window/door contractors in the 38 cities across 8 counties listed on [`service-area.html`](../../service-area.html), so you can see who you are actually up against in each county.

Everything runs through the **Apify REST API** with plain `curl`/`fetch` — no MCP server, no npm dependencies. Node 26's global `fetch` is the only requirement.

## 1. Add the token (required — nothing runs without it)

Get a token from **https://console.apify.com/settings/integrations** → *Personal API tokens* → create one. It is a 46-character string starting `apify_api_`.

### Rotating the token (one command)

```sh
sh scripts/apify/set-token.sh
```

Hidden input, so nothing lands in shell history. It then:

1. writes `scripts/apify/.env` (mode `600`, gitignored);
2. verifies against `GET /v2/users/me` — free, and catches revoked tokens;
3. re-pushes the token into **every** registered MCP client (`~/.cursor/mcp.json` and Zoo Code's global `mcp_settings.json`).

Step 3 is the part that matters. The token lives in three places, and writing only `.env` leaves both MCP clients holding the old, revoked value while still looking configured.

If the token is rejected, `.env` is left holding the bad value (so the failure is visible) and the MCP configs are **not** touched. Re-run with a valid token.

### Checking state without changing anything

```sh
node scripts/apify/install-mcp.mjs --check
```

Verifies the token in `scripts/apify/.env`, then reports per-client whether the stored credential **matches**, is **missing**, or is **stale** — e.g. `stale — holds apify_api_OLDO…WXYZ`. Writes nothing.

Verify the REST path directly:

```sh
node -e "import('./scripts/apify/lib.mjs').then(async m=>console.log(await m.whoami(m.loadToken())))"
```

Expected: `{ username: '...', plan: '...', email: '...' }`

> A `401` here means the token is revoked or mistyped — not that the API changed. The endpoint, transport, and header convention are current; only the credential is being rejected. Rotate with `set-token.sh` rather than editing code.

You can also `export APIFY_TOKEN=...` for a one-off run instead of using `.env`. The scripts read the environment first, so an exported value wins over the file.

## 2. Preview the plan (free, no API calls)

```sh
node scripts/apify/scrape-competitors.mjs --dry-run
```

Prints all 38 searches, the per-city budget split, and the exact Actor input JSON. No token touched, nothing billed.

## 3. Scrape

```sh
# whole service area, 38 cities × 20 places, hard cap $25
node scripts/apify/scrape-competitors.mjs --max-usd 25

# one city — the cheapest way to validate the setup end to end (~$0.02)
node scripts/apify/scrape-competitors.mjs --county Pinellas --city Clearwater --limit 5 --max-usd 0.5

# one county
node scripts/apify/scrape-competitors.mjs --county Pinellas --max-usd 5

# one city
node scripts/apify/scrape-competitors.mjs --county Pinellas --city Clearwater
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--max-usd` | 25 | Total spend cap, split evenly across cities and passed to Apify as `maxTotalChargeUsd` per run. Per-city share is floored at **$0.50** (see below) |
| `--limit` | 20 | Places per city (`maxCrawledPlacesPerSearch`) |
| `--max-reviews` | 0 | Reviews per place. Keep 0 unless you need review text — it is the main cost driver |
| `--query` | `replacement windows` | Base search term; `" near <city>, FL"` is appended |
| `--county` / `--city` | all | Narrow the run |
| `--dry-run` | off | Print inputs only |

**Start with one city.** Clearwater at `--limit 5` costs about $0.02 and exercises the entire path — run, poll, dataset fetch, normalize, dedupe, report — before you spend on anything larger. Then do Pinellas, six cities, for a few dollars.

### The $0.50 per-run minimum

Apify rejects any run with `maxTotalChargeUsd` below **$0.50**:

```
HTTP 400: Maximum cost per run is less than the allowed minimum of $0.50
```

Because the budget is split across cities, a `--max-usd` that divides to less than $0.50 per city would fail every job. The script floors each city to $0.50 and prints a warning with the resulting worst-case total:

```
WARNING: $0.25 across 1 cities is $0.25/city,
         below the $0.50 minimum Apify accepts per run.
         Each city is floored to $0.50, so worst-case spend is
         $0.50 — raise --max-usd or narrow with --city / --county.
```

The $0.50 is a **cap, not a charge** — you are billed per scanned place. The Clearwater test run had a $0.50 cap and actually cost **$0.0202** for 5 places.

## 4. Report

```sh
node scripts/apify/report.mjs
```

Writes:

- `data/competitors/report.md` — briefing: market totals, top 10 by strength, county-by-county tables ordered by weak→strong, and named openings.
- `data/competitors/competitors.csv` — flat export for Sheets/Excel.

## Output layout

```
data/competitors/
├── _snapshot.json                          # deduped master list + failures
├── competitors.csv
├── report.md
├── pinellas/clearwater.json                # per-city raw results
├── pinellas/st-petersburg.json
└── ...
```

`data/` is gitignored: Maps results contain business and reviewer PII that must not reach the Cloudflare Pages deploy.

## How the ranking works

Google review count is the best free proxy for a contractor's lead volume, so sorting is **reviews first, rating second**. A 4.9 with 12 reviews is not a comparable threat to a 4.4 with 700.

```
strength = reviews × ratingPenalty
ratingPenalty: ≥4.7 → 1.0 · 4.5–4.6 → 0.9 · 4.2–4.4 → 0.75 · 3.8–4.1 → 0.55 · <3.8 → 0.3 · unknown → 0.5
```

It exists to prioritise attention, not to be quoted as a metric.

Rows whose name matches a Mid-Florida brand variant are stripped before ranking, so the absence of the brand in the output *is* the finding: you are not surfacing for these searches.

## Editing the service area

[`cities.json`](cities.json) mirrors the county/city matrix in [`service-area.html`](../../service-area.html:265). Change both together — the report is only as accurate as that list.

## Make Apify available to every project (global Cursor MCP)

The scripts above are per-repo. If you want Cursor to have Apify tools in **any** workspace — no per-project setup — register the MCP server once at user level:

```sh
node scripts/apify/install-mcp.mjs --check     # verify token + report per-client drift
node scripts/apify/install-mcp.mjs --dry-run   # prints the merge, writes nothing
node scripts/apify/install-mcp.mjs             # installs / updates
```

What it does:

- Writes `~/.cursor/mcp.json` (Cursor's **user-level** MCP config — applies to all workspaces) **and** Zoo Code's global `mcp_settings.json`; a project `.cursor/mcp.json` is not used. Zoo Code is a VS Code extension and does not read `~/.cursor/mcp.json`, so writing one file leaves the other client blind.
- **Verifies the token against `GET /v2/users/me` before writing anything.** A revoked token would otherwise be installed into both clients, validating fine while every tool call 401s. Skip with `--no-verify` only if the API is unreachable.
- Backs up the previous file as `mcp.json.bak-<timestamp>`.
- Merges only the `apify` key — existing servers (`wrapped-filesystem`, `wrapped-brave`, anything else) are preserved.
- Atomic replace via tmp file + `rename`, then `chmod 600`.
- Never prints the token in full; shows `apify_api_nzTG…IOEP`.
- Reads `scripts/apify/.env` **before** the environment, because a stale exported `APIFY_TOKEN` is the usual cause of a broken install.
- Flags an entry that holds a *different* token than `.env` as `UPDATE (holds a different, stale token)`.

Resulting entry (remote HTTP — no `npx`, no node_modules, nothing to update):

```json
{
  "mcpServers": {
    "apify": {
      "type": "streamable-http",
      "url": "https://mcp.apify.com/",
      "headers": { "Authorization": "Bearer apify_api_..." }
    }
  }
}
```

The explicit `"type": "streamable-http"` is required, not optional. Both clients reject a bare `{ url, headers }` with:

> Configuration with 'url' must explicitly specify 'type' as 'sse' or 'streamable-http'.

Endpoint and header convention verified: `POST https://mcp.apify.com/` with `Authorization: Bearer <token>` and a JSON-RPC `initialize` returns `401 invalid_token` for a bad token — i.e. the transport is correct and only the credential is rejected.

Alternatives:

| Goal | Command |
| --- | --- |
| Verify token + inspect drift, no writes | `node scripts/apify/install-mcp.mjs --check` |
| Local stdio server instead of remote | `node scripts/apify/install-mcp.mjs --stdio` (runs `npx -y @apify/actors-mcp-server`) |
| Custom server name | `node scripts/apify/install-mcp.mjs --name apify-work` |
| One client only | `node scripts/apify/install-mcp.mjs --zoo` / `--cursor` |
| Install despite a failing preflight | `node scripts/apify/install-mcp.mjs --no-verify` |
| Unregister | `node scripts/apify/install-mcp.mjs --remove` |

After installing, **reload the editor window**. Settings → MCP should list `apify` with 15 tools, verified against the live server on 2026-11-14:

`search-actors`, `fetch-actor-details`, `call-actor`, `get-actor-run`, `get-dataset-items`, `get-key-value-store-record`, `abort-actor-run`, `fetch-actor-mcp-tool-list`, `call-actor-mcp-tool`, `send-server-actor-request`, `search-apify-docs`, `fetch-apify-docs`, `report-problem`, `apify--web-search`, `apify--web-fetch`.

Reload is required even when `--check` passes — the running MCP processes hold the previous token in memory until the window is restarted.

Token placement note: putting the token in an `Authorization` header keeps it out of the URL, so it does not land in `mcp.apify.com` access logs or Cursor's UI display, and request logs cannot leak it via referrers. The query-string form (`?token=...`) that many Apify tutorials show is the weaker option.

`~/.cursor/mcp.json` is outside the repo, so it is not covered by [`.gitignore`](../../.gitignore) — it simply is not in any git tree. Its permissions are set to `600` by the installer.

## Files

| File | Purpose |
| --- | --- |
| [`lib.mjs`](lib.mjs) | Token resolution, API wrapper, run polling, dataset fetch. No dependencies. |
| [`cities.json`](cities.json) | County/city/query config and brand-name variants |
| [`scrape-competitors.mjs`](scrape-competitors.mjs) | Actor runs → `data/competitors/` |
| [`report.mjs`](report.mjs) | Snapshot → markdown briefing + CSV |
| [`set-token.sh`](set-token.sh) | Rotate the token: write `.env`, verify, re-push to every MCP client |
| [`install-mcp.mjs`](install-mcp.mjs) | Register/verify/unregister the Apify MCP server (remote or stdio) |
