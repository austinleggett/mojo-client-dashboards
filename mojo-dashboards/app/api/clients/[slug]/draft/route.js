import { NextResponse } from "next/server";
import { prisma, toSafeClient, VIEW_FIELDS, isView, DB_NULL } from "@/lib/db";
import { isAuthorizedRequest } from "@/lib/auth";
import { blankMonthlyContent } from "@/lib/contentTemplate";
import { withoutMeta } from "@/lib/drafts";

const KEEP_VERSIONS = 25;

// POST /api/clients/<slug>/draft -- staff (or AUTOMATION_TOKEN) only.
// Body: { view: "weekly" | "monthly", action, versionId? }
//
//   start    Open a draft: a copy of the published tab (or, for a
//            Monthly tab that doesn't exist yet, the monthly template).
//            The client keeps seeing the published version.
//   publish  Make the draft the published version. The version it
//            replaces is saved to ClientVersion first. Clears the draft.
//   discard  Throw the draft away. The published version is untouched.
//   restore  Put a saved backup (versionId) back as the published
//            version -- the current one is backed up first, so a
//            restore can itself be undone.
//
// Returns the client (drafts included) so the page can refresh in place.
export async function POST(request, { params }) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const { view, action } = body;
  if (!isView(view)) return NextResponse.json({ error: "Unknown view." }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { slug: params.slug } });
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const { live, draft } = VIEW_FIELDS[view];
  const data = {};

  // The weekly tab's published content carries the shared meta; when a
  // draft or backup replaces it, the *current* meta is kept, never
  // rolled back.
  const asLive = (doc) => (view === "weekly" ? { ...withoutMeta(doc), meta: client.content?.meta } : withoutMeta(doc));

  async function backup(note) {
    if (!client[live]) return;
    await prisma.clientVersion.create({
      data: { clientId: client.id, view, content: withoutMeta(client[live]), note },
    });
    const old = await prisma.clientVersion.findMany({
      where: { clientId: client.id, view },
      orderBy: { createdAt: "desc" },
      skip: KEEP_VERSIONS,
      select: { id: true },
    });
    if (old.length) await prisma.clientVersion.deleteMany({ where: { id: { in: old.map((v) => v.id) } } });
  }

  if (action === "start") {
    if (client[draft]) return NextResponse.json({ client: toSafeClient(client) });
    data[draft] = client[live] ? withoutMeta(client[live]) : view === "monthly" ? blankMonthlyContent() : null;
    if (!data[draft]) return NextResponse.json({ error: "Nothing to draft from." }, { status: 400 });
  } else if (action === "publish") {
    if (!client[draft]) return NextResponse.json({ error: "There's no draft to publish." }, { status: 400 });
    await backup(`Published version before ${new Date().toLocaleDateString("en-US")} publish`);
    data[live] = asLive(client[draft]);
    data[draft] = null;
  } else if (action === "discard") {
    data[draft] = null;
  } else if (action === "restore") {
    const version = await prisma.clientVersion.findFirst({
      where: { id: String(body.versionId || ""), clientId: client.id, view },
    });
    if (!version) return NextResponse.json({ error: "That backup no longer exists." }, { status: 404 });
    await backup("Published version before a restore");
    data[live] = asLive(version.content);
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  for (const k of Object.keys(data)) if (data[k] === null) data[k] = DB_NULL;

  const updated = await prisma.client.update({ where: { id: client.id }, data });
  return NextResponse.json({ client: toSafeClient(updated) });
}
