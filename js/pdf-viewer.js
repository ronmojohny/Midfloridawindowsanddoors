/* Mid-Florida Windows & Doors — PDF viewer (pdf-viewer.html)
   Renders a whitelisted PDF selected with ?file=<key> using PDF.js.
   Keys map to files under pdfs/ so a URL can never request an arbitrary path. */
(function () {
  "use strict";

  var DOCS = {
    "pgt-vinyl-windows":    { path: "pdfs/pgt-vinyl-windows.pdf",    title: "PGT Vinyl Windows" },
    "pgt-aluminum-windows": { path: "pdfs/pgt-aluminum-windows.pdf", title: "PGT Aluminum Windows" }
  };

  // Worker must match the pdf.min.js version loaded in pdf-viewer.html.
  var PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  var stage    = document.getElementById("pdfStage");
  var status   = document.getElementById("pdfStatus");
  var titleEl  = document.getElementById("pdfTitle");
  var pageInfo = document.getElementById("pdfPageInfo");
  var zoomOut  = document.getElementById("pdfZoomOut");
  var zoomIn   = document.getElementById("pdfZoomIn");
  var zoomFit  = document.getElementById("pdfFitWidth");
  var zoomVal  = document.getElementById("pdfZoomVal");
  var openLink = document.getElementById("pdfOpen");
  var dlLink   = document.getElementById("pdfDownload");
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
  if (openLink) openLink.href = doc.path;
  if (dlLink) {
    dlLink.href = doc.path;
    dlLink.setAttribute("download", doc.path.split("/").pop());
  }

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
  var zoom = 1;
  var wrappers = [];
  var renderToken = 0;
  var resizeTimer = null;

  function blankStage() {
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    wrappers = [];
  }

  // Fit the widest page to the stage; zoom multiplies on top of this.
  function baseScale() {
    var width = stage.clientWidth;
    if (width < 240) width = 240;
    return (width - 8) / pageWidthPt;
  }

  function renderAll() {
    var token = ++renderToken;
    blankStage();

    var outputScale = window.devicePixelRatio || 1;
    var scale = baseScale() * zoom;

    function renderPage(n) {
      return pdf.getPage(n).then(function (page) {
        if (token !== renderToken) return null;

        var viewport = page.getViewport({ scale: scale });

        var wrap = document.createElement("div");
        wrap.className = "pdf-page-wrap";
        wrap.setAttribute("data-page", String(n));

        var canvas = document.createElement("canvas");
        canvas.className = "pdf-page";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", doc.title + " — page " + n + " of " + pageCount);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        wrap.appendChild(canvas);
        stage.appendChild(wrap);
        wrappers.push(wrap);

        return page.render({
          canvasContext: canvas.getContext("2d"),
          viewport: viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
        }).promise;
      });
    }

    var chain = Promise.resolve();
    for (var n = 1; n <= pageCount; n++) {
      chain = chain.then(renderPage.bind(null, n));
    }

    return chain.then(function () {
      if (token !== renderToken) return;
      if (status) status.hidden = true;
      updatePageIndicator();
    });
  }

  function setZoom(next) {
    zoom = Math.max(0.4, Math.min(4, next));
    if (zoomVal) zoomVal.textContent = Math.round(zoom * 100) + "%";
    renderAll();
  }

  function goToPage(n) {
    n = Math.max(1, Math.min(pageCount, n));
    var wrap = wrappers[n - 1];
    if (!wrap) return;
    var y = wrap.getBoundingClientRect().top + window.scrollY - 16;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  function updatePageIndicator() {
    if (!pageInfo || !wrappers.length) return;

    var focusLine = window.scrollY + window.innerHeight * 0.35;
    var best = 1;
    var bestDist = Infinity;

    wrappers.forEach(function (wrap, i) {
      var top = wrap.getBoundingClientRect().top + window.scrollY;
      var dist = Math.abs(top - focusLine);
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
    renderAll();
  });
  if (prevBtn) prevBtn.addEventListener("click", function () { goToPage(currentPage() - 1); });
  if (nextBtn) nextBtn.addEventListener("click", function () { goToPage(currentPage() + 1); });

  function currentPage() {
    var m = pageInfo ? /Page (\d+)/.exec(pageInfo.textContent) : null;
    return m ? parseInt(m[1], 10) : 1;
  }

  // Throttled scroll listener keeps the page counter in step with the view.
  var ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      updatePageIndicator();
    });
  });

  // Re-fit after a resize (debounced so dragging is not expensive).
  window.addEventListener("resize", function () {
    if (!pdf) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () { renderAll(); }, 200);
  });

  window.pdfjsLib.getDocument({ url: doc.path }).promise
    .then(function (loaded) {
      pdf = loaded;
      pageCount = pdf.numPages;
      return pdf.getPage(1);
    })
    .then(function (firstPage) {
      pageWidthPt = firstPage.getViewport({ scale: 1 }).width;
      if (pageInfo) pageInfo.textContent = "Page 1 of " + pageCount;
      return renderAll();
    })
    .catch(function () {
      showStatus("This document could not be displayed." + fallback);
    });
})();
