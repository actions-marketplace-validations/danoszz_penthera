/**
 * Penthera Pro (/pro; /upkeep redirects here). A horizontal poster: one
 * statement per panel, read by scrolling down as usual, and the row slides
 * left (/pro.js pins it and maps the page's vertical scroll to it). With no
 * script the panels stack vertically and everything still works.
 *
 *   hero → across the stack → three cards → price → calculator → waitlist
 *
 * It proposes; it does not sell. The header is a canvas sketch (/pro.js): a
 * dithered ASCII swirl in brushed steel and Penthera blue that follows the
 * pointer. It is decoration only (aria-hidden); the heading is real text.
 *
 * Nothing is stored: the calculator and the waitlist are one form that only
 * writes an email (mailto) the reader sends. The CSP allows no inline script
 * or style and no form submission (form-action 'none'), so /pro.js turns the
 * form into the email; with no script, the plain mailto link still works.
 */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const WAITLIST_MAIL = "daan@penthera.org";
export const waitlistHref = (body = "I am: \nI'd want: \nBudget a month: \nAnything else: \n") =>
  `mailto:${WAITLIST_MAIL}?subject=${encodeURIComponent("Penthera Pro waitlist")}&body=${encodeURIComponent(body)}`;

const ROLES = ["Developer", "Designer", "Founder", "Agency", "Something else"];
const WANTS = [
  "My app checked every week",
  "A person to ask when it matters",
  "A custom assessment",
  "Checks my agents can call and pay for",
];

const CARDS = [
  ["01", "The agent is free.", "Penthera stays MIT and runs on your machine. Every check Pro uses is in the free tool first. Your code is never uploaded."],
  ["02", "Pro adds a person.", "We set it up with you, run it on a schedule and read what it finds. A few calls a year, when it matters."],
  ["03", "Assessments, when you need one.", "A closer look at one app, one release or one question, with the evidence. Quoted on its own."],
];

// The calculator's sliders: the reader's own numbers, nothing assumed.
const SLIDERS = [
  { name: "hours", label: "Hours a month your team spends on security now", min: 0, max: 160, step: 5, value: 20, unit: "h", hint: "160 hours is one full-time person." },
  { name: "rate", label: "What an hour of that time costs", min: 40, max: 200, step: 10, value: 90, unit: "$", hint: "Salary and overhead, per hour." },
];

const MARK = `<svg class="pro-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><defs><linearGradient id="pro-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#c9cfd8"/><stop offset="0.55" stop-color="#6b7380"/><stop offset="0.8" stop-color="#e3e8ee"/><stop offset="1" stop-color="#9aa3b0"/></linearGradient><linearGradient id="pro-core" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b6bff"/><stop offset="0.55" stop-color="#0000ed"/><stop offset="1" stop-color="#0000a8"/></linearGradient></defs><path d="M16.00 0.40 L16.99 13.60 L21.94 10.06 L18.40 15.01 L31.60 16.00 L18.40 16.99 L21.94 21.94 L16.99 18.40 L16.00 31.60 L15.01 18.40 L10.06 21.94 L13.60 16.99 L0.40 16.00 L13.60 15.01 L10.06 10.06 L15.01 13.60Z" fill="url(#pro-steel)" stroke="rgba(255,255,255,0.55)" stroke-width="0.4" stroke-linejoin="miter"/><path d="M16.00 11.80 L20.20 16.00 L16.00 20.20 L11.80 16.00Z" fill="url(#pro-core)"/></svg>`;

const slider = ({ name, label, min, max, step, value, unit, hint }) => `
          <div class="pro-slider">
            <label for="pro-${name}">${esc(label)}</label>
            <div class="pro-range"><input type="range" id="pro-${name}" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}"><output for="pro-${name}" data-unit="${unit}">${unit === "$" ? `$${value}` : `${value} ${unit}`}</output></div>
            <p class="pro-hint">${esc(hint)}</p>
          </div>`;

