/* Mid-Florida Windows & Doors — PDF viewer (pdf-viewer.html)
   Renders a whitelisted PDF selected with ?file=<key> using PDF.js.
   Keys map to files under pdfs/ so a URL can never request an arbitrary path.

   Pages are rendered lazily as they approach the viewport. Product catalogs
   run 20+ pages, so rendering them all up front would allocate hundreds of MB
   of canvas memory and stall older phones; instead each page is a correctly
   sized placeholder until it is needed, and pages are rendered one at a time. */
(function () {
  "use strict";

  var DOCS = {
    "pgt-vinyl-windows":    { path: "pdfs/pgt-vinyl-windows.pdf",    title: "PGT Vinyl Windows" },
    "pgt-aluminum-windows": { path: "pdfs/pgt-aluminum-windows.pdf", title: "PGT Aluminum Windows" }
  };

  // Worker must match the pdf.min.js version loaded in pdf-viewer.html.
  var PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  // Cap canvas resolution so a large page on a 3x display cannot allocate a
  // multi-hundred-MB bitmap. 2600px on the long edge stays crisp in practice.
  var MAX_CANVAS_DIM = 2600;
  var MAX_DEVICE_PIXEL_RATIO = 2;

  var stage    = document.getElementById("pdfStage");
  var status   = document.getElementById("pdfStatus");
  var titleEl  = document.getElementById("pdfTitle");
  var pageInfo = document.getElementById("pdfPageInfo");
  var zoomOut  = document.getElementById("pdfZoomOut");
  var zoomIn   = document.getElementById("pdfZoomIn");
  var zoomFit  = document.getElementById("pdfFitWidth");
  var zoomVal  = document.getElementById("pdfZoomVal");
  var prevBtn  = document.getElementById("pdfPrev");
  var nextBtn  = document.getElementById("pdfNext");

  if (!stage) return;

  var key = new URLSearchParams(window.location.search).get("file") || "";
  var doc = Object.prototype.hasOwnProperty.call(DOCS, key) ? DOCS[key] : null;

  function showStatus(html) {
    if (!status) return;
    status.hidden = false;
    status.innerHTML = html;
  }

  if (!doc) {
    document.title = "Document Not Found | Mid-Florida Windows & Doors";
    if (titleEl) titleEl.textContent = "Document not found";
    showStatus('We could not find that document. <a href="products.html">Return to Products</a>.');
    return;
  }

  document.title = doc.title + " | Mid-Florida Windows & Doors";
  if (titleEl) titleEl.textContent = doc.title;

  var fallback = ' <a href="' + doc.path + '" target="_blank" rel="noopener">Open ' + doc.title + ' (PDF)</a>.';

  if (!window.pdfjsLib) {
    showStatus("The PDF viewer script could not load." + fallback);
    return;
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

  showStatus("Loading document&hellip;");

  var pdf = null;
  var pageCount = 0;
  var pageWidthPt = 612;   // US Letter width; replaced by the real first-page width
  var pageHeightPt = 792;
  var zoom = 1;
  var wrappers = [];
  var observer = null;
  var queue = [];
  var rendering = false;

  /* ---------- layout ---------- */

  // Fit-width scale; zoom multiplies on top of it.
  function scaleFor() {
    var width = stage.clientWidth;
    if (width < 240) width = 240;
    return (width - 8) / pageWidthPt;
  }

  function placeholderHeight() {
    return Math.round(pageHeightPt * scaleFor());
  }

  function stageTopOffset(wrap) {
    return wrap.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop;
  }

  /* ---------- rendering ---------- */

  function renderPageInto(wrap) {
    var n = parseInt(wrap.getAttribute("data-page"), 10);

    return pdf.getPage(n).then(function (page) {
      // The wrapper may have been discarded by a zoom/resize rebuild while the
      // page was still loading from the worker.
      if (!wrap.isConnected) {
        wrap.removeAttribute("data-state");
        return null;
      }

      var viewport = page.getViewport({ scale: scaleFor() });

      var dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      var longEdge = Math.max(viewport.width, viewport.height) * dpr;
      var outputScale = dpr * Math.min(1, MAX_CANVAS_DIM / longEdge);

      var canvas = document.createElement("canvas");
      canvas.className = "pdf-page";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", doc.title + " — page " + n + " of " + pageCount);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";

      var previous = wrap.querySelector("canvas");
      if (previous) wrap.removeChild(previous);
      wrap.appendChild(canvas);
      wrap.style.minHeight = "";

      return page.render({
        canvasContext: canvas.getContext("2d"),
        viewport: viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
      }).promise.then(function () {
        wrap.setAttribute("data-state", "done");
      });
    }).catch(function () {
      wrap.removeAttribute("data-state");
    });
  }

  function pump() {
    if (rendering || !queue.length) return;
    var wrap = queue.shift();
    rendering = true;
    renderPageInto(wrap).then(function () {
      rendering = false;
      pump();
    });
  }

  function enqueue(wrap) {
    var state = wrap.getAttribute("data-state");
    if (state === "queued" || state === "done") return;
    wrap.setAttribute("data-state", "queued");
    queue.push(wrap);
    pump();
  }

  /* ---------- page scaffolding ---------- */

  function buildPages() {
    // Preserve the reader's place when re-laying out after a zoom or resize.
    var prevScrollable = stage.scrollHeight - stage.clientHeight;
    var fraction = prevScrollable > 0 ? stage.scrollTop / prevScrollable : 0;

    queue = [];
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    wrappers = [];

    var height = placeholderHeight();
    for (var n = 1; n <= pageCount; n++) {
      var wrap = document.createElement("div");
      wrap.className = "pdf-page-wrap";
      wrap.setAttribute("data-page", String(n));
      wrap.style.minHeight = height + "px";
      stage.appendChild(wrap);
      wrappers.push(wrap);
      if (observer) observer.observe(wrap);
    }

    if (status) status.hidden = true;

    // Restore scroll position, then refresh the page counter for it.
    if (prevScrollable > 0) {
      stage.scrollTop = fraction * (stage.scrollHeight - stage.clientHeight);
    }
    updatePageIndicator();
  }

  /* ---------- controls ---------- */

  function setZoom(next) {
    zoom = Math.max(0.4, Math.min(4, next));
    if (zoomVal) zoomVal.textContent = Math.round(zoom * 100) + "%";
    buildPages();
  }

  function goToPage(n) {
    n = Math.max(1, Math.min(pageCount, n));
    var wrap = wrappers[n - 1];
    if (!wrap) return;
    stage.scrollTo({ top: stageTopOffset(wrap) - 8, behavior: "smooth" });
  }

  function currentPage() {
    var m = pageInfo ? /Page (\d+)/.exec(pageInfo.textContent) : null;
    return m ? parseInt(m[1], 10) : 1;
  }

  function updatePageIndicator() {
    if (!pageInfo || !wrappers.length) return;

    var focus = stage.scrollTop + stage.clientHeight * 0.35;
    var best = 1;
    var bestDist = Infinity;

    wrappers.forEach(function (wrap, i) {
      var dist = Math.abs(stageTopOffset(wrap) - focus);
      if (dist < bestDist) { bestDist = dist; best = i + 1; }
    });

    pageInfo.textContent = "Page " + best + " of " + pageCount;
    if (prevBtn) prevBtn.disabled = best <= 1;
    if (nextBtn) nextBtn.disabled = best >= pageCount;
  }

  if (zoomOut) zoomOut.addEventListener("click", function () { setZoom(zoom / 1.2); });
  if (zoomIn)  zoomIn.addEventListener("click",  function () { setZoom(zoom * 1.2); });
  if (zoomFit) zoomFit.addEventListener("click", function () {
    zoom = 1;
    if (zoomVal) zoomVal.textContent = "100%";
    buildPages();
  });
  if (prevBtn) prevBtn.addEventListener("click", function () { goToPage(currentPage() - 1); });
  if (nextBtn) nextBtn.addEventListener("click", function () { goToPage(currentPage() + 1); });

  // Throttled scroll keeps the page counter in step without thrashing layout.
  var ticking = false;
  stage.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      updatePageIndicator();
    });
  });

  // Re-fit after a resize (debounced so dragging a window is not expensive).
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (!pdf) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () { buildPages(); }, 200);
  });

  /* ---------- load ---------- */

  window.pdfjsLib.getDocument({ url: doc.path }).promise
    .then(function (loaded) {
      pdf = loaded;
      pageCount = pdf.numPages;
      return pdf.getPage(1);
    })
    .then(function (firstPage) {
      var box = firstPage.getViewport({ scale: 1 });
      pageWidthPt = box.width;
      pageHeightPt = box.height;

      if (pageInfo) pageInfo.textContent = "Page 1 of " + pageCount;

      if ("IntersectionObserver" in window) {
        observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            enqueue(entry.target);
          });
        }, { root: stage, rootMargin: "800px 0px", threshold: 0 });
      }

      buildPages();

      // Without IntersectionObserver, render everything as a fallback.
      if (!observer) {
        wrappers.forEach(function (wrap) { enqueue(wrap); });
      }
    })
    .catch(function () {
      showStatus("This document could not be displayed." + fallback);
    });
})();
