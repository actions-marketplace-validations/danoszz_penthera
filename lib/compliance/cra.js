/**
 * CRA Article 14 reporting helper (Cyber Resilience Act, Regulation (EU) 2024/2847).
 *
 * Given the facts of an actively exploited vulnerability or a severe incident
 * affecting a product with digital elements, lay out the reporting timeline
 * with real due dates, flag what is overdue, and draft each report against the
 * content Article 14 requires. Fields the user hasn't provided are marked
 * NEEDS INPUT, never invented. Optionally prefills the affected component from
 * a Penthera SBOM and scan JSON.
 *
 * Offline. Drafts are starting points for the ENISA Single Reporting Platform,
 * not the platform's official form and not legal advice.
 *
 * Sources (checked 2026-10-19):
 * - Regulation (EU) 2024/2847, Art. 14 (reporting), Art. 69(3) (applies to
 *   products placed on the market before 11 Dec 2027), Art. 71(2) (Art. 14
 *   applies from 11 Sept 2026):
 *   https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng
 * - ENISA CRA Single Reporting Platform and its FAQ (deadlines, one notification
 *   per vulnerability/incident, CSIRT designated as coordinator):
 *   https://www.enisa.europa.eu/cra-srp/
 *   https://www.enisa.europa.eu/topics/product-security/vulnerability-services/eu-incident-response-and-cyber-crisis-management/single-reporting-platform-srp/frequently-asked-questions
 * - Regulation (EEC, Euratom) No 1182/71 on periods, dates and time limits
 *   (how EU periods in hours, days and months are counted):
 *   https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31971R1182
 *
 * Deadline arithmetic is deliberately strict: hours are elapsed hours from
 * `aware_at`; days and months are calendar periods in the manufacturer's time
 * zone, ending at the same wall-clock time. Reg. 1182/71 can give a little more
 * (the period runs to the end of the hour/day, and a days/months period ending
 * on a weekend or holiday moves to the next working day); don't plan on it.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Art. 14 applies from this date (Art. 71(2)); checked as the start of that day in Brussels time. */
export const CRA_ART14_APPLIES_FROM = "2026-09-11";

export const CRA_SOURCES = {
  regulation: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng",
  srp: "https://portal.cra-srp.enisa.europa.eu/",
  srpGuidance: "https://www.enisa.europa.eu/cra-srp/",
  csirtList: "https://www.enisa.europa.eu/topics/product-security/vulnerability-services/eu-incident-response-and-cyber-crisis-management/single-reporting-platform-srp/list-of-csirts-designated-as-coordinators",
  periods: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31971R1182",
};

const TYPES = {
  vulnerability: "Actively exploited vulnerability",
  incident: "Severe incident having an impact on the security of the product",
};

/** Fields collected about a CRA event (all optional; blanks become NEEDS INPUT). */
export function craTemplate() {
  return {
    _about: "Penthera CRA Article 14 reporting helper. Set `type` to \"vulnerability\" (actively exploited vulnerability) or \"incident\" (severe incident). `aware_at` is when you became aware (ISO 8601, e.g. 2026-10-19T09:30:00+02:00); it drives the deadlines. A timestamp without an offset is read in `timezone`. Fill in what you know, leave the rest blank. Offline; nothing is sent anywhere.",
    type: "vulnerability",
    title: "",
    aware_at: "",
    timezone: "Europe/Amsterdam",
    main_establishment: "NL",
    contact: "",
    product: { name: "", version: "", purl: "" },
    component: { name: "", version: "", purl: "" },
    member_states: "",
    severity: "",
    impact: "",
    sensitivity: "",
    corrective_measures_taken: "",
    user_mitigations: "",
    vulnerability_id: "",
    vulnerability_nature: "",
    exploit_nature: "",
    malicious_actor: "",
    corrective_measure_available_at: "",
    security_update: "",
    unlawful_or_malicious: "",
    incident_nature: "",
    initial_assessment: "",
    root_cause: "",
    mitigations_applied: "",
    users_informed_at: "",
    user_advisory_url: "",
    submitted: { early_warning: "", notification: "", final_report: "" },
    prefill: { scan: "", sbom: "" },
  };
}

// ── Time zone arithmetic (no dependencies; Intl only) ──────────────────────

