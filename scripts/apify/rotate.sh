#!/bin/sh
# Fan out a rotated Apify token to every place on this machine that holds one.
#
# Written after an Apify breach notice. Revoking the old key is the ONLY step
# that actually protects the account, and it cannot be done from here: Apify
# exposes no token-revoke endpoint (GET /v2/users/me/tokens -> HTTP 404), so
# revocation has to happen in Console. This script handles everything that
# comes after that:
#
#   1. Create a new token in Apify Console -> Settings -> Integrations.
#   2. Revoke the old one there. Do not skip: until it is revoked, it works.
#   3. sh scripts/apify/set-token.sh          (writes + verifies scripts/apify/.env)
#   4. sh scripts/apify/rotate.sh             (this script: fans out + cleans up)
#
# What "fan out" means here, discovered by scanning $HOME rather than assumed:
#
#   scripts/apify/.env                              project REST + MCP token
#   ~/.config/app-opportunities/apify.token         a SECOND project's token
#   ~/.cursor/mcp.json                              Cursor global MCP
#   .../zoocodeorganization.zoo-code/.../mcp_settings.json   Zoo Code global MCP
#   ~/.cursor/mcp.json.bak-*                        old copies, plaintext
#   .../mcp_settings.json.bak-*                     old copies, plaintext
#   ~/.zsh_history                                  revoked keys typed at a prompt
#
# The last three are the ones people forget. A rotated key is worthless if a
# world-readable backup or a shell history still contains the old one, because
# the attacker's copy of the old key keeps working until it is revoked — and
# those files are what turn a one-time exposure into a permanent one.
set -eu

REPO=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
SESSION=$REPO/scripts/apify/.env
OTHER_TOKEN=$HOME/.config/app-opportunities/apify.token
CURSOR_CFG=$HOME/.cursor/mcp.json
# MUST stay quoted. The path contains "Application Support": an unquoted space
# here does not raise an error under `set -u`, it just makes everything after
# the space a separate command, leaving ZOO_CFG pointing at .../Library/Application.
ZOO_CFG="$HOME/Library/Application Support/Cursor/User/globalStorage/zoocodeorganization.zoo-code/settings/mcp_settings.json"

