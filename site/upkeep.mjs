/**
 * The Upkeep waitlist page as a poster: one assertion per band, a slider of
 * what goes wrong after launch, a switch between the two ways to run
 * Penthera, and an email button that carries the reader's picks. The
 * Markdown in site/pages/upkeep.md (`layout: upkeep`) stays the version for
 * agents and search; this is the HTML for people.
 *
 * Nothing is stored: the waitlist is a mailto. The CSP allows no inline script
 * or style, so the behaviour is /upkeep.js and the look is in styles.css; with
 * no script, the slider scrolls, both ways show, and the button still works.
 */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const WAITLIST_MAIL = "daan@penthera.org";
export const waitlistHref = (body = "I am: \nTeam size: \nMost worried about: \n") =>
  `mailto:${WAITLIST_MAIL}?subject=${encodeURIComponent("Upkeep waitlist")}&body=${encodeURIComponent(body)}`;

const PROBLEMS = [
  ["A package you trust ships malware overnight.", 'Every dependency checked each week, with the rules that rank 1st of the free tools on npm and PyPI malware in our <a href="/benchmarks">public benchmarks</a>.'],
  ["A redesign quietly drops a security header.", "Your live site checked from the outside on a schedule. You hear what changed, with the evidence."],
  ["An API key slips into a commit.", "Secrets checked on every push, in your own CI."],
  ["Your coding agent picks up a new MCP server.", "Agent setup checked: MCP servers, skills, hooks and permissions."],
  ["A client asks: is our app secure?", "A monthly report of what was checked, what was found and what got fixed. Forward it as it is."],
  ["A supplier questionnaire stalls a deal.", "Answers drafted from that evidence. For software you ship in the EU, the evidence the Cyber Resilience Act asks for."],
];

const ROLES = ["Solo builder", "Product team", "Agency"];
const WORRIES = ["Malware in packages", "Leaked keys", "Site config", "Client reports", "Questionnaires"];

const n2 = (i) => String(i + 1).padStart(2, "0");
const chips = (group, items) => items.map((t) => `<button type="button" class="upk-chip" data-group="${group}" aria-pressed="false">${esc(t)}</button>`).join("");

