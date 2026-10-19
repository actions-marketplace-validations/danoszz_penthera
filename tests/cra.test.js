/**
 * CRA Article 14 reporting helper: deadline math (time zones, DST, month
 * ends), status/overdue, prefill from SBOM + scan, and Markdown drafts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  craTemplate, buildCraReports, formatCraMarkdown, prefillCra, readCraInput,
  parseInstant, addCalendar, formatLocal, CRA_ART14_APPLIES_FROM,
} from "../lib/compliance/cra.js";

const NL = JSON.parse(readFileSync(new URL("../lib/jurisdictions/nl.json", import.meta.url), "utf-8"));
const FIX = new URL("./fixtures/cra/", import.meta.url);
const due = (r) => Object.fromEntries(r.timeline.map((t) => [t.id, t.dueBy]));
const AMS = "Europe/Amsterdam";

describe("CRA template", () => {
  it("scaffolds both report types' fields", () => {
    const t = craTemplate();
    expect(t.type).toBe("vulnerability");
    for (const k of ["aware_at", "timezone", "corrective_measure_available_at", "unlawful_or_malicious", "root_cause", "member_states", "users_informed_at"]) {
      expect(t).toHaveProperty(k);
    }
    expect(t.submitted).toHaveProperty("notification");
    expect(t.prefill).toHaveProperty("sbom");
  });

  it("NL profile names NCSC-NL as CSIRT designated as coordinator", () => {
    expect(NL.cra.csirtCoordinator).toMatch(/NCSC-NL/);
    expect(NL.cra.timezone).toBe(AMS);
    expect(CRA_ART14_APPLIES_FROM).toBe("2026-09-11");
  });
});

describe("time handling", () => {
  it("reads timestamps without an offset in the given time zone", () => {
    expect(new Date(parseInstant("2026-10-24T09:00", AMS)).toISOString()).toBe("2026-10-24T07:00:00.000Z");
    expect(new Date(parseInstant("2026-10-24T09:00", "UTC")).toISOString()).toBe("2026-10-24T09:00:00.000Z");
    expect(new Date(parseInstant("2026-12-01", AMS)).toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(new Date(parseInstant("2026-10-24T09:00:00+02:00", "UTC")).toISOString()).toBe("2026-10-24T07:00:00.000Z");
  });

  it("rejects non-ISO and impossible dates", () => {
    expect(parseInstant("", AMS)).toBeNull();
    expect(parseInstant("next tuesday", AMS)).toBeNull();
    expect(parseInstant("10/24/2026", AMS)).toBeNull();
    expect(parseInstant("2026-13-01", AMS)).toBeNull();
  });

  it("moves a non-existent spring-forward time past the gap, and takes the earlier of an ambiguous fall-back time", () => {
    // 2026-03-29 02:30 does not exist in Amsterdam (clocks jump 02:00 → 03:00).
    expect(formatLocal(parseInstant("2026-03-29T02:30", AMS), AMS)).toBe("2026-03-29 03:30 +02:00");
    // 2026-10-25 02:30 happens twice; the first one is still CEST.
    expect(new Date(parseInstant("2026-10-25T02:30", AMS)).toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("adds calendar days at the same wall-clock time across DST", () => {
    const autumn = parseInstant("2026-10-20T10:00", AMS); // CEST
    expect(new Date(addCalendar(autumn, AMS, { days: 14 })).toISOString()).toBe("2026-11-03T09:00:00.000Z"); // 10:00 CET
    const spring = parseInstant("2027-03-20T10:00", AMS); // CET
    expect(new Date(addCalendar(spring, AMS, { days: 14 })).toISOString()).toBe("2027-04-03T08:00:00.000Z"); // 10:00 CEST
    // A zone without DST keeps exactly 336 hours.
    expect(new Date(addCalendar(Date.parse("2026-10-20T08:00:00Z"), "Asia/Kolkata", { days: 14 })).toISOString()).toBe("2026-11-03T08:00:00.000Z");
  });

  it("clamps one month to the last day of a shorter month", () => {
    const jan31 = parseInstant("2027-01-31T10:00", AMS);
    expect(formatLocal(addCalendar(jan31, AMS, { months: 1 }), AMS)).toBe("2027-02-28 10:00 +01:00");
    const leap = parseInstant("2028-01-31T10:00", AMS);
    expect(formatLocal(addCalendar(leap, AMS, { months: 1 }), AMS)).toBe("2028-02-29 10:00 +01:00");
    const dec = parseInstant("2026-12-15T10:00", AMS);
    expect(formatLocal(addCalendar(dec, AMS, { months: 1 }), AMS)).toBe("2027-01-15 10:00 +01:00");
  });
});

describe("actively exploited vulnerability timeline", () => {
  it("computes 24h and 72h as elapsed hours, even across the DST change", () => {
    const r = buildCraReports({ type: "vulnerability", aware_at: "2026-10-24T09:00:00+02:00" }, NL);
    expect(due(r)["early-warning"]).toBe("2026-10-25T07:00:00.000Z");
    expect(due(r).notification).toBe("2026-10-27T07:00:00.000Z");
    // Clock went back an hour, so the local due time is 08:00, not 09:00.
    expect(r.timeline.find((t) => t.id === "notification").dueLocal).toBe("2026-10-27 08:00 +01:00");
  });

  it("does the same across spring-forward", () => {
    const r = buildCraReports({ type: "vulnerability", aware_at: "2027-03-27T10:00", timezone: AMS }, NL);
    expect(r.timeline[0].dueLocal).toBe("2027-03-28 11:00 +02:00");
  });

  it("waits for a fix before the 14-day final report has a date", () => {
    const r = buildCraReports({ type: "vulnerability", aware_at: "2026-10-20T08:00:00Z" }, NL, { now: "2026-10-20T09:00:00Z" });
    const fin = r.timeline.find((t) => t.id === "final-report");
    expect(fin.dueBy).toBeNull();
    expect(fin.status).toBe("waiting for a fix");
  });

  it("runs the final report 14 calendar days from the fix", () => {
    const r = buildCraReports({ type: "vulnerability", aware_at: "2026-10-18T08:00:00Z", corrective_measure_available_at: "2026-10-20T10:00" }, NL);
    expect(due(r)["final-report"]).toBe("2026-11-03T09:00:00.000Z");
  });

  it("flags overdue, submitted and late reports", () => {
    const r = buildCraReports({
      type: "vulnerability",
      aware_at: "2026-10-01T08:00:00Z",
      submitted: { early_warning: "2026-10-01T20:00:00Z", notification: "2026-10-05T08:00:00Z" },
      corrective_measure_available_at: "2026-10-02T08:00:00Z",
    }, NL, { now: "2026-10-19T12:00:00Z" });
    const s = Object.fromEntries(r.timeline.map((t) => [t.id, t.status]));
    expect(s["early-warning"]).toBe("submitted");
    expect(s.notification).toBe("submitted late");
    expect(s["final-report"]).toBe("OVERDUE");
    expect(r.timeline.find((t) => t.id === "final-report").overdue).toBe(true);
  });

  it("reports time left when on track", () => {
    const r = buildCraReports({ aware_at: "2026-10-19T08:00:00Z" }, NL, { now: "2026-10-19T10:30:00Z" });
    expect(r.timeline[0].status).toBe("due in 21h 30m");
    expect(r.timeline[1].status).toBe("due in 2d 21h");
  });
});

describe("severe incident timeline", () => {
  it("counts the final report one month from the notification's submission", () => {
    const r = buildCraReports({ type: "incident", aware_at: "2027-01-28T10:00", submitted: { notification: "2027-01-31T10:00" } }, NL);
    expect(r.typeLabel).toMatch(/Severe incident/);
    expect(r.timeline.find((t) => t.id === "final-report").dueLocal).toBe("2027-02-28 10:00 +01:00");
  });

  it("assumes the 72h deadline when the notification isn't submitted yet, and says so", () => {
    const r = buildCraReports({ type: "incident", aware_at: "2026-11-02T09:00:00Z" }, NL);
    expect(due(r).notification).toBe("2026-11-05T09:00:00.000Z");
    expect(due(r)["final-report"]).toBe("2026-12-05T09:00:00.000Z");
    expect(r.timeline.find((t) => t.id === "final-report").basis).toMatch(/assuming/);
  });

  it("drafts the incident content Art. 14(4) asks for", () => {
    const r = buildCraReports({ type: "incident", aware_at: "2026-11-02T09:00:00Z", unlawful_or_malicious: "yes, credential stuffing" }, NL);
    const ew = r.reports.find((x) => x.id === "early-warning");
    expect(ew.legal).toBe("Art. 14(4)(a)");
    expect(ew.fields.find((f) => /unlawful or malicious/.test(f.label)).value).toBe("yes, credential stuffing");
    const fin = r.reports.find((x) => x.id === "final-report");
    expect(fin.fields.map((f) => f.label).join("|")).toMatch(/root cause/);
  });
});

describe("warnings", () => {
  it("warns about missing aware_at, unknown type and time zone, other establishment, and pre-application dates", () => {
    expect(buildCraReports({}, NL).warnings.join(" ")).toMatch(/aware_at/);
    expect(buildCraReports({ type: "bug", aware_at: "2026-10-01T00:00:00Z" }, NL).warnings.join(" ")).toMatch(/Unknown type/);
    const tz = buildCraReports({ aware_at: "2026-10-01T09:00", timezone: "Mars/Olympus" }, NL);
    expect(tz.timezone).toBe("UTC");
    expect(tz.awareAt).toBe("2026-10-01T09:00:00.000Z");
    expect(buildCraReports({ aware_at: "2026-10-01T00:00:00Z", main_establishment: "BE" }, NL).warnings.join(" ")).toMatch(/BE/);
    expect(buildCraReports({ aware_at: "2026-09-01T00:00:00Z" }, NL).warnings.join(" ")).toMatch(/2026-09-11/);
    expect(buildCraReports({ aware_at: "2026-09-11T00:30:00+02:00" }, NL).warnings.join(" ")).not.toMatch(/2026-09-11/);
  });
});

describe("prefill from SBOM and scan", () => {
  const sbom = JSON.parse(readFileSync(new URL("sbom.cdx.json", FIX), "utf-8"));
  const scan = JSON.parse(readFileSync(new URL("scan.json", FIX), "utf-8"));

  it("fills product, component version/purl, CVEs and scanner severity", () => {
    const { cra, prefilled } = prefillCra({ component: { name: "jquery" } }, { sbom, scan });
    expect(cra.product).toMatchObject({ name: "acme-portal", version: "3.2.1" });
    expect(cra.component).toMatchObject({ version: "3.4.1", purl: "pkg:npm/jquery@3.4.1" });
    expect(cra.vulnerability_id).toBe("CVE-2020-11022, CVE-2020-11023");
    expect(cra.severity).toMatch(/^medium \(scanner severity/);
    expect(prefilled.map((p) => p.field)).toContain("component.purl");
  });

  it("never overwrites what the user wrote", () => {
    const { cra } = prefillCra({ product: { name: "mine" }, component: { name: "jquery", purl: "pkg:npm/jquery@9" }, vulnerability_id: "GHSA-x" }, { sbom, scan });
    expect(cra.product.name).toBe("mine");
    expect(cra.component.purl).toBe("pkg:npm/jquery@9");
    expect(cra.vulnerability_id).toBe("GHSA-x");
  });

  it("readCraInput resolves prefill paths relative to the cra.json, and reports unreadable ones", () => {
    const input = readCraInput(new URL("cra.json", FIX).pathname);
    expect(input.errors).toEqual([]);
    expect(input.cra.component.purl).toBe("pkg:npm/jquery@3.4.1");
    const dir = mkdtempSync(join(tmpdir(), "penthera-cra-"));
    try {
      writeFileSync(join(dir, "cra.json"), JSON.stringify({ aware_at: "2026-10-19T08:00:00Z", prefill: { sbom: "missing.json" } }));
      const bad = readCraInput(join(dir, "cra.json"));
      expect(bad.errors[0]).toMatch(/prefill\.sbom/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("Markdown drafts", () => {
  const input = readCraInput(new URL("cra.json", FIX).pathname);
  const r = buildCraReports(input.cra, NL, { now: "2026-10-28T12:00:00Z", prefilled: input.prefilled });
  const md = formatCraMarkdown(r);

  it("carries the honesty disclaimers and the SRP/CSIRT route", () => {
    expect(md).toMatch(/Not the ENISA Single Reporting Platform's official form, and not legal advice/);
    expect(md).toMatch(/does not certify CRA compliance/);
    expect(md).toContain("NCSC-NL");
    expect(md).toContain("portal.cra-srp.enisa.europa.eu");
  });

  it("shows the timeline with overdue items and both time zones", () => {
    expect(md).toContain("Reporting timeline");
    expect(md).toMatch(/Vulnerability notification \(Art\. 14\(2\)\(b\)\).*OVERDUE/);
    expect(md).toContain("2026-10-27 08:00 +01:00");
    expect(md).toContain("Inform users (Art. 14(8))");
  });

  it("drafts each report with prefilled values marked and gaps as NEEDS INPUT", () => {
    expect(md).toContain("## Draft: Early warning (Art. 14(2)(a)");
    expect(md).toContain("## Draft: Final report (Art. 14(2)(c)");
    expect(md).toContain("jquery 3.4.1 (pkg:npm/jquery@3.4.1) _(prefilled from SBOM components; verify)_");
    expect(md).toMatch(/Security update or other corrective measures made available:\*\* \*\*NEEDS INPUT\*\*/);
    expect(md).toContain("## Draft: user advisory (Art. 14(8))");
  });
});
