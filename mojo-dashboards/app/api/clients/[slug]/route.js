import { NextResponse } from "next/server";
import { prisma, toSafeClient } from "@/lib/db";
import { isAuthorizedRequest } from "@/lib/auth";
import { sanitizeContent } from "@/lib/sanitize";

// GET is intentionally public -- this is what an automated caller
// (Claude, a script) reads before editing content via PUT, no token
// needed. It predates the client portal login and its access model is
// unchanged by that: this always returns content, on the same
// "you have the unguessable slug" basis as the dashboard link itself.
// What must never happen, portal login or not, is clientPassword
// riding along in this public response -- toSafeClient strips it.
export async function GET(_request, { params }) {
  const client = await prisma.client.findUnique({ where: { slug: params.slug } });
  if (!client || !client.active) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ client: toSafeClient(client) });
}

// Lowercase letters, digits, and single hyphens between words -- the
// same shape makeSlug() (lib/contentTemplate.js) generates, just
// enforced here too now that a person can type one by hand instead of
// only ever getting a randomly-generated one.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// PUT (save edits) and DELETE require the staff cookie or an
// AUTOMATION_TOKEN bearer token.
//
// Body: { content?, accentColor?, clientPassword?, slug? }. All
// optional individually -- a caller can send just one field it wants
// to change (e.g. the admin page's URL editor sends only `slug`)
// without having to resend the whole page. `content` is sanitized
// here (the handful of rich-text fields get run through sanitize-html;
// every other field passes through untouched -- see lib/sanitize.js)
// so a malicious or malformed edit can never persist as live HTML on
// the public dashboard link, regardless of which door it came through.
// `clientPassword` sets or changes the client portal's password (empty
// string clears it, turning the portal login back off); omit it
// entirely to leave the current password untouched. `slug` renames the
// dashboard's own URL (/c/<slug>) -- doing this immediately breaks any
// link using the old slug, including one already sent to the client,
// so this is a deliberate rename, not a redirect-and-keep-the-old-one.
export async function PUT(request, { params }) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));

  const data = {};
  if (body.content !== undefined) {
    if (typeof body.content !== "object" || body.content === null) {
      return NextResponse.json({ error: "Missing content." }, { status: 400 });
    }
    data.content = sanitizeContent(body.content);
  }
  if (typeof body.accentColor === "string" && body.accentColor.trim()) {
    data.accentColor = body.accentColor.trim();
  }
  if (typeof body.clientPassword === "string") {
    data.clientPassword = body.clientPassword.trim() || null;
  }
  if (typeof body.slug === "string") {
    const nextSlug = body.slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(nextSlug) || nextSlug.length > 64) {
      return NextResponse.json(
        { error: "URLs can only use lowercase letters, numbers, and single hyphens between words (like timberline-ace)." },
        { status: 400 }
      );
    }
    data.slug = nextSlug;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  try {
    const client = await prisma.client.update({
      where: { slug: params.slug },
      data,
    });
    return NextResponse.json({ client: toSafeClient(client), content: client.content });
  } catch (err) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "That URL is already taken by another client." }, { status: 409 });
    }
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
}

export async function DELETE(request, { params }) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    await prisma.client.delete({ where: { slug: params.slug } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
}
