import { prisma } from "@/lib/db";

// GET /api/images/<id> -- serves an uploaded dashboard image. Public on
// the same "unguessable link" basis as the dashboards themselves (the
// id is a random cuid), so images also work in the weekly email.
// Images never change once uploaded, so browsers and the CDN can cache
// them for good. Retired (inactive) clients' images stop serving.
export async function GET(_request, { params }) {
  const image = await prisma.clientImage
    .findUnique({ where: { id: params.id }, include: { client: { select: { active: true } } } })
    .catch(() => null);
  if (!image || !image.client?.active) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(image.data, {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.bytes),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
