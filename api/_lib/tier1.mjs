/**
 * The passive report: only what a browser loads anyway. Today the first
 * response (transport, headers, cookies, disclosure, graded in grade.mjs).
 * Agent B extends it with the page, its scripts, DNS and security.txt.
 */
import { parseTarget, fetchHeaders, CheckError } from "./guard.mjs";
import { grade } from "./grade.mjs";

/** @param {URL} target  @param {{typed?: string}} opts */
export async function passiveReport(target, opts = {}) {
  let result;
  try {
    result = await fetchHeaders(target, opts);
  } catch (e) {
    // "example.com" with no https at all: look at what http serves instead.
    const bare = !/^https?:\/\//i.test(String(opts.typed ?? "").trim());
    if (!bare || !(e instanceof CheckError) || !["unreachable", "tls_invalid"].includes(e.code)) throw e;
    result = await fetchHeaders(parseTarget(`http://${target.host}${target.pathname}`, opts), opts);
  }
  return { tier: "passive", ...grade(result, opts) };
}
