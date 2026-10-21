/**
 * The hero's field, live: a drifting cloud of value noise, ordered-dithered to
 * one bit (8×8 Bayer) on 4 px cells, so it reads like the static field.png it
 * replaces. The pointer is a scanning lens: it parts the cloud around it,
 * lifts the density where it passes, and the dots under its core turn the
 * accent colour. With no pointer (touch, or idle) the lens drifts on a slow
 * path. Drawn on a canvas the size of the grid and scaled up pixelated.
 *
 * Runs only when motion is welcome, and only while the hero is on screen.
 * Without JS, or with reduced motion, the static field.png stays.
 */

const CELL = 4;                 // CSS px per dither cell
const LENS = 0.16;              // lens radius, as a share of the field's width
const FOLLOW = 0.09;            // how fast the lens catches the pointer, per frame
const IDLE_AFTER = 2400;        // ms without pointer movement before the lens drifts

// 8×8 Bayer matrix, as thresholds in (0, 1).
const BAYER = Float32Array.from([
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
], (v) => (v + 0.5) / 64);

// Value noise on a hashed lattice, smoothstepped; two octaves are enough at 4 px.
const PERM = (() => {
  const p = Uint8Array.from({ length: 256 }, (_, i) => i);
  let s = 1337;
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return Uint8Array.from({ length: 512 }, (_, i) => p[i & 255]);
})();
const smooth = (t) => t * t * (3 - 2 * t);
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const a = PERM[PERM[X] + Y] / 255, b = PERM[PERM[X + 1] + Y] / 255;
  const c = PERM[PERM[X] + Y + 1] / 255, d = PERM[PERM[X + 1] + Y + 1] / 255;
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => noise(x, y) * 0.65 + noise(x * 2.03 + 17.1, y * 2.03 - 9.4) * 0.35;

/** A CSS colour (#rrggbb or "r, g, b") packed for a little-endian Uint32Array view of ImageData. */
function packed(css) {
  const v = css.trim();
  const [r, g, b] = v.startsWith("#")
    ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16))
    : v.split(",").map((n) => Number(n.trim()));
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Start the live field over a static <img class="field">. Returns a stop function, or null. */
export function liveField(img) {
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  if (!img || still.matches) return null;

  const canvas = document.createElement("canvas");
  canvas.className = "field field-live";
  canvas.setAttribute("aria-hidden", "true");
  img.after(canvas);
  const ctx = canvas.getContext("2d", { alpha: true });
  const hero = img.closest(".hero");

  let cols = 0, rows = 0, image, pixels, ink = 0, accent = 0;
  const lens = { x: 0.62, y: 0.32, tx: 0.62, ty: 0.32, last: -Infinity, inside: false };
  let raf = 0, visible = true, t0 = performance.now();

  function colours() {
    const cs = getComputedStyle(document.documentElement);
    ink = packed(cs.getPropertyValue("--ink-rgb"));
    accent = packed(cs.getPropertyValue("--accent-ink"));
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    cols = Math.max(1, Math.ceil(r.width / CELL));
    rows = Math.max(1, Math.ceil(r.height / CELL));
    canvas.width = cols;
    canvas.height = rows;
    image = ctx.createImageData(cols, rows);
    pixels = new Uint32Array(image.data.buffer);
  }

  function frame(now) {
    raf = 0;
    const t = (now - t0) / 1000;
    // Idle: the lens drifts on a slow Lissajous path until the pointer returns.
    if (now - lens.last > IDLE_AFTER) {
      lens.tx = 0.55 + 0.28 * Math.sin(t * 0.11);
      lens.ty = 0.3 + 0.14 * Math.sin(t * 0.17 + 1.3);
    }
    lens.x += (lens.tx - lens.x) * FOLLOW;
    lens.y += (lens.ty - lens.y) * FOLLOW;

    const aspect = rows / cols;            // y units per x unit
    const r2 = 2 * LENS * LENS;
    const drift = t * 0.035;
    pixels.fill(0);
    for (let j = 0; j < rows; j++) {
      const v = j / rows;
      // Clear sky by the headline: the cloud is gone 62% of the way down.
      const fade = Math.pow(Math.max(0, 1 - v / 0.62), 1.4);
      if (fade <= 0) continue;
      const dy = (v - lens.y) * aspect;
      const row = j * cols, brow = (j & 7) * 8;
      for (let i = 0; i < cols; i++) {
        const u = i / cols;
        const dx = u - lens.x;
        const d2 = dx * dx + dy * dy;
        const k = Math.exp(-d2 / r2);       // 1 at the lens centre, 0 far away
        // The lens parts the cloud: sample the noise pushed out from its centre.
        const push = k * 0.9;
        const n = fbm(u * 3.8 - dx * push + drift, v * 3.8 * aspect - dy * push + drift * 0.6);
        let value = (n - 0.3) * 1.8;          // contrast: clear sky and dense cloud
        value = value * fade + k * 0.16 * fade;
        if (value > BAYER[brow + (i & 7)]) pixels[row + i] = k > 0.55 ? accent : ink;
      }
    }
    ctx.putImageData(image, 0, 0);
    if (!hero.classList.contains("live")) hero.classList.add("live");
    schedule();
  }

  const schedule = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };

  function onPointer(e) {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (y < -0.1 || y > 1.1) return;
    lens.tx = Math.min(1.05, Math.max(-0.05, x));
    lens.ty = Math.min(1.05, Math.max(-0.05, y));
    lens.last = performance.now();
  }

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; schedule(); });
  const themeWatch = new MutationObserver(colours);
  let resizeTimer;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 100); };
  const onVisibility = () => schedule();
  const onMotion = () => { if (still.matches) stop(); };

  colours();
  resize();
  io.observe(canvas);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  addEventListener("pointermove", onPointer, { passive: true });
  addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  still.addEventListener("change", onMotion);
  schedule();

  function stop() {
    cancelAnimationFrame(raf);
    io.disconnect();
    themeWatch.disconnect();
    removeEventListener("pointermove", onPointer);
    removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    still.removeEventListener("change", onMotion);
    hero.classList.remove("live");
    canvas.remove();
  }
  return stop;
}