/** The page's <main> content. `version` pins the install line. */
export function upkeepMain({ version }) {
  const href = esc(waitlistHref());
  const cta = (label = "Join the waitlist") => `<a class="btn upk-join" data-variant="default" data-track="upkeep-waitlist" href="${href}">${label}</a>`;
  return `
  <section class="band upk-hero" aria-labelledby="upk-title">
    <div class="upk-wrap">
      <p class="eyebrow"><a href="/">Penthera</a> · Upkeep · in validation</p>
      <p class="problem"><span>You shipped it. Keeping it safe is the part nobody has time for.</span></p>
      <h1 id="upk-title">Security upkeep, done for you.</h1>
      <p class="upk-lede">Penthera checks your app every week, opens fixes you approve and writes the report your clients ask for. Same open-source rules: run it yourself for free, or let us run it.</p>
      <ul class="pills" aria-label="Open source, same rules, leave any time"><li>Open source</li><li>Same rules</li><li>Leave any time</li></ul>
      <p class="land-cta">${cta()}<a class="upk-ghost" href="#two-ways">or run it yourself</a></p>
      <p class="upk-note">Nothing to buy yet.</p>
    </div>
  </section>

  <section class="band upk-slides" aria-labelledby="upk-slides-title">
    <div class="upk-wrap">
      <p class="label">What goes wrong after launch</p>
      <div class="upk-head">
        <h2 id="upk-slides-title">Six Monday mornings.</h2>
        <div class="upk-nav" hidden>
          <button type="button" class="btn btn-sm" data-slide="-1" aria-label="Previous">←</button>
          <span class="upk-count" aria-live="polite">01 / ${n2(PROBLEMS.length - 1)}</span>
          <button type="button" class="btn btn-sm" data-slide="1" aria-label="Next">→</button>
        </div>
      </div>
    </div>
    <ol class="upk-track" tabindex="0" aria-label="Six problems, scroll sideways">
      ${PROBLEMS.map(([p, a], i) => `<li class="upk-card"><span class="upk-num">${n2(i)}</span><h3>${esc(p)}</h3><p><b>Upkeep:</b> ${a}</p></li>`).join("\n      ")}
    </ol>
  </section>

  <section class="band band-invert upk-ways" id="two-ways" aria-labelledby="upk-ways-title">
    <div class="upk-wrap">
      <p class="label">Two ways, same rules</p>
      <h2 id="upk-ways-title">Run it yourself, or we run it for you.</h2>
      <div class="upk-switch" role="tablist" aria-label="Who runs it" hidden>
        <button type="button" role="tab" id="tab-self" aria-controls="way-self" aria-selected="false" tabindex="-1">Run it yourself</button>
        <button type="button" role="tab" id="tab-us" aria-controls="way-us" aria-selected="true">We run it for you</button>
      </div>
      <div class="upk-panels">
        <article class="upk-way" id="way-self" role="tabpanel" aria-labelledby="tab-self">
          <h3>Run it yourself</h3>
          <ul>
            <li><code>npx penthera@${esc(version)} init --yes</code> sets up the checks.</li>
            <li>The GitHub Action runs them on a schedule, in your own CI.</li>
            <li>Everything stays on your machine. No account.</li>
            <li>You read the reports and choose the fixes.</li>
          </ul>
          <p class="upk-price"><span class="spec-big">$0</span> Free and MIT, forever.</p>
        </article>
        <article class="upk-way" id="way-us" role="tabpanel" aria-labelledby="tab-us">
          <h3>We run it for you</h3>
          <ul>
            <li>We schedule and run the checks, and keep the infrastructure running.</li>
            <li>Passive checks of your live site every week. Active tests only on hosts you've shown you own, and only when you ask.</li>
            <li>History over time: what changed and what got fixed, with the evidence.</li>
            <li>Fix pull requests you approve. Nothing merges without you.</li>
            <li>The monthly report, ready for clients and questionnaires.</li>
          </ul>
          <p class="upk-price"><span class="spec-big">$100–300</span> a month per team or agency, while we test. Nothing to buy yet.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="band band-blue upk-promise" aria-labelledby="upk-promise-title">
    <div class="upk-wrap">
      <p class="label">The promise</p>
      <h2 id="upk-promise-title">Open source. Always.</h2>
      <ul class="pillars">
        <li><h3>Nothing leaves the free tool.</h3><p>Every check Upkeep runs is in the MIT command-line tool first.</p></li>
        <li><h3>Your code stays yours.</h3><p>Source is never uploaded. Code checks run in your own CI; Upkeep reads only their results.</p></li>
        <li><h3>No certificates, no magic.</h3><p>It shows what was checked and found, with the evidence. Not a certification, not a pentest.</p></li>
      </ul>
    </div>
  </section>

  <section class="band upk-join-band" id="join" aria-labelledby="upk-join-title">
    <div class="upk-wrap">
      <p class="label">Waitlist</p>
      <h2 id="upk-join-title">Get on the list.</h2>
      <div class="upk-picks" hidden>
        <p class="upk-q">I am</p>
        <div class="upk-chips" role="group" aria-label="I am">${chips("role", ROLES)}</div>
        <p class="upk-q">Most worried about</p>
        <div class="upk-chips" role="group" aria-label="Most worried about">${chips("worry", WORRIES)}</div>
      </div>
      <p class="land-cta">${cta("Join the waitlist")}</p>
      <p class="upk-note">Opens an email to ${WAITLIST_MAIL}<span class="upk-js-note" hidden> with your picks filled in</span>. Nothing is stored on penthera.org. Daan, who builds Penthera, replies to every one.</p>
    </div>
  </section>`;
}
