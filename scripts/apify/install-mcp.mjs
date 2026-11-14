#!/usr/bin/env node
/**
 * Register the Apify MCP server globally, for whichever client you actually use.
 *
 *   node scripts/apify/install-mcp.mjs --dry-run        # show both merges, write nothing
 *   node scripts/apify/install-mcp.mjs                  # install into every detected client
 *   node scripts/apify/install-mcp.mjs --check          # verify token + report drift, write nothing
 *   node scripts/apify/install-mcp.mjs --zoo            # Zoo Code only
 *   node scripts/apify/install-mcp.mjs --cursor         # Cursor only
 *   node scripts/apify/install-mcp.mjs --stdio          # local npx server instead of remote
 *   node scripts/apify/install-mcp.mjs --no-verify      # install even if the token 401s
 *   node scripts/apify/install-mcp.mjs --remove         # unregister everywhere
 *
 * The token is verified against GET /v2/users/me before anything is written.
 * That call is free, and it is the difference between "installed" and "actually
 * works" — a revoked token otherwise lands in both clients and looks configured
 * while every tool call fails with invalid_token.
 *
 * Why this targets two files: Zoo Code is a VS Code extension and does NOT read
 * ~/.cursor/mcp.json. It reads, in order:
 *
 *   global   ~/Library/Application Support/Cursor/User/globalStorage/
 *            zoocodeorganization.zoo-code/settings/mcp_settings.json
 *   project  <workspace>/.roo/mcp.json
 *
 * Cursor itself reads ~/.cursor/mcp.json. Writing only one of them leaves the
 * other client blind — which is exactly the "I don't see it" failure.
 *
 * Both formats require an explicit `type` for URL-based servers. From the Zoo
 * Code 3.96.0 bundle:
 *   "Configuration with 'url' must explicitly specify 'type' as 'sse' or
 *    'streamable-http'."
 * A bare `{ url, headers }` object validates in neither client.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const REPO = path.resolve(import.meta.dirname, '../..');
const REMOTE_TYPE = 'streamable-http';
const REMOTE_URL = 'https://mcp.apify.com/';
const API = 'https://api.apify.com/v2';

const ZOO_GLOBAL = path.join(
  HOME,
  'Library/Application Support/Cursor/User/globalStorage',
  'zoocodeorganization.zoo-code/settings/mcp_settings.json',
);
const CURSOR_GLOBAL = path.join(HOME, '.cursor/mcp.json');

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};

const opts = {
  dryRun: has('--dry-run'),
  check: has('--check'),
  stdio: has('--stdio'),
  remove: has('--remove'),
  verify: !has('--no-verify'),
  name: val('--name', 'apify'),
  only: has('--zoo') ? 'zoo' : has('--cursor') ? 'cursor' : null,
};

// ---------------------------------------------------------------- token
function readEnvFile(file) {
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:APIFY_TOKEN|APIFY_API_TOKEN)\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

let token = readEnvFile(path.join(REPO, 'scripts/apify/.env')) ?? readEnvFile(path.join(REPO, '.env'));
let source = token ? 'scripts/apify/.env' : null;

if (!token) {
  token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || null;
  source = token ? 'environment' : null;
}

if (!token && !opts.remove) {
  console.error(
    'No Apify token found.\n' +
      `Create ${path.join(REPO, 'scripts/apify/.env')} with:\n` +
      '  APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n' +
      'Or run: sh scripts/apify/set-token.sh',
  );
  process.exit(1);
}

const redact = (t) => (t ? `${t.slice(0, 14)}…${t.slice(-4)}` : '(none)');

/** Free identity check. Uses the query-param form, which every API version accepts. */
async function verifyToken(t) {
  const url = new URL(`${API}/users/me`);
  url.searchParams.set('token', t);
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch (err) {
    return { ok: false, reason: `network error: ${err.message}` };
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message ?? body?.error?.type ?? '';
    } catch {}
    return { ok: false, reason: `HTTP ${res.status}${detail ? ` — ${detail}` : ''}` };
  }
  const body = await res.json().catch(() => ({}));
  const me = body?.data ?? {};
  return { ok: true, username: me.username, plan: me.plan?.id ?? null, email: me.email };
}

/** Pull the credential back out of a stored client entry, whatever shape it has. */
function storedToken(entry) {
  if (!entry) return null;
  if (entry.env?.APIFY_TOKEN) return entry.env.APIFY_TOKEN;
  const auth = entry.headers?.Authorization ?? entry.headers?.authorization;
  if (auth) return String(auth).replace(/^Bearer\s+/i, '');
  try {
    return new URL(entry.url).searchParams.get('token');
  } catch {
    return null;
  }
}

/** Build the server object in the shape the client expects. */
function serverEntry() {
  return opts.stdio
    ? { type: 'stdio', command: 'npx', args: ['-y', '@apify/actors-mcp-server'], env: { APIFY_TOKEN: token } }
    : { type: REMOTE_TYPE, url: REMOTE_URL, headers: { Authorization: `Bearer ${token}` } };
}

// ---------------------------------------------------------------- targets
const targets = [
  { key: 'zoo', label: 'Zoo Code  (global)', file: ZOO_GLOBAL },
  { key: 'cursor', label: 'Cursor    (global)', file: CURSOR_GLOBAL },
].filter((t) => !opts.only || t.key === opts.only);

