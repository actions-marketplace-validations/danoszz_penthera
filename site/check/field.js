/**
 * The hero's field, live: a drifting cloud of value noise, ordered-dithered to
 * one bit (8×8 Bayer) on 4 px cells, so it reads like the static field.png it
 * replaces. The pointer is a scanning lens: it parts the cloud around it,
 * and the dots under it turn the accent colour, dithered out at the rim:
 * hard pixels, no blur. With no
 * pointer (touch, or idle) the lens drifts on a slow path.
 *
 * A click in the hero sends a shockwave: a ring expands from the point and
 * shoves the cloud outward, leaving a crater that refills. The ring's front
 * burns in the accent, its wake in the other blue of the palette (#0000ed and
 * #7a7aff swap by theme), and the lens flinches and springs back. Drawn on a
 * canvas the size of the grid and scaled up pixelated.
 *
 * Runs only when motion is welcome, and only while the hero is on screen.
 * Without JS, or with reduced motion, the static field.png stays.
 *
 * Frame budget (2026-10-29): a frame is a full pass over every cell on the
 * main thread, so the loop is capped instead of running at the display's
 * rate (120 Hz on ProMotion screens). Up to 60 fps while the pointer moves
 * or a shockwave runs; 20 fps while the cloud only drifts, which moves it
 * less than a cell per frame. Easing is per millisecond, so the lens moves
 * the same at any rate.
 */