/** The page's <main> content. `version` pins the install line. */
export function proMain({ version }) {
  const mail = esc(waitlistHref());
  return `
  <div class="pro-h" data-h>
    <div class="pro-sticky">
      <div class="pro-track">
        <section class="pro-panel pro-hero" aria-labelledby="pro-title">
          <canvas class="pro-canvas" aria-hidden="true"></canvas>
          <div class="pro-hero-text">
            <ul class="pills" aria-label="Penthera, Pro, in validation"><li><a href="/">Penthera</a></li><li>Pro</li><li>In validation</li></ul>
            <h1 id="pro-title">${MARK}Penthera Pro</h1>
            <p class="pro-lede">A security partner for software built with agents.</p>
            <p class="pro-cta"><a class="btn-steel" href="#join" data-track="pro-hero-waitlist">Sign up for the waitlist</a><span class="pro-scroll-hint" aria-hidden="true">scroll →</span></p>
          </div>
        </section>

        <section class="pro-panel band pro-stack" aria-labelledby="pro-stack-title">
          <p class="label">What it is</p>
          <h2 id="pro-stack-title">Security across the stack.</h2>
          <p class="pro-big">For the developer, the designer and the founder. Pro takes on part of what an in-house security expert does, and spreads it across everyone who ships.</p>
        </section>

        ${CARDS.map(([n, h, p]) => `<section class="pro-panel band band-invert pro-card-panel" aria-label="${esc(h)}">
          <span class="pro-num">${n}</span>
          <h2>${esc(h)}</h2>
          <p class="pro-big">${esc(p)}</p>
        </section>`).join("\n        ")}

        <section class="pro-panel band band-blue pro-price-panel" aria-labelledby="pro-price-title">
          <p class="label">Price, while we test</p>
          <h2 id="pro-price-title"><span class="spec-big">$100–300</span> a month per team.</h2>
          <p class="pro-big">Assessments are quoted on their own. Nothing to buy yet.</p>
          <p class="pro-self">What it is not: a whole security team, a certification or a pentest. It takes on part of the role, and shows what was checked and found, with the evidence.</p>
          <p class="pro-self">Rather run it yourself? <code>npx penthera@${esc(version)} init --yes</code> sets up the same checks in your own CI, free.</p>
          <p class="pro-research"><span>In research</span> Checks your agents can call and pay for, one at a time, each with a signed verdict.</p>
        </section>

        <form class="pro-form" novalidate>
          <section class="pro-panel band pro-calc" id="calc" aria-labelledby="pro-calc-title">
            <p class="label">Your numbers</p>
            <h2 id="pro-calc-title">What does security cost you now?</h2>
            ${SLIDERS.map(slider).join("")}
            <p class="pro-result" aria-live="polite"><span class="pro-result-n" data-cost>$1,800</span> a month of your team's time, <span data-fte>0.13</span> of a full-time role. Pro is $100–300 a month: the agent takes the routine checks, a person takes the judgment calls.</p>
            ${slider({ name: "budget", label: "What you'd consider spending a month", min: 100, max: 2000, step: 50, value: 300, unit: "$", hint: "Goes into your email, so we know what fits." }).replace('class="pro-slider"', 'class="pro-slider pro-budget"')}
          </section>

          <section class="pro-panel band pro-join" id="join" aria-labelledby="pro-join-title">
            <p class="label">Waitlist</p>
            <h2 id="pro-join-title">Sign up for the waitlist.</h2>
            <fieldset>
              <legend>I am</legend>
              <div class="pro-chips">${ROLES.map((r, i) => `<label class="pro-chip"><input type="radio" name="role" value="${esc(r)}"${i === 0 ? " checked" : ""}><span>${esc(r)}</span></label>`).join("")}</div>
            </fieldset>
            <fieldset>
              <legend>I'd want</legend>
              <div class="pro-chips">${WANTS.map((t) => `<label class="pro-chip"><input type="checkbox" name="want" value="${esc(t)}"><span>${esc(t)}</span></label>`).join("")}</div>
            </fieldset>
            <label class="pro-q" for="pro-note">Anything else <span>(optional)</span></label>
            <textarea id="pro-note" name="note" rows="2" maxlength="600" placeholder="Your stack, your app, what keeps you up at night"></textarea>
            <p class="pro-send"><button class="btn" data-variant="default" type="submit" data-track="pro-waitlist">Sign up for the waitlist</button><a class="pro-plain" href="${mail}" data-track="pro-waitlist-plain">or email ${esc(WAITLIST_MAIL)}</a></p>
            <p class="pro-note">Signing up opens an email to Daan, who builds Penthera, with your answers and numbers filled in. You send it; nothing is stored on penthera.org. He replies to every one.</p>
          </section>
        </form>
      </div>
      <div class="pro-progress" aria-hidden="true"><span></span></div>
    </div>
  </div>`;
}