function loadTarget(file) {
  if (!fs.existsSync(file)) return { cfg: { mcpServers: {} }, existed: false };
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return { cfg: { mcpServers: {} }, existed: true };
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    console.error(`\n${file}\n  is not valid JSON — refusing to touch it.\n  ${err.message}`);
    process.exit(1);
  }
  cfg.mcpServers ??= {};
  return { cfg, existed: true };
}

// ---------------------------------------------------------------- verify
console.log(`Server name : ${opts.name}`);
console.log(`Transport   : ${opts.stdio ? 'stdio (npx @apify/actors-mcp-server)' : `remote (${REMOTE_TYPE} → ${REMOTE_URL})`}`);
if (!opts.remove) console.log(`Token       : ${redact(token)}  from ${source}`);
console.log('');

let me = null;
if (!opts.remove && opts.verify) {
  process.stdout.write('Verifying   : GET /v2/users/me … ');
  const v = await verifyToken(token);
  if (v.ok) {
    me = v;
    console.log(`OK (${v.username}${v.plan ? `, ${v.plan}` : ''})`);
  } else {
    console.log(`FAILED (${v.reason})`);
    console.error(
      `\nThe token in ${source} is not valid, so installing it would produce a server\n` +
        'entry that validates but 401s on every call. Nothing was written.\n\n' +
        'Fix it first:\n' +
        '  sh scripts/apify/set-token.sh          # prompt, hidden input, verifies, then exits\n' +
        '  node scripts/apify/install-mcp.mjs     # re-run this to update both clients\n\n' +
        'Regenerate the token at https://console.apify.com/settings/integrations\n' +
        'Override with --no-verify only if you know the API is unreachable.',
    );
    process.exit(1);
  }
  console.log('');
}

const planned = [];
for (const t of targets) {
  const { cfg, existed } = loadTarget(t.file);
  const current = cfg.mcpServers[opts.name] ?? null;
  const before = current ? JSON.stringify(current) : null;

  if (opts.remove) {
    if (!before) {
      console.log(`${t.label}: not registered — nothing to do`);
      continue;
    }
    delete cfg.mcpServers[opts.name];
  } else {
    cfg.mcpServers[opts.name] = serverEntry();
  }

  const changed = opts.remove ? before !== null : before !== JSON.stringify(cfg.mcpServers[opts.name]);
  const drift = !opts.remove && current && storedToken(current) && storedToken(current) !== token;
  console.log(
    `${t.label}: ${existed ? 'exists' : 'will be created'} → ${changed ? 'UPDATE' : 'already up to date'}` +
      (drift ? '  (holds a different, stale token)' : ''),
  );
  planned.push({ ...t, cfg, changed, existed });
}

// ---------------------------------------------------------------- check only
if (opts.check) {
  console.log('\n--- CHECK, nothing written ---');
  if (me) console.log(`Token in ${source} is valid: ${me.username}${me.email ? ` <${me.email}>` : ''}`);
  for (const t of planned) {
    const stored = storedToken(loadTarget(t.file).cfg.mcpServers[opts.name]);
    const state = !stored ? 'missing' : stored === token
      ? 'matches scripts/apify/.env'
      : `stale — holds ${redact(stored)}`;
    console.log(`${t.label}: ${state}`);
  }
  console.log('\nRun without --check to apply.');
  process.exit(0);
}

// ---------------------------------------------------------------- dry run
if (opts.dryRun) {
  console.log('\n--- DRY RUN, nothing written ---');
  for (const t of planned) {
    const preview = JSON.parse(JSON.stringify(t.cfg));
    const e = preview.mcpServers?.[opts.name];
    if (e?.headers?.Authorization) e.headers.Authorization = `Bearer ${redact(token)}`;
    if (e?.env?.APIFY_TOKEN) e.env.APIFY_TOKEN = redact(token);
    console.log(`\n${t.file}\n${JSON.stringify(preview, null, 2)}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- write
let wrote = 0;
for (const t of planned) {
  if (!t.changed) continue;
  fs.mkdirSync(path.dirname(t.file), { recursive: true });

  if (t.existed) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${t.file}.bak-${stamp}`;
    fs.copyFileSync(t.file, backup);
    // copyFileSync preserves the mode of a 600 original but copies a 644 one
    // straight through. The file holds a live token, so force it regardless.
    fs.chmodSync(backup, 0o600);
    console.log(`\nbackup → ${backup}  (mode 600)`);
  }

  // The file holds a live credential, so write to tmp then rename atomically.
  const tmp = `${t.file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(t.cfg, null, '\t') + '\n', { mode: 0o600 });
  fs.renameSync(tmp, t.file);
  fs.chmodSync(t.file, 0o600);
  console.log(`wrote  → ${t.file}  (mode 600)`);
  wrote++;
}

if (!wrote) {
  console.log('\nNothing to change — all detected clients are already configured.');
  process.exit(0);
}

console.log(`
Next:
  1. Reload the editor window  (Cmd+Shift+P → "Developer: Reload Window")
     A full app restart also works.
  2. Zoo Code: open the MCP Servers panel — "apify" should be connected
     with ~20 tools (search-actors, call-actor, get-dataset-items, ...).
     Simpler alternative: just ask Zoo "list your apify tools".
  3. Cursor: Settings → MCP → apify.

Unregister:  node scripts/apify/install-mcp.mjs --remove
`);
