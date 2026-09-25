// Server-side HTML sanitization for the "rich text" fields the
// dashboard stores as sanitized HTML (bold/italic/underline, alignment,
// font size) instead of plain text. Virtually every user-facing text
// field in `content` is rich now -- the only ones deliberately left
// plain are every section's menu label (nav.* for a built-in section,
// customSections.*.label for a user-added one -- both rendered via
// plain textContent in the sidebar so a rename doesn't need
// formatting), plus structural, non-prose fields that were never
// editable text in the first place: meta.clientLogo (an image data:
// URI), meta.updatedAt (an auto-set date), and sectionOrder (an array
// of section ids). Those are safe to leave out of RICH_TEXT_PATTERNS
// precisely because Dashboard.js never renders them with
// dangerouslySetInnerHTML -- sanitizing a field here that's rendered as
// plain text elsewhere is what would mangle plain characters (e.g.
// turning "R&D" into "R&amp;D" and showing the escaped entity
// literally).
//
// Keep RICH_TEXT_PATTERNS in sync with wherever components/Dashboard.js
// renders a field with the RichEditable component instead of Editable.
import sanitizeHtml from "sanitize-html";

export const RICH_TEXT_PATTERNS = [
  "meta.clientName",
  "meta.tagline",
  "meta.contactName",
  "meta.contactTitle",
  "meta.contactEmail",
  "meta.contactPhone",
  "meta.footerNote",
  "recap.eyebrow",
  "recap.heading",
  "recap.note",
  "recap.stats.*.label",
  "recap.stats.*.value",
  "recap.stats.*.sub",
  "recap.footnote.*",
  "momentum.items.*.month",
  "momentum.items.*.text",
  "stores.items.*.name",
  "stores.items.*.text",
  "review.groups.*.label",
  "review.groups.*.items.*.title",
  "review.groups.*.items.*.store",
  "review.groups.*.items.*.desc",
  "questions.items.*.store",
  "questions.items.*.title",
  "questions.items.*.excerpt",
  "questions.items.*.response",
  "working.columns.*.label",
  "working.columns.*.items.*",
  "approved.items.*",
  "events.items.*.day",
  "events.items.*.mon",
  "events.items.*.title",
  "events.items.*.loc",
  "meetings.items.*.name",
  "meetings.items.*.freq",
  "meetings.items.*.next",
  "customSections.*.heading",
  "customSections.*.note",
  "customSections.*.items.*.text",
];

export function isRichTextPath(path) {
  const segs = path.split(".");
  return RICH_TEXT_PATTERNS.some((pattern) => {
    const pSegs = pattern.split(".");
    if (pSegs.length !== segs.length) return false;
    return pSegs.every((p, i) => p === "*" || p === segs[i]);
  });
}

const ALLOWED_STYLES = {
  "font-weight": [/^bold$/, /^[3-9]00$/],
  "font-style": [/^italic$/],
  "text-decoration": [/^underline$/, /^none$/],
  "text-align": [/^(left|center|right|justify)$/],
  "font-size": [/^\d{1,3}(\.\d+)?(px|em|rem|%)$/],
};

export function sanitizeRichText(html) {
  if (typeof html !== "string") return html;
  return sanitizeHtml(html, {
    allowedTags: ["b", "strong", "i", "em", "u", "span", "div", "br"],
    allowedAttributes: { span: ["style"], div: ["style"] },
    allowedStyles: { "*": ALLOWED_STYLES },
  });
}

// Walks the whole content tree and sanitizes only the string values at
// RICH_TEXT_PATTERNS paths; every other value (including non-rich
// strings like names, dates, or a client logo data: URI) passes
// through unchanged.
export function sanitizeContent(node, prefix = "") {
  if (Array.isArray(node)) {
    return node.map((v, i) => sanitizeContent(v, prefix ? `${prefix}.${i}` : String(i)));
  }
  if (node && typeof node === "object") {
    const out = {};
    for (const k of Object.keys(node)) {
      out[k] = sanitizeContent(node[k], prefix ? `${prefix}.${k}` : k);
    }
    return out;
  }
  if (typeof node === "string" && isRichTextPath(prefix)) {
    return sanitizeRichText(node);
  }
  return node;
}
