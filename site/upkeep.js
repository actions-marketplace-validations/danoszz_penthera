/**
 * The Upkeep page's three small behaviours (site/upkeep.mjs). Nothing is
 * stored or sent: the picks only change the body of the mailto link.
 *   1. The slider: previous/next buttons and a counter over a scroll-snap row.
 *   2. The switch between "Run it yourself" and "We run it for you".
 *   3. The picks: chips that fill in the waitlist email.
 * Without this script the row still scrolls, both ways show, and the email
 * button opens with blank lines.
 */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 1. Slider
  const track = document.querySelector(".upk-track");
  const nav = document.querySelector(".upk-nav");
  if (track && nav) {
    const cards = [...track.children];
    const count = nav.querySelector(".upk-count");
    const total = String(cards.length).padStart(2, "0");
    const current = () => {
      const x = track.scrollLeft;
      let best = 0;
      cards.forEach((c, i) => { if (Math.abs(c.offsetLeft - track.offsetLeft - x) < Math.abs(cards[best].offsetLeft - track.offsetLeft - x)) best = i; });
      return best;
    };
    let target = null; // the card a click is scrolling to, until the scroll settles
    const show = () => { target = null; count.textContent = `${String(current() + 1).padStart(2, "0")} / ${total}`; };
    nav.hidden = false;
    nav.addEventListener("click", (e) => {
      const b = e.target.closest("[data-slide]");
      if (!b) return;
      const i = Math.min(cards.length - 1, Math.max(0, (target ?? current()) + Number(b.dataset.slide)));
      target = i;
      track.scrollTo({ left: cards[i].offsetLeft - track.offsetLeft, behavior: reduce ? "auto" : "smooth" });
    });
    let t;
    track.addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(show, 120); }, { passive: true });
    track.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      nav.querySelector(`[data-slide="${e.key === "ArrowRight" ? 1 : -1}"]`).click();
    });
    show();
  }

  // 2. Switch
  const sw = document.querySelector(".upk-switch");
  if (sw) {
    const tabs = [...sw.querySelectorAll('[role="tab"]')];
    const select = (tab) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      }
    };
    sw.hidden = false;
    sw.addEventListener("click", (e) => { const t = e.target.closest('[role="tab"]'); if (t) select(t); });
    sw.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const i = tabs.indexOf(document.activeElement);
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      select(next); next.focus();
    });
    select(tabs.find((t) => t.getAttribute("aria-selected") === "true") || tabs[0]);
  }

  // 3. Picks fill in the email
  const picks = document.querySelector(".upk-picks");
  const joins = [...document.querySelectorAll(".upk-join")];
  if (picks && joins.length) {
    const chips = [...picks.querySelectorAll(".upk-chip")];
    const chosen = (g) => chips.filter((c) => c.dataset.group === g && c.getAttribute("aria-pressed") === "true").map((c) => c.textContent);
    const update = () => {
      const body = `I am: ${chosen("role").join(", ")}\nTeam size: \nMost worried about: ${chosen("worry").join(", ")}\n`;
      const href = `mailto:daan@penthera.org?subject=${encodeURIComponent("Upkeep waitlist")}&body=${encodeURIComponent(body)}`;
      for (const a of joins) a.href = href;
    };
    picks.hidden = false;
    for (const n of document.querySelectorAll(".upk-js-note")) n.hidden = false;
    picks.addEventListener("click", (e) => {
      const c = e.target.closest(".upk-chip");
      if (!c) return;
      // One role; any number of worries.
      if (c.dataset.group === "role") for (const o of chips) if (o.dataset.group === "role" && o !== c) o.setAttribute("aria-pressed", "false");
      c.setAttribute("aria-pressed", String(c.getAttribute("aria-pressed") !== "true"));
      update();
    });
  }
})();
