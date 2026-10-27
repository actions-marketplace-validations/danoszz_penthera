/**
 * Cookieless counting for pages that don't load check.js (landing pages): a
 * Vercel Web Analytics event when a link marked data-track is followed. The
 * event is a name and the link's fixed label, nothing else (docs/privacy.md).
 */
window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
for (const a of document.querySelectorAll("a[data-track]")) {
  a.addEventListener("click", () => {
    try { window.va("event", { name: "link", data: { to: a.dataset.track } }); } catch { /* counting never breaks the page */ }
  });
}
