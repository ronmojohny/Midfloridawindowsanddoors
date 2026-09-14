/* Mid-Florida Windows & Doors — interactions */
(function () {
  "use strict";

  /* ---- Mobile navigation toggle ---- */
  const navToggle = document.getElementById("navToggle");
  const nav = document.getElementById("nav");

  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      const isOpen = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
      document.body.style.overflow = isOpen ? "hidden" : "";
    });

    // Close menu when a nav link is clicked
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      }
    });

    // Close menu on resize to desktop
    window.addEventListener("resize", function () {
      if (window.innerWidth > 860) {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      }
    });
  }

  /* ---- Sticky header shadow ---- */
  const header = document.getElementById("siteHeader");
  if (header) {
    const onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---- Footer year ---- */
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---- Forms (front-end demo; replace with your form backend/endpoint) ---- */
  const forms = document.querySelectorAll("form[novalidate]");

  forms.forEach(function (form) {
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
        form.querySelector(".quote-form__fine").textContent =
          "Please fill in all required fields.";
        return;
      }

      const btn = form.querySelector("button[type='submit']");
      const original = btn.textContent;
      btn.textContent = "Sending…";
      btn.disabled = true;

      // Simulated submit — wire to your endpoint (e.g., Formspree, Netlify Forms, WP REST)
      setTimeout(function () {
        btn.textContent = original;
        btn.disabled = false;
        form.reset();
        const fine = form.querySelector(".quote-form__fine");
        if (fine) fine.textContent = "Thanks! We'll be in touch shortly.";
      }, 900);
    });
  });
})();