const pad = (n, w = 2) => String(n).padStart(w, "0");

export function isValidTimeZone(tz) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

const fmtCache = new Map();
function wallParts(ms, tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, ms: ((ms % 1000) + 1000) % 1000 };
}

/** UTC offset of `tz` at instant `ms`, in milliseconds (positive east of UTC). */
function offsetAt(ms, tz) {
  const w = wallParts(ms, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s, w.ms) - ms;
}

/**
 * Wall-clock time in `tz` → UTC instant. An ambiguous time (DST fall-back)
 * resolves to the earlier instant; a time that doesn't exist (spring-forward
 * gap) moves forward past the gap, like Temporal's "compatible" mode.
 */
export function wallTimeToInstant({ y, mo, d, h = 0, mi = 0, s = 0, ms = 0 }, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const day = 24 * 3600 * 1000;
  const candidates = [...new Set([guess - offsetAt(guess - day, tz), guess - offsetAt(guess + day, tz)])];
  const valid = candidates.filter((t) => offsetAt(t, tz) + t === guess);
  if (valid.length) return Math.min(...valid);
  return Math.max(...candidates);
}

/** Add calendar days/months in `tz`, keeping the wall-clock time; clamps to month end (Reg. 1182/71 Art. 3(2)(c)). */
export function addCalendar(ms, tz, { days = 0, months = 0 } = {}) {
  const w = wallParts(ms, tz);
  let { y, mo, d } = w;
  if (months) {
    const idx = y * 12 + (mo - 1) + months;
    y = Math.floor(idx / 12);
    mo = (idx % 12) + 1;
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    if (d > last) d = last;
  }
  if (days) {
    const t = new Date(Date.UTC(y, mo - 1, d + days));
    y = t.getUTCFullYear(); mo = t.getUTCMonth() + 1; d = t.getUTCDate();
  }
  return wallTimeToInstant({ y, mo, d, h: w.h, mi: w.mi, s: w.s, ms: w.ms }, tz);
}

/**
 * Parse an ISO 8601 timestamp. With an offset or Z it is an instant; without
 * one (or date only) it is wall-clock time in `tz`. Returns ms or null.
 */
