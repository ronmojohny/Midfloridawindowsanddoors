/**
 * Canonical-host middleware.
 *
 * The Pages project has both `midfloridawindowsanddoors.com` and
 * `www.midfloridawindowsanddoors.com` attached as custom domains, so both
 * currently answer 200 with identical HTML. That is two URLs for every page,
 * which splits ranking signals and lets either host get bookmarked or linked.
 *
 * Cloudflare Pages `_redirects` can only match on path — it cannot match on
 * hostname — so a host-level redirect has to happen here, before the asset is
 * served. Anything arriving on the `www` host is 301'd to the apex, preserving
 * path, query string, and any trailing segments.
 *
 * Non-www requests fall straight through to the static asset; this file adds no
 * rewriting of its own.
 */

const CANONICAL_HOST = "midfloridawindowsanddoors.com";
const REDIRECT_HOSTS = new Set(["www.midfloridawindowsanddoors.com"]);

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (REDIRECT_HOSTS.has(url.hostname)) {
    url.protocol = "https:";
    url.hostname = CANONICAL_HOST;
    url.port = "";
    // 301 rather than 308: this is a permanent, intentional host move, and we
    // want browsers and crawlers to cache it and stop asking.
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
