/*
 * /research: search, filter by type and status, and "Show all".
 *
 * The page's HTML lists every entry; this script only hides some after it
 * runs, so readers without JavaScript, crawlers and agents see them all. No
 * dependencies, no tracking, no storage: a filtered view is kept in the URL
 * query (?type=&status=&q=) so it can be shared.
 */
/* global document, location, history */
(function () {
  "use strict";

  function init() {
    var tools = document.getElementById("rs-tools");
    var list = document.getElementById("rs-items");
    if (!tools || !list) return;

    var first = Number(tools.getAttribute("data-first")) || 6;
    var items = Array.prototype.slice.call(list.querySelectorAll(".rs-item"));
    var input = document.getElementById("rs-q");
    var clear = tools.querySelector(".rs-clear");
    var form = tools.querySelector(".rs-search");
    var typeChips = Array.prototype.slice.call(tools.querySelectorAll("[data-filter]"));
    var statusRow = tools.querySelector(".rs-chips-status");
    var statusChips = Array.prototype.slice.call(tools.querySelectorAll("[data-status]"));
    var count = document.getElementById("rs-count");
    var none = document.querySelector(".rs-none");
    var reset = none && none.querySelector(".rs-reset");
    var allWrap = document.querySelector(".rs-all");
    var allBtn = allWrap && allWrap.querySelector("button");

    // What each entry is searched on: its headline, title, summary and study ID.
    var text = items.map(function (li) {
      var parts = li.querySelectorAll("h3, .rs-sub, .rs-sum, .rs-id, .rs-note");
      var s = "";
      for (var i = 0; i < parts.length; i++) s += " " + parts[i].textContent;
      return norm(s);
    });

    var keys = function (chips, attr) { return chips.map(function (c) { return c.getAttribute(attr); }); };
    var state = { type: "", status: "", q: "", all: false };

    function norm(s) { return String(s).toLowerCase().replace(/\s+/g, " ").trim(); }

    function read() {
      var p = new URLSearchParams(location.search);
      var t = p.get("type") || "";
      var st = p.get("status") || "";
      state.type = keys(typeChips, "data-filter").indexOf(t) > -1 ? t : "";
      state.status = state.type === "study" && keys(statusChips, "data-status").indexOf(st) > -1 ? st : "";
      state.q = (p.get("q") || "").slice(0, 120);
      input.value = state.q;
    }

    function write() {
      var p = new URLSearchParams();
      if (state.type) p.set("type", state.type);
      if (state.status) p.set("status", state.status);
      if (state.q.trim()) p.set("q", state.q.trim());
      var qs = p.toString();
      var url = location.pathname + (qs ? "?" + qs : "") + location.hash;
      if (url !== location.pathname + location.search + location.hash) history.replaceState(null, "", url);
    }

    function matches(li, i) {
      if (state.type && (" " + li.getAttribute("data-filters") + " ").indexOf(" " + state.type + " ") < 0) return false;
      if (state.status && (li.getAttribute("data-status") || "").toLowerCase() !== state.status) return false;
      var words = norm(state.q).split(" ").filter(Boolean);
      for (var w = 0; w < words.length; w++) if (text[i].indexOf(words[w]) < 0) return false;
      return true;
    }

    function render() {
      var narrowed = Boolean(state.type || state.status || state.q.trim());
      var shown = 0;
      var hits = 0;
      items.forEach(function (li, i) {
        var hit = matches(li, i);
        if (hit) hits++;
        // A search or filter shows every match; the plain list shows the newest few.
        var show = hit && (narrowed || state.all || hits <= first);
        li.hidden = !show;
        if (show) shown++;
      });
      typeChips.forEach(function (c) { c.setAttribute("aria-pressed", String(c.getAttribute("data-filter") === state.type)); });
      statusChips.forEach(function (c) { c.setAttribute("aria-pressed", String(c.getAttribute("data-status") === state.status)); });
      statusRow.hidden = state.type !== "study";
      clear.hidden = !state.q;
      none.hidden = hits > 0;
      allWrap.hidden = narrowed || state.all || items.length <= first;
      var n = items.length;
      count.textContent = !narrowed
        ? (shown < n ? "The newest " + shown + " of " + n + "." : "All " + n + " entries.")
        : hits === 0 ? "No entries match." : hits + (hits === 1 ? " entry matches." : " entries match.");
    }

    function update() { write(); render(); }

    typeChips.forEach(function (c) {
      c.addEventListener("click", function () {
        state.type = c.getAttribute("data-filter");
        if (state.type !== "study") state.status = "";
        update();
      });
    });
    statusChips.forEach(function (c) {
      c.addEventListener("click", function () { state.status = c.getAttribute("data-status"); update(); });
    });
    input.addEventListener("input", function () { state.q = input.value; update(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && input.value) { e.preventDefault(); state.q = input.value = ""; update(); }
    });
    form.addEventListener("submit", function (e) { e.preventDefault(); });
    clear.addEventListener("click", function () { state.q = input.value = ""; update(); input.focus(); });
    reset.addEventListener("click", function () {
      state.q = input.value = ""; state.type = ""; state.status = "";
      update();
      input.focus();
    });
    allBtn.addEventListener("click", function () {
      var next = items[first];
      state.all = true;
      render();
      // Keep the keyboard where the reader was: on the first entry just revealed.
      var link = next && next.querySelector("h3 a");
      if (link) link.focus();
    });

    read();
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
