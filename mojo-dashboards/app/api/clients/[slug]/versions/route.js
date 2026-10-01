import { NextResponse } from "next/server";
import { prisma, isView } from "@/lib/db";
import { isAuthorizedRequest } from "@/lib/auth";

// GET /api/clients/<slug>/versions?view=weekly|monthly -- staff only.
// The saved backups of a tab's published version, newest first (the
// content itself isn't included; restore goes through ../draft).
export async function GET(request, { params }) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const view = request.nextUrl.searchParams.get("view");
  if (!isView(view)) return NextResponse.json({ error: "Unknown view." }, { status: 400 });
  const client = await prisma.client.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const versions = await prisma.clientVersion.findMany({
    where: { clientId: client.id, view },
    orderBy: { createdAt: "desc" },
    select: { id: true, note: true, createdAt: true },
  });
  return NextResponse.json({ versions });
}
