import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isStaffRequest, isClientAuthorized } from "@/lib/auth";
import { getPath, setPath } from "@/lib/path";

// A narrow, separate door for the client-facing approval widget (see
// ApprovalWidget in components/Dashboard.js) -- distinct from the
// staff/automation-only PUT on /api/clients/[slug], which accepts a
// whole new `content` blob. That's far too much trust to extend to a
// client-portal session: a client should only ever be able to set
// their own approval status and comment on a review or question item,
// never touch anything else on the page. So this route accepts one
// (path, value) write at a time and checks the path itself against an
// allowlist pattern before writing anything -- it's not just "check
// the caller is allowed," it's "check this exact field is one the
// caller is allowed to touch."
const ALLOWED_PATH = /^(review\.groups\.\d+\.items\.\d+|questions\.items\.\d+)\.(status|clientComment)$/;
const VALID_STATUS = new Set(["pending", "approved", "needs_edits"]);

export async function PUT(request, { params }) {
  const staff = isStaffRequest(request);
  if (!staff && !isClientAuthorized(params.slug)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const path = body.path;
  if (typeof path !== "string" || !ALLOWED_PATH.test(path)) {
    return NextResponse.json({ error: "That field can't be set this way." }, { status: 403 });
  }

  let value = body.value;
  if (path.endsWith(".status")) {
    if (!VALID_STATUS.has(value)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
  } else {
    // .clientComment -- plain text only. This never goes through
    // dangerouslySetInnerHTML on the page (see the ApprovalWidget
    // render), so it's rendered as ordinary React text, which escapes
    // it automatically; there's nothing to sanitize here, and running
    // it through the HTML sanitizer would be the same "escapes a plain
    // ampersand and then shows the escaped entity literally" bug
    // described in lib/sanitize.js.
    value = typeof value === "string" ? value.slice(0, 2000) : "";
  }

  const client = await prisma.client.findUnique({ where: { slug: params.slug } });
  if (!client) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Belt-and-suspenders: confirm the target actually exists in this
  // client's content before writing, so a stale/guessed index can't
  // silently create garbage structure via setPath's auto-vivification.
  const parentPath = path.slice(0, path.lastIndexOf("."));
  if (getPath(client.content, parentPath) == null) {
    return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });
  }

  const nextContent = setPath(client.content, path, value);
  const updated = await prisma.client.update({
    where: { slug: params.slug },
    data: { content: nextContent },
  });
  return NextResponse.json({ content: updated.content });
}
