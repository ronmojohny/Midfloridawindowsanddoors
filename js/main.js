/* Mid-Florida Windows & Doors — interactions */
(function () {
  "use strict";

  /* ---- Mobile navigation toggle ---- */
  const navToggle = document.getElementById("navToggle");
  const nav = document.getElementById("topCalloutNav");

  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      const isOpen = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    // Close menu when a nav link is clicked
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });

    // Close menu on resize to desktop
    window.addEventListener("resize", function () {
      if (window.innerWidth >= 992) {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---- Photo lightbox (photos.html) ---- */
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxClose = document.getElementById("lightboxClose");
  const lightboxTriggers = document.querySelectorAll("[data-lightbox]");

  if (lightbox && lightboxImg && lightboxClose && lightboxTriggers.length) {
    let lastFocused = null;

    const openLightbox = function (link) {
      const thumb = link.querySelector("img");
      // Mobile-only triggers point at a page rather than an image, so they carry
      // the enlarged photo in data-lightbox-src instead of href.
      const full =
        link.getAttribute("data-lightbox-src") || link.getAttribute("href");

      lightboxImg.src = full || (thumb ? thumb.getAttribute("src") : "");
      // Fall back to the link's aria-label for text-only triggers that have no
      // thumbnail image to borrow alt text from.
      lightboxImg.alt = thumb
        ? thumb.getAttribute("alt") || ""
        : link.getAttribute("aria-label") || "";

      lastFocused = link;
      lightbox.hidden = false;
      lightbox.classList.add("is-open");
      lightboxClose.focus();
    };

    const closeLightbox = function () {
      lightbox.classList.remove("is-open");
      lightbox.hidden = true;
      lightboxImg.src = "";

      if (lastFocused && typeof lastFocused.focus === "function") {
        lastFocused.focus();
      }
      lastFocused = null;
    };

    lightboxTriggers.forEach(function (link) {
      link.addEventListener("click", function (e) {
        // Desktop-only triggers (data-lightbox-desktop) fall through to their
        // normal link on smaller viewports, where text/labels are easier to read.
        if (link.hasAttribute("data-lightbox-desktop") && window.innerWidth < 768) {
          return;
        }
        e.preventDefault();
        openLightbox(link);
      });
    });

    /* Mobile-only triggers (data-lightbox-mobile) behave the other way around:
       tapping the image enlarges it on small viewports, while on desktop the
       link keeps its normal destination (e.g. the products page). */
    const mobileLightboxTriggers = document.querySelectorAll(
      "[data-lightbox-mobile]"
    );

    mobileLightboxTriggers.forEach(function (link) {
      link.addEventListener("click", function (e) {
        if (window.innerWidth >= 768) return;
        e.preventDefault();
        openLightbox(link);
      });
    });

    lightboxClose.addEventListener("click", closeLightbox);

    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && lightbox.classList.contains("is-open")) {
        closeLightbox();
      }
    });
  }

  /* ---- Deferred (lazy) loading for gallery tiles (photos.html) ----
     Native loading="lazy" only postpones the fetch; the browser still decodes
     every off-screen tile. Here the src of each off-screen tile is parked in
     data-src and restored 300px before it scrolls into view. Scripting is used
     only to *move* an existing src, so with JS disabled the markup still
     renders the full gallery. */
  const lazyLinks = document.querySelectorAll(".photo-card__link img[loading='lazy']");

  if (lazyLinks.length && "IntersectionObserver" in window) {
    const revealImage = function (img) {
      const pending = img.getAttribute("data-src");
      if (pending) {
        img.removeAttribute("data-src");
        img.setAttribute("src", pending);
      }

      const finish = function () {
        const link = img.closest(".photo-card__link");
        if (link && link.hasAttribute("data-lazy")) {
          link.setAttribute("data-lazy", "ready");
        }
      };

      // Only fade tiles that actually had to be fetched, so instant/cached
      // loads do not blink on their way in.
      if (img.getAttribute("data-lazy-pending") === "true") {
        img.removeAttribute("data-lazy-pending");
        if (img.complete) {
          finish();
        } else {
          img.addEventListener("load", finish, { once: true });
          img.addEventListener("error", finish, { once: true });
        }
      }
    };

    let lazyObserver = null;

    const observeTiles = function () {
      lazyLinks.forEach(function (img) {
        const src = img.getAttribute("src");
        if (!src) return;

        // Leave anything the browser has already decoded untouched: parking it
        // now would re-trigger a fetch and blank out a visible tile. These also
        // never receive data-lazy, so the opacity rule never applies to them.
        if (img.complete) return;

        const link = img.closest(".photo-card__link");
        if (link) link.setAttribute("data-lazy", "pending");
        img.setAttribute("data-lazy-pending", "true");

        img.setAttribute("data-src", src);
        img.removeAttribute("src");

        if (lazyObserver) lazyObserver.observe(img);
      });
    };

    lazyObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          lazyObserver.unobserve(entry.target);
          revealImage(entry.target);
        });
      },
      { rootMargin: "300px 0px", threshold: 0.01 }
    );

    // Wait for markup to settle (autoplay/hidden tabs can hold the parser back).
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", observeTiles);
    } else {
      observeTiles();
    }

    // Safety net: if the observer never fires (layout shift, engine quirk),
    // restore every remaining src so no tile can stay blank.
    window.addEventListener("load", function () {
      window.setTimeout(function () {
        lazyLinks.forEach(function (img) {
          if (img.getAttribute("data-src")) revealImage(img);
        });
      }, 2500);
    });
  }

  /* ---- Hero slider (simple crossfade with dots) ---- */
  const slides = document.querySelectorAll(".hero-slide");
  const dots = document.querySelectorAll(".hero-dot");

  if (slides.length > 1) {
    let current = 0;
    let timer = null;
    const interval = 14000;

    const show = function (index) {
      slides.forEach(function (s, i) {
        s.classList.toggle("is-active", i === index);
      });
      dots.forEach(function (d, i) {
        d.classList.toggle("is-active", i === index);
      });
      current = index;
    };

    const next = function () {
      show((current + 1) % slides.length);
    };

    const start = function () {
      stop();
      timer = setInterval(next, interval);
    };

    const stop = function () {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        show(parseInt(dot.getAttribute("data-slide"), 10));
        start();
      });
    });

    start();
  }

  /* ---- Footer year ---- */
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---- Estimate forms (submitted to Formspree) ---- */
  const forms = document.querySelectorAll("form[novalidate]");

  forms.forEach(function (form) {
    // Each form posts to the Formspree endpoint in its own action attribute, so
    // nothing here is hard-coded to a specific URL.
    const endpoint = form.getAttribute("action");
    const status = form.querySelector(".form-status");

    // Writes the outcome into the dedicated status banner. The privacy line
    // (.form-fine) is left untouched so it never gets overwritten by a result.
    const setMessage = function (text, state) {
      if (!status) return;
      status.textContent = text || "";
      status.classList.remove("is-success", "is-error", "is-visible");
      if (!text) return;
      status.classList.add(state === "success" ? "is-success" : "is-error");
      status.classList.add("is-visible");
    };

    // Restrict the endpoint to formspree.io so a script-injected or
    // copy-pasted action value cannot exfiltrate submissions elsewhere.
    let endpointIsSafe = false;
    if (endpoint) {
      try {
        endpointIsSafe =
          new URL(endpoint, window.location.href).hostname === "formspree.io";
      } catch (err) {
        endpointIsSafe = false;
      }
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // Basic validation
      let valid = true;
      form.querySelectorAll("[required]").forEach(function (field) {
        const ok = field.value.trim() !== "";
        field.style.borderColor = ok ? "" : "#d64545";
        if (!ok) valid = false;
      });

      if (!valid) {
        setMessage("Please fill in all required fields.", "error");
        return;
      }

      const btn = form.querySelector("button[type='submit']");
      const original = btn ? btn.textContent : "";

      // Without a usable Formspree endpoint, fall back to a plain native POST
      // rather than pretending the submission succeeded.
      if (!endpointIsSafe) {
        setMessage("Form endpoint unavailable. Please call (888) 230-0243.", "error");
        return;
      }

      if (btn) {
        btn.textContent = "Sending…";
        btn.disabled = true;
      }
      setMessage("");

      const restoreButton = function () {
        if (btn) {
          btn.textContent = original;
          btn.disabled = false;
        }
      };

      // Submitting the FormData natively would trigger a page navigation, so the
      // body is sent as multipart form data (what the non-JS fallback uses too).
      fetch(endpoint, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      })
        .then(function (response) {
          if (response.ok) return { ok: true };

          // 422 carries per-field errors from Formspree; 429 means the monthly
          // submission allowance is used up. Anything else is a generic failure.
          return response
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              let message = "";
              if (data && data.errors && data.errors.length) {
                message = data.errors
                  .map(function (err) {
                    return err.message;
                  })
                  .join(" ");
              }
              return { ok: false, status: response.status, message: message };
            });
        })
        .then(function (result) {
          restoreButton();

          if (result.ok) {
            form.reset();
            setMessage("Thanks! We'll be in touch shortly.", "success");
            return;
          }

          if (result.status === 429) {
            setMessage(
              "We've reached our monthly message limit. Please call (888) 230-0243.",
              "error"
            );
            return;
          }

          setMessage(
            result.message ||
              "Sorry, something went wrong. Please call (888) 230-0243.",
            "error"
          );
        })
        .catch(function () {
          restoreButton();
          setMessage(
            "Network error. Please check your connection or call (888) 230-0243.",
            "error"
          );
        });
    });
  });

  /* ---- Product card dropdowns (products.html) ----
     The menu is a <details> element, so it already opens and closes without
     JavaScript. This enhancement makes a tap on the summary toggle it
     (instead of only ever opening) and dismisses it on outside click or Esc;
     with JS disabled the native disclosure still works. */
  const prodDropdowns = document.querySelectorAll("[data-prod-dropdown]");

  if (prodDropdowns.length) {
    prodDropdowns.forEach(function (dd) {
      const toggle = dd.querySelector("summary");
      if (!toggle) return;

      // Prevent the native toggle so we can flip the state ourselves and make
      // a second click close the menu rather than re-open it.
      toggle.addEventListener("click", function (e) {
        e.preventDefault();
        dd.open = !dd.open;
      });

      // Collapse every menu (including any parent) once a link is chosen.
      dd.addEventListener("click", function (e) {
        if (!e.target.closest("a")) return;
        prodDropdowns.forEach(function (d) { d.open = false; });
      });
    });

    // Dismiss any open menu when clicking elsewhere on the page.
    document.addEventListener("click", function (e) {
      prodDropdowns.forEach(function (dd) {
        if (dd.open && !dd.contains(e.target)) dd.open = false;
      });
    });

    // Dismiss any open menu with the Escape key.
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      prodDropdowns.forEach(function (dd) { dd.open = false; });
    });
  }
})();
