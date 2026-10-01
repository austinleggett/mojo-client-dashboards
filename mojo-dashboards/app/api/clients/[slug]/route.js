import { NextResponse } from "next/server";
import { prisma, toSafeClient, toPublicClient, VIEW_FIELDS, isView } from "@/lib/db";
import { isAuthorizedRequest } from "@/lib/auth";
import { sanitizeContent } from "@/lib/sanitize";
import { withoutMeta } from "@/lib/drafts";

// GET is intentionally public -- this is what an automated caller
// (Claude, a script) reads before editing content via PUT, no token
// needed, on the same "you have the unguessable slug" basis as the
// dashboard link itself. It only ever returns the *published* tabs;
// drafts are included only for a signed-in staff member or an
// AUTOMATION_TOKEN caller. clientPassword never rides along either
// way (toSafeClient / toPublicClient strip it).
export async function GET(request, { params }) {
  const client = await prisma.client.findUnique({ where: { slug: params.slug } });
  if (!client || !client.active) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const payload = isAuthorizedRequest(request) ? toSafeClient(client) : toPublicClient(client);
  return NextResponse.json({ client: payload });
}

// Lowercase letters, digits, and single hyphens between words -- the
// same shape makeSlug() (lib/contentTemplate.js) generates.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// PUT (save edits) and DELETE require the staff cookie or an
// AUTOMATION_TOKEN bearer token.
//
// Body: { content?, view?, target?, accentColor?, clientPassword?, slug? }.
//
// - `content` with no `view` (or view "weekly", target "live") replaces
//   the published Weekly Update -- the original behavior, unchanged for
//   existing automation.
// - `view` ("weekly" | "monthly") and `target` ("live" | "draft") pick
//   which tab and which copy `content` is saved to. Saving to "draft"
//   creates the draft if there isn't one yet.
// - The shared `meta` block (client name, logo, contact...) is never
//   drafted: whatever `content.meta` is sent is always written to the
//   live weekly content, so branding/contact edits made from any tab
//   or mode land in one place.
//
// Every `content` is sanitized (lib/sanitize.js) on the way in.
export async function PUT(request, { params }) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const existing = await prisma.client.findUnique({ where: { slug: params.slug } });
  if (!existing) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const view = body.view === undefined ? "weekly" : body.view;
  const target = body.target === undefined ? "live" : body.target;
  if (!isView(view) || (target !== "live" && target !== "draft")) {
    return NextResponse.json({ error: "Unknown view or target." }, { status: 400 });
  }

  const data = {};
  if (body.content !== undefined) {
    if (typeof body.content !== "object" || body.content === null) {
      return NextResponse.json({ error: "Missing content." }, { status: 400 });
    }
    const clean = sanitizeContent(body.content);
    if (view === "weekly" && target === "live") {
      // Keep the existing meta if the caller didn't send one.
      data.content = clean.meta ? clean : { ...clean, meta: existing.content?.meta };
    } else {
      data[VIEW_FIELDS[view][target]] = withoutMeta(clean);
      if (clean.meta) data.content = { ...(existing.content || {}), meta: clean.meta };
    }
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
    const client = await prisma.client.update({ where: { slug: params.slug }, data });
    // `content` in the response stays the published weekly content, as
    // before; `saved` is the doc that was just written (meta merged in),
    // which is what the editor reloads from.
    const savedDoc = body.content === undefined ? null : client[VIEW_FIELDS[view][target]];
    const saved = savedDoc ? { ...savedDoc, meta: client.content?.meta } : null;
    return NextResponse.json({ client: toSafeClient(client), content: client.content, saved });
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