export function parseInstant(value, tz) {
  if (!value || !String(value).trim()) return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", sec = "0", frac = "0"] = m;
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
    return wallTimeToInstant({ y: +y, mo: +mo, d: +d, h: +h, mi: +mi, s: +sec, ms: +frac.padEnd(3, "0") }, tz);
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) return null; // only ISO 8601, not whatever Date.parse guesses
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** "2026-10-27 09:00 +01:00" in `tz`. */
export function formatLocal(ms, tz) {
  const w = wallParts(ms, tz);
  const off = Math.round(offsetAt(ms, tz) / 60000);
  const sign = off < 0 ? "-" : "+";
  const a = Math.abs(off);
  return `${w.y}-${pad(w.mo)}-${pad(w.d)} ${pad(w.h)}:${pad(w.mi)} ${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

function humanSpan(ms) {
  const h = Math.floor(Math.abs(ms) / 3600000);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  const mi = Math.floor((Math.abs(ms) % 3600000) / 60000);
  return `${h}h ${pad(mi)}m`;
}

// ── Prefill from Penthera artifacts ────────────────────────────────────────

const str = (x) => (x == null ? "" : String(x).trim());

/**
 * Fill product/component details from a CycloneDX SBOM and a Penthera scan
 * result, without overwriting anything the user wrote. Returns
 * { cra, prefilled: [{ field, value, from }] }.
 */
export function prefillCra(cra = {}, { sbom = null, scan = null } = {}) {
  const out = structuredClone(cra);
  out.product = { ...(out.product || {}) };
  out.component = { ...(out.component || {}) };
  const prefilled = [];
  const set = (obj, key, field, value, from) => {
    if (!str(obj[key]) && str(value)) { obj[key] = String(value); prefilled.push({ field, value: String(value), from }); }
  };

  if (sbom && typeof sbom === "object") {
    const root = sbom.metadata?.component || {};
    set(out.product, "name", "product.name", root.name, "SBOM metadata.component");
    set(out.product, "version", "product.version", root.version, "SBOM metadata.component");
    set(out.product, "purl", "product.purl", root.purl, "SBOM metadata.component");
    const want = str(out.component.name).toLowerCase();
    if (want) {
      const comps = Array.isArray(sbom.components) ? sbom.components : [];
      const pinned = str(out.component.version);
      const hit = comps.find((c) => str(c.name).toLowerCase() === want && (!pinned || str(c.version) === pinned))
        || comps.find((c) => str(c.name).toLowerCase() === want);
      if (hit) {
        set(out.component, "version", "component.version", hit.version, "SBOM components");
        set(out.component, "purl", "component.purl", hit.purl, "SBOM components");
      }
    }
  }

  if (scan && typeof scan === "object") {
    const findings = Array.isArray(scan.findings) ? scan.findings : [];
    const want = str(out.component.name).toLowerCase();
    const related = want
      ? findings.filter((f) => `${f.title || ""} ${f.description || ""} ${f.package || ""}`.toLowerCase().includes(want))
      : [];
    const cves = [...new Set(related.flatMap((f) => `${f.title || ""} ${f.description || ""} ${(f.cves || []).join(" ")}`.match(/CVE-\d{4}-\d{4,}/g) || []))];
    if (cves.length) set(out, "vulnerability_id", "vulnerability_id", cves.join(", "), "scan findings");
    const order = ["critical", "high", "medium", "low", "info"];
    const sev = related.map((f) => str(f.severity).toLowerCase()).filter((s) => order.includes(s)).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
    if (sev) set(out, "severity", "severity", `${sev} (scanner severity; review against observed impact)`, "scan findings");
    if (related.length) {
      set(out, "vulnerability_nature", "vulnerability_nature", related.slice(0, 3).map((f) => f.title).filter(Boolean).join("; "), "scan findings");
    }
  }
  return { cra: out, prefilled };
}

/**
 * Read a cra.json file and apply `prefill.scan` / `prefill.sbom` (paths
 * relative to the cra.json). Returns { cra, prefilled, errors }.
 */
export function readCraInput(path) {
  const cra = JSON.parse(readFileSync(path, "utf-8"));
  const errors = [];
  const load = (p, what) => {
    if (!str(p)) return null;
    try { return JSON.parse(readFileSync(resolve(dirname(path), p), "utf-8")); } catch (e) {
      errors.push(`Could not read prefill.${what} (${p}): ${e.message}`);
      return null;
    }
  };
  const sbom = load(cra.prefill?.sbom, "sbom");
  const scan = load(cra.prefill?.scan, "scan");
  if (!sbom && !scan) return { cra, prefilled: [], errors };
  const { cra: filled, prefilled } = prefillCra(cra, { sbom, scan });
  return { cra: filled, prefilled, errors };
}

// ── Timeline and drafts ────────────────────────────────────────────────────

const ART = "Regulation (EU) 2024/2847";

function deadlinesFor(type) {
  if (type === "incident") {
    return [
      { id: "early-warning", title: "Early warning", within: "24 hours", legal: "Art. 14(4)(a)", hours: 24, base: "aware" },
      { id: "notification", title: "Incident notification", within: "72 hours", legal: "Art. 14(4)(b)", hours: 72, base: "aware" },
      { id: "final-report", title: "Final report", within: "1 month after the incident notification", legal: "Art. 14(4)(c)", months: 1, base: "notification" },
    ];
  }
  return [
    { id: "early-warning", title: "Early warning", within: "24 hours", legal: "Art. 14(2)(a)", hours: 24, base: "aware" },
    { id: "notification", title: "Vulnerability notification", within: "72 hours", legal: "Art. 14(2)(b)", hours: 72, base: "aware" },
    { id: "final-report", title: "Final report", within: "14 days after a corrective or mitigating measure is available", legal: "Art. 14(2)(c)", days: 14, base: "fix" },
  ];
}

const SUBMITTED_KEY = { "early-warning": "early_warning", notification: "notification", "final-report": "final_report" };

// Which fields each draft surfaces: [field, label] (field may be a function).
function draftFields(type) {
  const product = (c) => [str(c.product?.name), str(c.product?.version)].filter(Boolean).join(" ") || null;
  const component = (c) => {
    const s = [str(c.component?.name), str(c.component?.version)].filter(Boolean).join(" ");
    if (!s) return null;
    return str(c.component?.purl) ? `${s} (${c.component.purl})` : s;
  };
  const productLines = [
    [product, "Product with digital elements (name and version)"],
    [component, "Affected component (name, version, purl)"],
  ];
  if (type === "incident") {
    return {
      "early-warning": [
        ...productLines,
        ["unlawful_or_malicious", "Suspected of being caused by unlawful or malicious acts"],
        ["member_states", "Member States where the product has been made available"],
      ],
      notification: [
        ...productLines,
        ["incident_nature", "General information about the nature of the incident"],
        ["initial_assessment", "Initial assessment of the incident"],
        ["corrective_measures_taken", "Corrective or mitigating measures taken"],
        ["user_mitigations", "Corrective or mitigating measures users can take"],
        ["sensitivity", "How sensitive you consider the notified information"],
      ],
      "final-report": [
        ...productLines,
        [(c) => [str(c.incident_nature), str(c.severity) && `Severity: ${str(c.severity)}`, str(c.impact) && `Impact: ${str(c.impact)}`].filter(Boolean).join(". ") || null, "Detailed description, including severity and impact"],
        ["root_cause", "Type of threat or root cause that likely triggered the incident"],
        ["mitigations_applied", "Applied and ongoing mitigation measures"],
      ],
    };
  }
  return {
    "early-warning": [
      ...productLines,
      ["vulnerability_id", "Vulnerability identifier (CVE/GHSA, if known)"],
      ["member_states", "Member States where the product has been made available"],
    ],
    notification: [
      ...productLines,
      ["vulnerability_nature", "General nature of the vulnerability"],
      ["exploit_nature", "General nature of the exploit"],
      ["corrective_measures_taken", "Corrective or mitigating measures taken"],
      ["user_mitigations", "Corrective or mitigating measures users can take"],
      ["sensitivity", "How sensitive you consider the notified information"],
    ],
    "final-report": [
      ...productLines,
      [(c) => [str(c.vulnerability_nature), str(c.severity) && `Severity: ${str(c.severity)}`, str(c.impact) && `Impact: ${str(c.impact)}`].filter(Boolean).join(". ") || null, "Description of the vulnerability, including severity and impact"],
      ["malicious_actor", "Information on any malicious actor exploiting it (where available)"],
      ["security_update", "Security update or other corrective measures made available"],
    ],
  };
}

/**
 * Build the CRA reporting timeline and per-deadline drafts.
 * @param {object} cra - fields from craTemplate() (ideally after prefillCra)
 * @param {object} jurisdiction - nl.json (uses `cra`)
 * @param {object} opts - { now, prefilled }
 */
export function buildCraReports(cra = {}, jurisdiction = {}, opts = {}) {
  const jur = jurisdiction.cra || {};
  const warnings = [];
  const type = cra.type === "incident" ? "incident" : "vulnerability";
  if (cra.type && cra.type !== "incident" && cra.type !== "vulnerability") {
    warnings.push(`Unknown type "${cra.type}"; treating it as "vulnerability". Use "vulnerability" or "incident".`);
  }

  let tz = str(cra.timezone) || jur.timezone || "UTC";
  if (!isValidTimeZone(tz)) {
    warnings.push(`Unknown time zone "${tz}"; using UTC. Use an IANA name such as Europe/Amsterdam.`);
    tz = "UTC";
  }

  const aware = parseInstant(cra.aware_at, tz);
  if (!aware) warnings.push("No valid `aware_at` timestamp, so deadlines can't be computed. Set when you became aware (ISO 8601) and re-run.");
  const now = opts.now != null ? parseInstant(opts.now, "UTC") : null;

  const applies = wallTimeToInstant({ y: 2026, mo: 9, d: 11 }, "Europe/Brussels");
  if (aware && aware < applies) {
    warnings.push(`aware_at is before ${CRA_ART14_APPLIES_FROM}, when Article 14 starts to apply (Art. 71(2)). Reporting may not be mandatory for this event; check with your CSIRT.`);
  }

  const submittedAt = (id) => parseInstant(cra.submitted?.[SUBMITTED_KEY[id]], tz);
  const fixAt = parseInstant(cra.corrective_measure_available_at, tz);

  const defs = deadlinesFor(type);
  const due = {};
  const basis = {};
  for (const d of defs) {
    let base = null;
    if (d.base === "aware") { base = aware; basis[d.id] = aware != null ? "from aware_at" : null; }
    else if (d.base === "fix") {
      base = fixAt;
      basis[d.id] = fixAt ? "from corrective_measure_available_at" : "set corrective_measure_available_at once a fix or mitigation is available";
    } else if (d.base === "notification") {
      const sub = submittedAt("notification");
      if (sub) { base = sub; basis[d.id] = "from the notification's submission time"; }
      else if (due.notification) { base = due.notification; basis[d.id] = "assuming the notification is sent at its 72h deadline; set submitted.notification for the exact date"; }
    }
    if (base == null) { due[d.id] = null; continue; }
    due[d.id] = d.hours ? base + d.hours * 3600 * 1000 : addCalendar(base, tz, { days: d.days, months: d.months });
  }

  const timeline = defs.map((d) => {
    const dueBy = due[d.id];
    const sub = submittedAt(d.id);
    let status = "unknown";
    if (sub) status = dueBy != null && sub > dueBy ? "submitted late" : "submitted";
    else if (dueBy == null) status = d.base === "fix" ? "waiting for a fix" : "set aware_at";
    else if (now != null) {
      status = now > dueBy ? "OVERDUE" : `due in ${humanSpan(dueBy - now)}`;
    }
    return {
      id: d.id,
      title: d.title,
      within: d.within,
      legal: d.legal,
      dueBy: dueBy != null ? new Date(dueBy).toISOString() : null,
      dueLocal: dueBy != null ? formatLocal(dueBy, tz) : null,
      basis: basis[d.id] || null,
      submittedAt: sub != null ? new Date(sub).toISOString() : null,
      status,
      overdue: status === "OVERDUE",
    };
  });

  const fields = draftFields(type);
  const prefilledFrom = Object.fromEntries((opts.prefilled || []).map((p) => [p.field, p.from]));
  const reports = defs.map((d) => ({
    id: d.id,
    title: d.title,
    legal: d.legal,
    dueBy: timeline.find((t) => t.id === d.id).dueBy,
    fields: fields[d.id].map(([field, label]) => {
      const value = typeof field === "function" ? field(cra) : str(cra[field]) || null;
      const src = typeof field === "string" ? prefilledFrom[field]
        : label.startsWith("Affected component") ? prefilledFrom["component.purl"] || prefilledFrom["component.version"]
        : label.startsWith("Product with") ? prefilledFrom["product.name"] : undefined;
      return { label, value, ...(src ? { prefilledFrom: src } : {}) };
    }),
  }));

  const usersInformed = parseInstant(cra.users_informed_at, tz);
  const users = {
    legal: "Art. 14(8)",
    informedAt: usersInformed != null ? new Date(usersInformed).toISOString() : null,
    status: usersInformed != null ? "informed" : "not yet informed",
    advisoryUrl: str(cra.user_advisory_url) || null,
  };

  const est = str(cra.main_establishment).toUpperCase();
  if (est && jurisdiction.id && est !== String(jurisdiction.id).toUpperCase()) {
    warnings.push(`main_establishment is ${est}, but this profile is for ${jurisdiction.name || jurisdiction.id}. Report to the CSIRT designated as coordinator in ${est} (ENISA list: ${CRA_SOURCES.csirtList}).`);
  }

  return {
    type,
    typeLabel: TYPES[type],
    title: str(cra.title) || null,
    timezone: tz,
    awareAt: aware != null ? new Date(aware).toISOString() : null,
    awareLocal: aware != null ? formatLocal(aware, tz) : null,
    contact: str(cra.contact) || null,
    product: { name: str(cra.product?.name) || null, version: str(cra.product?.version) || null, purl: str(cra.product?.purl) || null },
    component: { name: str(cra.component?.name) || null, version: str(cra.component?.version) || null, purl: str(cra.component?.purl) || null },
    authority: {
      coordinator: jur.csirtCoordinator || "the CSIRT designated as coordinator in your main establishment's Member State",
      contact: jur.csirtContact || null,
      srp: jur.srp || CRA_SOURCES.srp,
      note: jur.note || null,
    },
    timeline,
    reports,
    users,
    prefilled: opts.prefilled || [],
    warnings,
    generated_at: now != null ? new Date(now).toISOString() : null,
  };
}

/** Render the timeline and drafts as Markdown. */
export function formatCraMarkdown(result) {
  if (!result) return "";
  const L = [];
  L.push(`# CRA Article 14 report drafts${result.title ? `, ${result.title}` : ""}`);
  L.push("");
  L.push(`> **Draft reports to help you meet Cyber Resilience Act (${ART}) Article 14 deadlines. Not the ENISA Single Reporting Platform's official form, and not legal advice.** Fields marked NEEDS INPUT must be completed before you submit.`);
  L.push("");
  for (const w of result.warnings) { L.push(`> ⚠️ ${w}`); L.push(""); }

  L.push(`**Type:** ${result.typeLabel}  `);
  L.push(`**Aware at:** ${result.awareAt || "NEEDS INPUT"}${result.awareAt ? ` (${result.awareLocal}, ${result.timezone})` : ""}  `);
  L.push(`**Submit via:** the ENISA Single Reporting Platform (${result.authority.srp}), using the end-point of ${result.authority.coordinator}${result.authority.contact ? ` (${result.authority.contact})` : ""}. ENISA receives the notification at the same time (Art. 14(1), 14(3), 14(7)).`);
  if (result.authority.note) L.push(`_${result.authority.note}_`);
  L.push("");

  L.push("## Reporting timeline");
  L.push("");
  L.push(`| Report | Within | Due by (UTC) | Due by (${result.timezone}) | Status |`);
  L.push("|--------|--------|--------------|------|--------|");
  for (const t of result.timeline) {
    const status = t.overdue ? "⚠️ OVERDUE" : t.status;
    L.push(`| ${t.title} (${t.legal}) | ${t.within} | ${t.dueBy || "n/a"} | ${t.dueLocal || "n/a"} | ${status} |`);
  }
  L.push(`| Inform users (${result.users.legal}) | after becoming aware, in a timely manner | n/a | n/a | ${result.users.status} |`);
  L.push("");
  const notes = result.timeline.filter((t) => t.basis && t.basis !== "from aware_at");
  for (const t of notes) L.push(`- ${t.title}: ${t.basis}.`);
  if (notes.length) L.push("");
  L.push("_Deadlines use the strict reading: hours are elapsed hours, days and months are calendar periods in your time zone ending at the same clock time. Earlier is always fine; one notification may combine stages if the information is already available._");
  L.push("");

  for (const r of result.reports) {
    L.push(`## Draft: ${r.title} (${r.legal}${r.dueBy ? `, by ${r.dueBy}` : ""})`);
    L.push("");
    for (const f of r.fields) {
      const src = f.prefilledFrom ? ` _(prefilled from ${f.prefilledFrom}; verify)_` : "";
      L.push(`- **${f.label}:** ${f.value || "**NEEDS INPUT**"}${f.value ? src : ""}`);
    }
    if (result.contact) L.push(`- **Contact:** ${result.contact}`);
    L.push("");
  }

  L.push(`## Draft: user advisory (${result.users.legal})`);
  L.push("");
  L.push("Inform impacted users (and where appropriate all users) of the issue and of the mitigations they can deploy, where appropriate in a structured, machine-readable format (for example a CSAF advisory or a CycloneDX VEX document).");
  L.push("");
  const product = [result.product.name, result.product.version].filter(Boolean).join(" ");
  L.push(`- **Affected product and versions:** ${product || "**NEEDS INPUT**"}`);
  const r = result.reports.find((x) => x.id === "notification");
  const userMit = r?.fields.find((f) => f.label.startsWith("Corrective or mitigating measures users"));
  L.push(`- **What users should do now:** ${userMit?.value || "**NEEDS INPUT**"}`);
  L.push(`- **Published at:** ${result.users.advisoryUrl || "**NEEDS INPUT**"}`);
  L.push("");

  L.push("---");
  L.push("");
  L.push(`*Generated by Penthera${result.generated_at ? ` at ${result.generated_at}` : ""}. Sources: ${CRA_SOURCES.regulation} (Art. 14), ${CRA_SOURCES.srpGuidance} (ENISA SRP guidance). Complete every NEEDS INPUT field, confirm your CSIRT designated as coordinator, and submit within the deadlines above. Penthera does not certify CRA compliance.*`);
  L.push("");
  return L.join("\n");
}
