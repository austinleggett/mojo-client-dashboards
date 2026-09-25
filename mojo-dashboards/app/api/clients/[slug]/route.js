import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isStaffRequest } from "@/lib/auth";

// GET is intentionally public -- this is what the client's private
// dashboard link reads. Access control is "you have the unguessable
// slug," not a login, per how the dashboards are meant to be shared.
export async function GET(_request, { params }) {
  const client = await prisma.client.findUnique({ where: { slug: params.slug } });
  if (!client || !client.active) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ client });
}

// PUT (save edits) and DELETE are staff-only.
export async function PUT(request, { params }) {
  if (!isStaffRequest(request)) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  if (!body.content || typeof body.content !== "object") {
    return NextResponse.json({ error: "Missing content." }, { status: 400 });
  }

  try {
    const client = await prisma.client.update({
      where: { slug: params.slug },
      data: { content: body.content },
    });
    return NextResponse.json({ client, content: client.content });
  } catch {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
}

export async function DELETE(request, { params }) {
  if (!isStaffRequest(request)) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  try {
    await prisma.client.delete({ where: { slug: params.slug } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
}
