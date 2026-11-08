/* Google Tag Manager loader.
 *
 * The container ID lives here and nowhere else, so switching it on is a
 * one-line change instead of a 12-page find-and-replace.
 *
 * Included with `defer` from the <head> of every page. The standard GTM
 * snippet is inline and render-blocking; on this site the header banner is the
 * LCP element and is deliberately given an uncontested head start (see the
 * comments in css/styles.css and index.html), so a blocking third-party script
 * in front of it would cost more than the few milliseconds GTM gains by
 * running before parse. Deferring still boots GTM before DOMContentLoaded and
 * before js/main.js, so PageView timing is unaffected in practice.
 *
 * Until the container is created in the GTM UI the placeholder below fails the
 * format check and this file does nothing except establish window.dataLayer.
 * The event pushes in js/main.js are therefore harmless no-ops rather than
 * errors, and nothing is requested from Google.
 */

(function (window, document) {
  "use strict";

  // Container ID from tagmanager.google.com (Admin > Container ID).
  // See ANALYTICS.md — the same value also appears in the <noscript> iframe on
  // every page, which markup cannot read from here.
  //
  // This is the container that carries the GA4 tag (G-3VN4E9V8L8) and GA4
  // enhanced measurement, so pageviews and outbound/form tracking arrive
  // without further setup. An earlier, empty container (GTM-KCHL479X) was
  // never published with any tags and is not referenced anywhere.
  var GTM_CONTAINER_ID = "GTM-MM3HDJWG";

  window.dataLayer = window.dataLayer || [];

  // Any malformed ID is ignored rather than sent to Google as a broken request.
  if (!/^GTM-[A-Z0-9]{5,}$/.test(GTM_CONTAINER_ID)) {
    if (window.console && window.console.error) {
      window.console.error(
        "[GTM] GTM_CONTAINER_ID in js/gtm.js is not a valid container ID: " +
          GTM_CONTAINER_ID
      );
    }
    return;
  }

  // Tells GTM when it was bootstrapped, exactly as the official snippet does.
  window.dataLayer.push({
    "gtm.start": new Date().getTime(),
    event: "gtm.js"
  });

  var script = document.createElement("script");
  script.async = true;
  script.src =
    "https://www.googletagmanager.com/gtm.js?id=" +
    encodeURIComponent(GTM_CONTAINER_ID);

  document.head.appendChild(script);
})(window, document);
