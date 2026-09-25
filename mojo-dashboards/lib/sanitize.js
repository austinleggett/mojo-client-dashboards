// Server-side HTML sanitization for the handful of "rich text" fields
// that the dashboard stores as sanitized HTML (bold/italic/underline,
// alignment, font size) instead of plain text. Every other field in
// `content` is plain text rendered without dangerouslySetInnerHTML, so
// it's left completely untouched here -- there's nothing to sanitize,
// and running it through an HTML sanitizer would risk mangling plain
// characters (e.g. turning "R&D" into "R&amp;D").
//
// Keep RICH_TEXT_PATTERNS in sync with wherever components/Dashboard.js
// renders a field with the RichEditable component instead of Editable.
import sanitizeHtml from "sanitize-html";

export const RICH_TEXT_PATTERNS = [
  "meta.tagline",
  "meta.footerNote",
  "recap.note",
  "momentum.items.*.text",
  "stores.items.*.text",
  "review.groups.*.items.*.desc",
  "questions.items.*.excerpt",
  "questions.items.*.response",
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
