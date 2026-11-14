#!/bin/sh
# Rotate the Apify API token in one step, without leaking it into shell history
# or the transcript.
#
#   sh scripts/apify/set-token.sh
#
# 1. Prompts with echo disabled.
# 2. Writes scripts/apify/.env (mode 600, gitignored).
# 3. Verifies against GET /v2/users/me  — free, and catches revoked tokens.
# 4. Re-pushes the token into every registered MCP client (~/.cursor/mcp.json
#    and Zoo Code's global mcp_settings.json) so the two copies cannot drift.
#
# Steps 3 and 4 are the reason this exists: a token pasted into .env alone
# leaves the MCP configs holding the old, revoked value.
set -eu

cd "$(dirname "$0")/../.."
ENV_FILE="scripts/apify/.env"

# Snapshot the current value BEFORE prompting. After a breach notice the failure
# mode is not "paste nothing", it is "paste the same compromised key again" --
# which verifies fine as HTTP 200 and silently reports success while rotating
# nothing at all. Compare against this to catch that.
PREVIOUS=$(sed -n 's/^[[:space:]]*APIFY_TOKEN[[:space:]]*=[[:space:]]*//p' "$ENV_FILE" 2>/dev/null | head -1 | tr -d '"\r' || true)

printf 'Paste your Apify token (input hidden), then press Enter: '
stty -echo 2>/dev/null || true
IFS= read -r TOKEN || true
stty echo 2>/dev/null || true
printf '\n'

# Strip stray whitespace / wrapping quotes from copy-paste.
TOKEN=$(printf '%s' "$TOKEN" | tr -d ' \t\r\n' | sed -e 's/^["'\'']//' -e 's/["'\'']$//')

if [ -z "$TOKEN" ]; then
  echo "No token entered. Nothing written." >&2
  exit 1
fi

# A rotation that produces the same key is not a rotation. Refuse loudly rather
# than printing "Done" over the top of an unchanged, compromised credential.
if [ -n "$PREVIOUS" ] && [ "$TOKEN" = "$PREVIOUS" ]; then
  echo
  echo "Refusing: this is the SAME token already in $ENV_FILE." >&2
  echo "  ${PREVIOUS%"${PREVIOUS#????????????}"}…${PREVIOUS#"${PREVIOUS%????}"}" >&2
  echo
  echo "Nothing was written. If you intended to rotate after a security notice," >&2
  echo "create a NEW token and revoke the old one first:" >&2
  echo "  https://console.apify.com/settings/integrations" >&2
  echo
  echo "To deliberately re-apply the same token, pass --allow-same." >&2
  [ "${1:-}" = "--allow-same" ] || exit 1
fi

case "$TOKEN" in
  apify_api_*) ;;
  *) echo "Warning: token does not start with 'apify_api_' — it is probably not a Personal API token." >&2 ;;
esac

if [ "${#TOKEN}" -ne 46 ]; then
  echo "Warning: expected 46 characters, got ${#TOKEN}. A truncated copy-paste is the usual cause." >&2
fi

mkdir -p scripts/apify
umask 077
printf 'APIFY_TOKEN=%s\n' "$TOKEN" > "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Wrote $ENV_FILE (mode 600, gitignored)."
echo
echo "Verifying..."
if ! APIFY_TOKEN="$TOKEN" node -e '
import("./scripts/apify/lib.mjs").then(async (m) => {
  try {
    const me = await m.whoami(m.loadToken());
    console.log("Verified:", JSON.stringify(me));
  } catch (err) {
    console.error("Verification failed:", err.message);
    console.error("Regenerate the token at https://console.apify.com/settings/integrations");
    process.exit(1);
  }
});
'; then
  echo
  echo "Token rejected — scripts/apify/.env now holds a bad value." >&2
  echo "Re-run this script with a valid token; MCP clients were NOT touched." >&2
  exit 1
fi

echo
echo "Updating MCP clients..."
if APIFY_TOKEN="$TOKEN" node scripts/apify/install-mcp.mjs; then
  echo
  echo "Done. Reload the editor window so the MCP servers reconnect with the new token."
  echo "Next: node scripts/apify/install-mcp.mjs --check"
  echo "Then: node scripts/apify/scrape-competitors.mjs --county Pinellas --max-usd 3"
else
  echo
  echo "Token is valid and saved, but the MCP update failed — see the output above." >&2
  echo "Re-run once fixed: node scripts/apify/install-mcp.mjs" >&2
  exit 1
fi