const CELL = 4;                 // CSS px per dither cell
const LENS = 0.18;              // lens radius, as a share of the field's width
const FOLLOW = 0.09;            // how fast the lens catches the pointer, per frame
const IDLE_AFTER = 2400;        // ms without pointer movement before the lens drifts
const WAVE_LIFE = 1.8;          // s a shockwave lasts
const WAVE_REACH = 0.95;        // how far it travels, as a share of the width
const WAVE_FRONT = 0.035;       // thickness of the ring
const MAX_WAVES = 4;
const ACTIVE_MS = 1000 / 60;    // frame interval while the pointer or a wave is live
const IDLE_MS = 1000 / 20;      // frame interval while the cloud only drifts

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

  let cols = 0, rows = 0, skip = 0, image, pixels, ink = 0, accent = 0, wake = 0;
  const waves = [];
  const lens = { x: 0.62, y: 0.32, tx: 0.62, ty: 0.32, last: -Infinity, inside: false };
  let raf = 0, visible = true, t0 = performance.now(), drawn = -Infinity, timer = 0;

  function colours() {
    const cs = getComputedStyle(document.documentElement);
    ink = packed(cs.getPropertyValue("--ink-rgb"));
    const a = cs.getPropertyValue("--accent-ink").trim().toLowerCase();
    accent = packed(a);
    // The palette's other blue: deep #0000ed behind a light front, and the reverse.
    wake = packed(a === "#0000ed" ? "#7a7aff" : "#0000ed");
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    cols = Math.max(1, Math.ceil(r.width / CELL));
    rows = Math.max(1, Math.ceil(r.height / CELL));
    canvas.width = cols;
    canvas.height = rows;
    // Columns the CSS mask hides completely (--field-from, a share of the
    // width; styles.css keeps it with the mask) are never drawn.
    skip = Math.floor(cols * Math.min(1, Math.max(0, parseFloat(getComputedStyle(canvas).getPropertyValue("--field-from")) || 0)));
    image = ctx.createImageData(cols, rows);
    pixels = new Uint32Array(image.data.buffer);
  }

  function frame(now) {
    raf = 0;
    const idle = now - lens.last > IDLE_AFTER && !waves.length;
    // Skip display frames until this one's interval is up (1 ms of slack for vsync jitter).
    const wait = (idle ? IDLE_MS : ACTIVE_MS) - 1 - (now - drawn);
    if (wait > 0) { schedule(idle ? wait : 0); return; }
    const dt = Math.min(100, now - drawn);
    drawn = now;
    const t = (now - t0) / 1000;
    // Idle: the lens drifts on a slow Lissajous path until the pointer returns.
    if (now - lens.last > IDLE_AFTER) {
      lens.tx = 0.55 + 0.28 * Math.sin(t * 0.11);
      lens.ty = 0.3 + 0.14 * Math.sin(t * 0.17 + 1.3);
    }
    // FOLLOW is the catch-up per 60 Hz frame; scale it to the time since the last one.
    const follow = 1 - Math.pow(1 - FOLLOW, dt / (1000 / 60));
    lens.x += (lens.tx - lens.x) * follow;
    lens.y += (lens.ty - lens.y) * follow;

    const aspect = rows / cols;            // y units per x unit
    const drift = t * 0.035;

    // Live shockwaves: radius eases out, strength fades with age.
    while (waves.length && (now - waves[0].t0) / 1000 > WAVE_LIFE) waves.shift();
    const live = waves.map((w) => {
      const a = (now - w.t0) / 1000 / WAVE_LIFE;
      return { x: w.x, y: w.y * aspect, r: WAVE_REACH * (1 - Math.pow(1 - a, 3)), decay: (1 - a) * (1 - a) };
    });
    // The lens flinches on a click and springs back.
    const newest = waves.at(-1);
    const flinch = newest ? 1 - 0.5 * Math.exp(-((now - newest.t0) / 1000) * 5) : 1;
    const lensR = LENS * flinch;
    const r2 = 2 * lensR * lensR;
    const far = r2 * 14;                   // past this squared distance the lens weighs < 1e-6

    pixels.fill(0);
    for (let j = 0; j < rows; j++) {
      const v = j / rows;
      // The cloud thins towards the bottom and is gone 85% of the way down,
      // so the headline sits on its thinning edge.
      const fade = Math.pow(Math.max(0, 1 - v / 0.85), 1.2);
      if (fade <= 0 && !live.length) continue;
      const vy = v * aspect;
      const dy = vy - lens.y * aspect;
      const row = j * cols, brow = (j & 7) * 8, brow2 = ((j + 4) & 7) * 8;
      for (let i = skip; i < cols; i++) {
        const u = i / cols;
        const dx = u - lens.x;
        const d2 = dx * dx + dy * dy;
        const k = d2 > far ? 0 : Math.exp(-d2 / r2);     // 1 at the lens centre, 0 far away
        // The lens parts the cloud: sample the noise pushed out from its centre.
        let sx = u * 3.8 - dx * k * 0.9 + drift;
        let sy = v * 3.8 * aspect - dy * k * 0.9 + drift * 0.6;
        let front = 0, crater = 0, trail = 0;
        for (let q = 0; q < live.length; q++) {
          const w = live[q];
          const wx = u - w.x, wy = vy - w.y;
          const dist = Math.sqrt(wx * wx + wy * wy) + 1e-6;
          const d = dist - w.r;
          const f = Math.exp(-(d * d) / (2 * WAVE_FRONT * WAVE_FRONT)) * w.decay;
          const c = d < 0 ? w.decay * Math.min(1, -d / 0.14) : 0;
          // Everything is shoved outward: the front hardest, the crater after it.
          const shove = (f * 0.55 + c * 0.35) / dist;
          sx -= wx * shove * 3.8;
          sy -= wy * shove * 3.8;
          if (f > front) front = f;
          if (c > crater) crater = c;
          if (d < 0 && d > -0.22) trail = Math.max(trail, w.decay * (1 + d / 0.22));
        }
        const n = fbm(sx, sy);
        let value = (n - 0.3) * 1.8 * fade * (1 - crater * 0.92);
        // The ring itself, faint even over clear sky.
        value += front * (0.75 * fade + 0.35);
        const th = BAYER[brow + (i & 7)];
        if (value <= th) continue;
        let colour = ink;
        if (front > 0.2 && front > BAYER[brow2 + ((i + 4) & 7)]) colour = accent;
        else if (trail > BAYER[brow2 + ((i + 4) & 7)] * 1.4) colour = wake;
        // The orb: the lens's dots in the accent, dithered out at the rim, hard pixels throughout.
        else if (k * 1.7 - 0.5 > BAYER[brow2 + ((i + 4) & 7)]) colour = accent;
        pixels[row + i] = colour;
      }
    }
    ctx.putImageData(image, 0, 0);
    if (!hero.classList.contains("live")) hero.classList.add("live");
    // While idle, sleep on a timer between frames instead of waking every vsync.
    schedule(idle ? IDLE_MS - (performance.now() - now) - 2 : 0);
  }

  // The next frame: at the next vsync, or after `delay` ms. A call without a
  // delay (pointer, click, visibility) cuts a pending sleep short.
  function schedule(delay = 0) {
    if (raf || !visible || document.hidden) return;
    if (delay > 0) {
      if (!timer) timer = setTimeout(() => { timer = 0; schedule(); }, delay);
      return;
    }
    clearTimeout(timer);
    timer = 0;
    raf = requestAnimationFrame(frame);
  }

  function onPointer(e) {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (y < -0.1 || y > 1.1) return;
    lens.tx = Math.min(1.05, Math.max(-0.05, x));
    lens.ty = Math.min(1.05, Math.max(-0.05, y));
    lens.last = performance.now();
    schedule();
  }

  function onPress(e) {
    if (e.button > 0 || e.target.closest("a, button, input, textarea, select, video, label, summary")) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (y < 0 || y > 1) return;
    waves.push({ x, y, t0: performance.now() });
    if (waves.length > MAX_WAVES) waves.shift();
    schedule();
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
  hero.addEventListener("pointerdown", onPress);
  addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  still.addEventListener("change", onMotion);
  schedule();

  function stop() {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    io.disconnect();
    themeWatch.disconnect();
    removeEventListener("pointermove", onPointer);
    hero.removeEventListener("pointerdown", onPress);
    removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    still.removeEventListener("change", onMotion);
    hero.classList.remove("live");
    canvas.remove();
  }
  return stop;
}
