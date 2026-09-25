import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isStaffRequest } from "@/lib/auth";
import { blankContent, makeSlug } from "@/lib/contentTemplate";

// GET /api/clients -- staff-only list, used by the admin dashboard.
export async function GET(request) {
  if (!isStaffRequest(request)) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const clients = await prisma.client.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, name: true, active: true, accentColor: true, updatedAt: true },
  });
  return NextResponse.json({ clients });
}

// POST /api/clients -- staff-only create. Body: { name, accentColor? }
export async function POST(request) {
  if (!isStaffRequest(request)) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
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
      content: blankContent(name),
    },
  });

  return NextResponse.json({ client }, { status: 201 });
}
