/*
 * Theme, set before paint. One system: [data-theme] on <html>. The first visit
 * follows prefers-color-scheme; the toggle stores a choice in localStorage
 * (never a cookie). Loaded as a classic script in <head>, so it blocks paint.
 */
(function () {
  var KEY = "penthera-site-theme";
  var root = document.documentElement;
  root.classList.add("js");
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  var system = window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  root.setAttribute("data-theme", stored === "light" || stored === "dark" ? stored : system);

  function sync(btn) {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    btn.querySelector("[data-theme-label]").textContent = next === "light" ? "Light" : "Dark";
    btn.setAttribute("aria-label", "Switch to the " + next + " theme");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#000000" : "#fdfdfa");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector("[data-theme-toggle]");
    if (!btn) return;
    btn.hidden = false;
    sync(btn);
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* storage blocked */ }
      sync(btn);
    });
  });
})();
