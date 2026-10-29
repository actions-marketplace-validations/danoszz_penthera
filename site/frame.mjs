/**
 * Pieces every generated page shares: the JSON-LD data block and the footer
 * line. The footer links the blog only once a post is approved, so no page
 * links an empty /blog.
 */

/** A JSON-LD data block; "<" escaped so no value can close the element. */
export const ldScript = (graph) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;

/** The footer of the landing, benchmark and blog pages. */
export const siteFoot = ({ blog = false } = {}) => `<p class="land-foot"><a href="/">penthera.org</a> · <a href="/benchmarks">Benchmarks</a> · <a href="/research">Research</a>${blog ? ' · <a href="/blog">Blog</a>' : ""} · <a href="/website-security-check">Live check</a> · <a href="/terms">Terms</a> · <a href="/trust">Trust</a> · <a href="https://github.com/danoszz/penthera">Source</a> · MIT license</p>`;
