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

// PUT (save edits) and DELETE require the staff cookie or an
// AUTOMATION_TOKEN bearer token.
//
// Body: { content, accentColor?, clientPassword? }. `content` is
// sanitized here (the handful of rich-text fields get run through
// sanitize-html; every other field passes through untouched -- see
// lib/sanitize.js) so a malicious or malformed edit can never persist
// as live HTML on the public dashboard link, regardless of which door
// it came through. `clientPassword` sets or changes the client
// portal's password (empty string clears it, turning the portal login
// back off); omit it entirely to leave the current password untouched.
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
  if (typeof body.clientPassword === "string") {
    data.clientPassword = body.clientPassword.trim() || null;
  }

  try {
    const client = await prisma.client.update({
      where: { slug: params.slug },
      data,
    });
    return NextResponse.json({ client: toSafeClient(client), content: client.content });
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
