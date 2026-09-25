import { redirect } from "next/navigation";
import { isStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { blankContent, makeSlug } from "@/lib/contentTemplate";

async function createClient(formData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  const accentColor = String(formData.get("accentColor") || "#1f4d3a").trim();
  if (!name) redirect("/admin/new?error=1");

  let slug = makeSlug(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.client.findUnique({ where: { slug } });
    if (!existing) break;
    slug = makeSlug(name);
  }

  const client = await prisma.client.create({
    data: { slug, name, accentColor, content: blankContent(name) },
  });

  redirect(`/c/${client.slug}`);
}

export default function NewClientPage({ searchParams }) {
  const hasError = searchParams?.error === "1";
  return (
    <div className="admin-shell">
      <div className="admin-top">
        <div>
          <h1>New client</h1>
          <p>Creates an empty dashboard with a private link you can send once it&apos;s filled in.</p>
        </div>
        <a href="/admin" className="btn btn-ghost">
          Cancel
        </a>
      </div>

      <div className="new-client-card">
        {hasError && <div className="login-error">Enter a client name.</div>}
        <form action={createClient}>
          <label className="field-label" htmlFor="name">
            Client name
          </label>
          <input className="field-input" id="name" name="name" placeholder="e.g. Timberline Ace Hardware" autoFocus required />

          <label className="field-label" htmlFor="accentColor">
            Accent color (optional)
          </label>
          <input className="field-input" id="accentColor" name="accentColor" type="text" placeholder="#1f4d3a" defaultValue="#1f4d3a" />

          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
            Create dashboard
          </button>
        </form>
      </div>
    </div>
  );
}