say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32mok\033[0m   %s\n' "$*"; }
warn() { printf '  \033[33mwarn\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31mfail\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------- 1. token
[ -f "$SESSION" ] || { bad "missing $SESSION — run set-token.sh first"; exit 1; }
TOKEN=$(sed -n 's/^[[:space:]]*APIFY_TOKEN[[:space:]]*=[[:space:]]*//p' "$SESSION" | head -1 | tr -d '"'"'"' \r')
[ -n "$TOKEN" ] || { bad "no APIFY_TOKEN in $SESSION"; exit 1; }

# Guard: rotate.sh fans a key out to FOUR files. If the operator never actually
# replaced the key, this is the script that makes that mistake permanent and
# spreads it further. Compare against the recorded digest of the previous key.
DIGEST_FILE=$REPO/scripts/apify/.token-digest
NEW_DIGEST=$(printf '%s' "$TOKEN" | shasum -a 256 | cut -d' ' -f1)
if [ -f "$DIGEST_FILE" ] && [ "$(cat "$DIGEST_FILE")" = "$NEW_DIGEST" ]; then
  bad "this is the SAME token as the last rotation — nothing to fan out"
  say "  Create and revoke in Console, then re-run set-token.sh:"
  say "  https://console.apify.com/settings/integrations"
  say ""
  say "  To force anyway: sh scripts/apify/rotate.sh --allow-same"
  [ "${1:-}" = "--allow-same" ] || exit 3
fi

say "Rotating token        ${TOKEN%"${TOKEN#????????????}"}…${TOKEN#"${TOKEN%????}"}"

# Verify before touching anything else. A fan-out of a dead token is worse
# than no fan-out: it silently breaks a second project that was working.
say "Verifying"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://api.apify.com/v2/users/me?token=$TOKEN")
if [ "$CODE" != "200" ]; then
  bad "token rejected (HTTP $CODE) — revoke/recreate in Console, then re-run set-token.sh"
  exit 1
fi
ok "HTTP 200 from /v2/users/me"

# ---------------------------------------------------------------- 2. fan out
say "Propagating"

if [ -d "$(dirname "$OTHER_TOKEN")" ]; then
  printf 'APIFY_TOKEN=%s\n' "$TOKEN" > "$OTHER_TOKEN"
  chmod 600 "$OTHER_TOKEN"
  ok "app-opportunities token updated"
else
  warn "skipped ~/.config/app-opportunities (directory absent)"
fi

if node "$REPO/scripts/apify/install-mcp.mjs" >/tmp/rotate-install.log 2>&1; then
  ok "MCP clients updated (Cursor + Zoo Code)"
else
  bad "install-mcp.mjs failed:"
  sed 's/^/       /' /tmp/rotate-install.log
  exit 1
fi
rm -f /tmp/rotate-install.log

# ---------------------------------------------------------------- 3. purge stale backups
# These contain the OLD key in plaintext. Once the new token is live they serve
# no purpose, and they are the most likely file to be swept up by a backup or
# sync tool. Their permissions are 600 now, but 600 is not protection against
# a copy that already left the machine months ago.
say "Purging stale config backups"
N=0
for f in "$CURSOR_CFG".bak-* "$ZOO_CFG".bak-*; do
  [ -f "$f" ] || continue
  if grep -q 'apify_api_' "$f" 2>/dev/null; then
    rm -f "$f"
    N=$((N + 1))
    ok "removed ${f##*/}"
  fi
done
[ "$N" -eq 0 ] && ok "none holding a key"

# ---------------------------------------------------------------- 4. purge shell history
# zsh keeps every line you typed. `export APIFY_TOKEN=apify_api_...` lives
# there in cleartext, and history files get synced and copied around casually.
# Default is to rewrite in place; --keep-history opts out.
if [ "${1:-}" != "--keep-history" ]; then
  for h in "$HOME/.zsh_history" "$HOME/.bash_history"; do
    [ -f "$h" ] || continue
    if grep -q 'apify_api_' "$h" 2>/dev/null; then
      CNT=$(grep -c 'apify_api_' "$h")
      grep -v 'apify_api_' "$h" > "$h.clean" && cat "$h.clean" > "$h" && rm -f "$h.clean"
      ok "scrubbed $CNT line(s) from ${h##*/}"
    fi
  done
fi

# ---------------------------------------------------------------- 5. report
say ""
say "Remaining references to the OLD key"
OLD_HINT=${APIFY_OLD_TOKEN:-}
FOUND=0
for f in "$SESSION" "$OTHER_TOKEN" "$CURSOR_CFG" "$ZOO_CFG"; do
  [ -f "$f" ] || continue
  T=$(grep -o 'apify_api_[A-Za-z0-9]*' "$f" 2>/dev/null | head -1)
  [ -n "$T" ] || continue
  # basename is unsafe here: $ZOO_CFG contains spaces. Use a prefix strip.
  LABEL=${f##*/}
  if [ "$T" = "$TOKEN" ]; then
    ok "$LABEL — new key"
  else
    bad "$LABEL — DIFFERENT key ${T%"${T#????????????}"}…${T#"${T%????}"}"
    FOUND=1
  fi
done

say ""
if [ "$FOUND" -eq 1 ]; then
  warn "A file still holds a different key. If it is the breached one, revoke it in Console."
  warn "If it is a newer key for a different project, leave it — this script does not touch it."
else
  say "Every token file on this machine now holds the new key."
fi
say ""
say "Last step, cannot be automated: revoke the old key in Apify Console."
say "Until it is revoked at the source, any copy of it still works."

printf '%s\n' "$NEW_DIGEST" > "$DIGEST_FILE"
chmod 600 "$DIGEST_FILE"
