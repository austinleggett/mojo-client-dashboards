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
import { safeUrl, linkAttrs, LINK_CLASS, CTA_CLASS } from "./links.js";

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
  "headings.*.eyebrow",
  "headings.*.heading",
  "headings.*.events",
  "headings.*.meetings",
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
  // Hex only -- matches exactly what FormatToolbar's preset swatches
  // write (see components/FormatToolbar.js), never an arbitrary
  // css value.
  color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
  // Same idea, for the top format bar's background-color picker --
  // plus "transparent", which is what clearing a background writes.
  "background-color": [/^#[0-9a-f]{3,8}$/i, /^transparent$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
};

export function sanitizeRichText(html) {
  if (typeof html !== "string") return html;
  return sanitizeHtml(html, {
    allowedTags: ["b", "strong", "i", "em", "u", "span", "div", "br", "a"],
    allowedAttributes: { span: ["style"], div: ["style"], a: ["href", "class", "target", "rel", "style"] },
    allowedStyles: { "*": ALLOWED_STYLES },
    // Links: only http(s)/mailto/tel ever survive, only our two link
    // styles (an inline text link or a call-to-action button), and an
    // external link always opens in a new tab with rel=noopener -- set
    // here on the server regardless of what the browser sent, so it
    // can't be skipped by editing through the API directly. An <a>
    // whose href isn't a safe link is unwrapped to plain text.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    allowedClasses: { a: [LINK_CLASS, CTA_CLASS] },
    transformTags: {
      a: (tagName, attribs) => {
        const href = safeUrl(attribs.href);
        if (!href) return { tagName: "span", attribs: {} };
        const cls = (attribs.class || "").split(/\s+/).includes(CTA_CLASS) ? CTA_CLASS : LINK_CLASS;
        const out = { href, class: cls, ...linkAttrs(href) };
        // A button can carry its own brand color (background + text,
        // hex only -- enforced by allowedStyles below).
        if (cls === CTA_CLASS && attribs.style) out.style = attribs.style;
        return { tagName: "a", attribs: out };
      },
    },
  });
}

// A card's optional button (content.<...>.link = { label, url }) --
// plain text label, href validated the same way as an inline link. An
// unsafe or empty url clears the button rather than storing it.
function sanitizeCardLink(link) {
  if (!link || typeof link !== "object") return undefined;
  const url = safeUrl(link.url);
  if (!url) return undefined;
  const out = { label: String(link.label ?? "").slice(0, 120), url };
  if (/^#[0-9a-f]{6}$/i.test(String(link.color || ""))) out.color = link.color;
  return out;
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
      if (k === "link" && prefix) {
        const link = sanitizeCardLink(node[k]);
        if (link) out[k] = link;
        continue;
      }
      out[k] = sanitizeContent(node[k], prefix ? `${prefix}.${k}` : k);
    }
    return out;
  }
  if (typeof node === "string" && isRichTextPath(prefix)) {
    return sanitizeRichText(node);
  }
  return node;
}
