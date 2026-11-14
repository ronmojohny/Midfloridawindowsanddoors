/**
 * Minimal Apify REST client.
 *
 * Node 26 has global fetch, so this is dependency-free. Token resolution order:
 *   1. APIFY_TOKEN env var
 *   2. APIFY_API_TOKEN env var
 *   3. scripts/apify/.env   (APIFY_TOKEN=... or APIFY_API_TOKEN=...)
 *   4. .env in the repo root
 *
 * The token must never be committed. scripts/apify/.env is gitignored.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const API = 'https://api.apify.com/v2';

export function loadToken({ required = true } = {}) {
  let token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;

  if (!token) {
    for (const file of [path.join(ROOT, 'scripts/apify/.env'), path.join(ROOT, '.env')]) {
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*(?:APIFY_TOKEN|APIFY_API_TOKEN)\s*=\s*(.+?)\s*$/);
        if (m) token = m[1].replace(/^["']|["']$/g, '');
      }
      if (token) break;
    }
  }

  if (!token && required) {
    throw new Error(
      'No Apify token found. Either export APIFY_TOKEN, or create scripts/apify/.env containing:\n' +
        '  APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxx\n' +
        'Get one at https://console.apify.com/settings/integrations',
    );
  }
  return token;
}

/** Single API call. Returns the `data` envelope member. */
export async function api(endpoint, { token, method = 'GET', body, query } = {}) {
  const url = new URL(API + endpoint);
  url.searchParams.set('token', token);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const detail = json?.error?.message ?? json?.error?.type ?? text.slice(0, 300);
    throw new Error(`Apify ${method} ${endpoint} -> HTTP ${res.status}: ${detail}`);
  }
  return json.data;
}

/** Confirm the token works and print account identity. */
export async function whoami(token) {
  const me = await api('/users/me', { token });
  return { username: me.username, plan: me.plan?.id ?? me.plan ?? null, email: me.email };
}

/**
 * Start an Actor run and poll until it reaches a terminal state.
 * Returns { runId, status, datasetId, usageTotalUsd }.
 */
export async function runActor(actorId, input, opts = {}) {
  const { token, maxChargeUsd, pollSecs = 10, timeoutSecs = 3600, label = '' } = opts;
  const started = Date.now();

  let run = await api(`/acts/${actorId}/runs`, {
    token,
    method: 'POST',
    body: input,
    query: { maxTotalChargeUsd: maxChargeUsd },
  });

  const prefix = label ? `[${label}] ` : '';
  process.stderr.write(`${prefix}run ${run.id} ${run.status} (started)\n`);

  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
    if ((Date.now() - started) / 1000 > timeoutSecs) {
      throw new Error(`${prefix}run ${run.id} exceeded ${timeoutSecs}s; abort it at ${run.consoleUrl ?? 'console.apify.com'}`);
    }
    await new Promise((r) => setTimeout(r, pollSecs * 1000));
    run = await api(`/actor-runs/${run.id}`, { token });
    process.stderr.write(`${prefix}run ${run.id} ${run.status} (${Math.round((Date.now() - started) / 1000)}s)\n`);
  }

  if (run.status !== 'SUCCEEDED') {
    throw new Error(`${prefix}run ${run.id} finished ${run.status}. Log: ${run.consoleUrl ?? ''}`);
  }

  return {
    runId: run.id,
    status: run.status,
    datasetId: run.defaultDatasetId,
    usageTotalUsd: run.usageTotalUsd ?? null,
  };
}

/** Download every item from a dataset, clean (no empty fields). */
export async function datasetItems(datasetId, token) {
  const url = new URL(`${API}/datasets/${datasetId}/items`);
  url.searchParams.set('token', token);
  url.searchParams.set('format', 'json');
  url.searchParams.set('clean', 'true');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Dataset ${datasetId} -> HTTP ${res.status}`);
  return res.json();
}
