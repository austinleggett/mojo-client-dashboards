import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedRequest } from "@/lib/auth";
import { blankContent, makeSlug } from "@/lib/contentTemplate";
import { sanitizeContent } from "@/lib/sanitize";

// GET /api/clients -- list, used by the admin dashboard. Staff cookie
// or an AUTOMATION_TOKEN bearer token both work (see lib/auth.js).
export async function GET(request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const clients = await prisma.client.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, name: true, active: true, accentColor: true, updatedAt: true },
  });
  return NextResponse.json({ clients });
}

// POST /api/clients -- create a client. Body: { name, accentColor?, content? }.
// `content` is optional and lets an automated caller create a client
// fully populated in one call instead of blank-then-edit; omit it to
// get the normal blank starting point.
export async function POST(request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  }

  let slug = makeSlug(name);
  // Vanishingly unlikely to collide, but guard anyway.
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.client.findUnique({ where: { slug } });
    if (!existing) break;
    slug = makeSlug(name);
  }

  const client = await prisma.client.create({
    data: {
      slug,
      name,
      accentColor: body.accentColor || "#1f4d3a",
      content: sanitizeContent(
        body.content && typeof body.content === "object" ? body.content : blankContent(name)
      ),
    },
  });

  return NextResponse.json({ client }, { status: 201 });
}
