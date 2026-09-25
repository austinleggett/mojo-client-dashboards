import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedRequest } from "@/lib/auth";
import { sanitizeContent } from "@/lib/sanitize";

// GET is intentionally public -- this is what the client's private
// dashboard link reads. Access control is "you have the unguessable
// slug," not a login, per how the dashboards are meant to be shared.
// (An automated caller wanting to read current content before editing
// it can just use this same GET -- no token needed for reads.)
export async function GET(_request, { params }) {
  const client = await prisma.client.findUnique({ where: { slug: params.slug } });
  if (!client || !client.active) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ client });
}

// PUT (save edits) and DELETE require the staff cookie or an
// AUTOMATION_TOKEN bearer token.
//
// Body: { content, accentColor? }. `content` is sanitized here (the
// handful of rich-text fields get run through sanitize-html; every
// other field passes through untouched -- see lib/sanitize.js) so a
// malicious or malformed edit can never persist as live HTML on the
// public dashboard link, regardless of which door it came through.
export async function PUT(request, { params }) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  if (!body.content || typeof body.content !== "object") {
    return NextResponse.json({ error: "Missing content." }, { status: 400 });
  }

  const data = { content: sanitizeContent(body.content) };
  if (typeof body.accentColor === "string" && body.accentColor.trim()) {
    data.accentColor = body.accentColor.trim();
  }

  try {
    const client = await prisma.client.update({
      where: { slug: params.slug },
      data,
    });
    return NextResponse.json({ client, content: client.content });
  } catch {
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
