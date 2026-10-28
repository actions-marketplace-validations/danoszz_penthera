/**
 * The landing page's Go Pro plate (site/index.html, #go-pro): a light that
 * follows the pointer and a slight tilt towards it. The shimmer, the glow and
 * the twinkles are CSS. Off with reduced motion and on touch-only screens.
 */
(() => {
  const plate = document.querySelector(".gopro-plate");
  if (!plate || matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover)").matches) return;
  const set = (k, v) => plate.style.setProperty(k, v);
  plate.addEventListener("pointermove", (e) => {
    const r = plate.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    plate.classList.add("is-live");
    set("--mx", `${(x * 100).toFixed(1)}%`);
    set("--my", `${(y * 100).toFixed(1)}%`);
    set("--ry", `${((x - 0.5) * 8).toFixed(2)}deg`);
    set("--rx", `${((0.5 - y) * 6).toFixed(2)}deg`);
  });
  plate.addEventListener("pointerleave", () => {
    plate.classList.remove("is-live");
    set("--mx", "50%"); set("--my", "30%"); set("--rx", "0deg"); set("--ry", "0deg");
  });
})();
