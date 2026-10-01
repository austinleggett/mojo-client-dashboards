import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedRequest } from "@/lib/auth";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/images";

// POST /api/clients/<slug>/images -- staff (or AUTOMATION_TOKEN) only.
// Body: { dataUrl: "data:image/png;base64,..." } (the browser resizes
// images before sending; see lib/images.js). Returns { id, url } --
// put `url` in content (inline <img> or a card's image.src).
export async function POST(request, { params }) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const client = await prisma.client.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(body.dataUrl || ""));
  if (!m || !ALLOWED_IMAGE_TYPES.includes(m[1].toLowerCase())) {
    return NextResponse.json({ error: "Use a PNG, JPG, WebP or GIF image." }, { status: 400 });
  }
  const data = Buffer.from(m[2], "base64");
  if (!data.length || data.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "That image is too large (3 MB max after resizing)." }, { status: 413 });
  }
  const image = await prisma.clientImage.create({
    data: { clientId: client.id, mime: m[1].toLowerCase(), data, bytes: data.length },
    select: { id: true },
  });
  return NextResponse.json({ id: image.id, url: `/api/images/${image.id}` }, { status: 201 });
}
