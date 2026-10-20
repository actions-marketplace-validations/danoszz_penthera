/**
 * One escape for untrusted text placed inline in Markdown (table cells, list
 * items). Finding titles, evidence and questionnaire text come from scanned
 * targets or pasted files, so they must not break the table, inject HTML, or
 * smuggle a backslash that un-escapes our own `\|`. Backslash goes first so the
 * escapes added after it are not themselves doubled.
 */
export function mdInline(s) {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\r?\n|\r/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|");
}

/**
 * A Markdown table cell for our own CI reports (text we wrote, not scanned
 * input): backslashes first, then pipes, newlines folded to a space.
 */
export function mdCell(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n|\r/g, " ");
}
