/* Mid-Florida Windows & Doors — interactions */
(function () {
  "use strict";

  /* ---- Mobile navigation toggle ---- */
  const navToggle = document.getElementById("navToggle");
  const nav = document.getElementById("primaryNav");

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

  /* ---- Hero slider (simple crossfade with dots) ---- */
  const slides = document.querySelectorAll(".hero-slide");
  const dots = document.querySelectorAll(".hero-dot");

  if (slides.length > 1) {
    let current = 0;
    let timer = null;
    const interval = 5500;

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
        const fine = form.querySelector(".form-fine");
        if (fine) fine.textContent = "Please fill in all required fields.";
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
        const fine = form.querySelector(".form-fine");
        if (fine) fine.textContent = "Thanks! We'll be in touch shortly.";
      }, 900);
    });
  });
})();
