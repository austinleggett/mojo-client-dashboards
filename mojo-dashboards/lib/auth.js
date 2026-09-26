// Minimal staff-only session, no accounts system: everyone on the team
// shares one password (set as STAFF_PASSWORD). Logging in sets a signed,
// httpOnly cookie; nothing else can forge it without SESSION_SECRET.
//
// Deliberately Node-only (uses node:crypto) rather than Edge-compatible --
// that keeps the signing code simple and correct. All the places that
// check it (Server Components, Route Handlers) run on the Node runtime
// by default in Next.js, so this is never loaded from middleware/edge.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const STAFF_COOKIE = "mojo_staff";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set. Add it to your environment variables.");
  return s;
}

function sign(payload) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createSessionToken() {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `exp:${exp}`;
  const sig = sign(payload);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function isValidSessionToken(token) {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const dot = decoded.lastIndexOf(".");
    if (dot < 0) return false;
    const payload = decoded.slice(0, dot);
    const sig = decoded.slice(dot + 1);
    const expected = sign(payload);
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const m = /^exp:(\d+)$/.exec(payload);
    if (!m) return false;
    return Number(m[1]) > Date.now();
  } catch {
    return false;
  }
}

export function checkPassword(candidate) {
  const expected = process.env.STAFF_PASSWORD;
  if (!expected) throw new Error("STAFF_PASSWORD is not set. Add it to your environment variables.");
  const a = Buffer.from(String(candidate || ""));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// For Server Components / plain server code: read-only cookie check.
export function isStaff() {
  const token = cookies().get(STAFF_COOKIE)?.value;
  return isValidSessionToken(token);
}

// For Route Handlers: pull the cookie off a NextRequest.
export function isStaffRequest(request) {
  const token = request.cookies.get(STAFF_COOKIE)?.value;
  return isValidSessionToken(token);
}

// A second, separate door into the write endpoints for automated
// callers (Claude, a script) that aren't signing in through a browser
// -- so they never need STAFF_PASSWORD or a session cookie. Checked
// via `Authorization: Bearer <AUTOMATION_TOKEN>`. Deliberately its own
// secret, not reused from SESSION_SECRET or STAFF_PASSWORD, so it can
// be rotated on its own without logging your team out.
export function isAutomationRequest(request) {
  const expected = process.env.AUTOMATION_TOKEN;
  if (!expected) return false; // unset = this door is closed, not "anything goes"
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  const a = Buffer.from(match[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// True if the request is allowed to make write calls, whichever door
// it came through.
export function isAuthorizedRequest(request) {
  return isStaffRequest(request) || isAutomationRequest(request);
}

// ---------------------------------------------------------------
// Client portal session -- a second, separate kind of session from
// staff's. Unlike STAFF_PASSWORD (one password for the whole team),
// each client has their own password (Client.clientPassword, set by
// staff in edit mode) and its own cookie, so being logged into one
// client's portal never grants access to another's. The signed
// payload includes the slug it was issued for, and every check
// verifies the cookie's slug matches the page being requested --
// without that, a client could log into their own portal, copy the
// cookie value, and use it on someone else's link.
const CLIENT_COOKIE_PREFIX = "mojo_client_";

// Cookie names can't contain most punctuation, so drop anything that
// isn't alphanumeric/hyphen -- slugs are already generated this way
// (see makeSlug in lib/contentTemplate.js) but this keeps the cookie
// name well-formed even if that ever changes.
export function clientCookieName(slug) {
  return `${CLIENT_COOKIE_PREFIX}${String(slug).replace(/[^a-zA-Z0-9-]/g, "")}`;
}

export function createClientSessionToken(slug) {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `slug:${slug}|exp:${exp}`;
  const sig = sign(payload);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

function isValidClientSessionToken(token, slug) {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const dot = decoded.lastIndexOf(".");
    if (dot < 0) return false;
    const payload = decoded.slice(0, dot);
    const sig = decoded.slice(dot + 1);
    const expected = sign(payload);
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const m = /^slug:(.*)\|exp:(\d+)$/.exec(payload);
    if (!m) return false;
    if (m[1] !== slug) return false; // signed for a different client -- reject
    return Number(m[2]) > Date.now();
  } catch {
    return false;
  }
}

// For Server Components: read-only cookie check, scoped to one slug.
export function isClientAuthorized(slug) {
  const token = cookies().get(clientCookieName(slug))?.value;
  return isValidClientSessionToken(token, slug);
}

// Compares a submitted password against the client's stored one.
// `stored` null/empty (portal not set up for this client yet) always
// fails closed rather than treating "no password set" as "any password
// works."
export function checkClientPassword(stored, candidate) {
  if (!stored) return false;
  const a = Buffer.from(String(candidate || ""));
  const b = Buffer.from(String(stored));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
