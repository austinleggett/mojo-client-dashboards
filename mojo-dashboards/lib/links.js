// Shared link helpers -- used by the dashboard in the browser (auto-
// linking, the toolbar's link/button inserts, card buttons) and by the
// server-side sanitizer (lib/sanitize.js), so "what counts as a safe
// link" is defined in exactly one place.
//
// Only four kinds of link are ever allowed: http, https, mailto and
// tel. Anything else (javascript:, data:, a relative path...) is
// rejected outright, never "cleaned up," because a link's href is the
// one place a stored dashboard edit could otherwise run code in a
// viewer's browser.

export const LINK_CLASS = "rt-link";
export const CTA_CLASS = "cta-btn";

const ALLOWED_SCHEME = /^(https?:\/\/|mailto:|tel:)/i;
const EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
const PHONE = /^\+?[\d\s().-]{7,20}$/;
const BARE_DOMAIN = /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}(:\d+)?([/?#][^\s]*)?$/i;

// Turns whatever a person typed into a link field into a safe href, or
// returns null if it isn't one. Forgiving about the common shorthands
// people actually type: "kenkilday.com" becomes https://kenkilday.com,
// "ken@kenkilday.com" becomes mailto:, "480-815-2000" becomes tel:.
export function safeUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 2000) return null;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch {
      return null;
    }
  }
  if (/^mailto:/i.test(s)) {
    const addr = s.slice(7).split("?")[0];
    return EMAIL.test(addr) ? `mailto:${addr}` : null;
  }
  if (/^tel:/i.test(s)) {
    const num = s.slice(4);
    return PHONE.test(num) ? `tel:${num.replace(/[^\d+]/g, "")}` : null;
  }
  // Any other scheme (javascript:, data:, ftp:...) is refused.
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !BARE_DOMAIN.test(s)) return null;
  if (EMAIL.test(s)) return `mailto:${s}`;
  if (PHONE.test(s) && (s.match(/\d/g) || []).length >= 10) return `tel:${s.replace(/[^\d+]/g, "")}`;
  if (/\s/.test(s)) return null;
  if (BARE_DOMAIN.test(s)) {
    try {
      return new URL(`https://${s}`).href;
    } catch {
      return null;
    }
  }
  return null;
}

// What auto-linking looks for inside ordinary text. Order matters:
// emails before bare domains (so "ken@kenkilday.com" isn't split into
// "ken@" + a kenkilday.com link), and phone numbers last and strict
// (exactly a 10-digit North American shape) so dates, money and stat
// numbers like "28,669" are never mistaken for one.
const TRAILING = "[^\\s<>\"'.,;:!?)\\]]";
const AUTO_LINK = new RegExp(
  [
    "([\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+)", // 1: email
    `((?:https?:\\/\\/|www\\.)[^\\s<>"']*${TRAILING})`, // 2: explicit URL
    `((?:[a-z0-9-]+\\.)+(?:com|org|net|io|co|us|ai|app|biz|info|me|edu|gov|ly|tv|link|page|site|dev)(?:\\/[^\\s<>"']*${TRAILING}|\\/)?)(?![\\w@-])`, // 3: bare domain
    "((?:\\+?1[\\s.-]?)?\\(?\\d{3}\\)?[\\s.-]\\d{3}[\\s.-]\\d{4})(?!\\d)", // 4: phone
  ].join("|"),
  "gi"
);

// Finds every auto-linkable span in a plain string. Returns
// [{ start, end, text, href }] in order.
export function findLinks(text) {
  const out = [];
  if (!text) return out;
  AUTO_LINK.lastIndex = 0;
  let m;
  while ((m = AUTO_LINK.exec(text))) {
    const raw = m[0];
    // Don't link the domain half of something like "name@site.com" that
    // the email branch somehow missed, or a word glued to a preceding @.
    if (m.index > 0 && text[m.index - 1] === "@") continue;
    const href = safeUrl(raw);
    if (href) out.push({ start: m.index, end: m.index + raw.length, text: raw, href });
  }
  return out;
}

export function linkAttrs(href) {
  const external = /^https?:/i.test(href);
  return external ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

// Browser-only: walks a rendered field's DOM and wraps any bare URL,
// email or phone number in its text in a link -- skipping text that's
// already inside a link (or a CTA button). Returns true if it changed
// anything, so callers know whether there's new HTML to save.
export function linkifyNode(root) {
  if (!root || typeof document === "undefined") return false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      return n.parentElement && n.parentElement.closest("a") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  let changed = false;
  for (const node of textNodes) {
    const matches = findLinks(node.nodeValue);
    if (!matches.length) continue;
    changed = true;
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const { start, end, text, href } of matches) {
      if (start > pos) frag.appendChild(document.createTextNode(node.nodeValue.slice(pos, start)));
      frag.appendChild(makeLink(href, text, LINK_CLASS));
      pos = end;
    }
    if (pos < node.nodeValue.length) frag.appendChild(document.createTextNode(node.nodeValue.slice(pos)));
    node.parentNode.replaceChild(frag, node);
  }
  return changed;
}

export function makeLink(href, text, className) {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  a.className = className;
  const attrs = linkAttrs(href);
  Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v));
  a.textContent = text;
  return a;
}

// A short, human label for a link -- "kenkilday.com/pricing" rather
// than the full https://... -- used when someone inserts a link without
// any text of its own.
export function displayUrl(href) {
  return String(href || "")
    .replace(/^mailto:/i, "")
    .replace(/^tel:/i, "")
    .replace(/^https?:\/\/(www\.)?/i, "")
    .replace(/\/$/, "");
}
