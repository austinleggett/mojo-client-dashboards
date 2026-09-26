import { redirect } from "next/navigation";
import { isStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SlugEditor from "@/components/SlugEditor";

export default async function AdminPage() {
  if (!isStaff()) redirect("/staff-login");

  const clients = await prisma.client.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="admin-shell">
      <div className="admin-top">
        <div>
          <h1>Client Dashboards</h1>
          <p>{clients.length} client{clients.length === 1 ? "" : "s"} · private links, click-to-edit</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <form action="/api/logout" method="post">
            <button type="submit" className="btn btn-ghost">
              Sign out
            </button>
          </form>
          <a href="/admin/new" className="btn btn-primary">
            + New client
          </a>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="empty-state">No clients yet. Create the first one to get a dashboard link.</div>
      ) : (
        <div className="client-list">
          {clients.map((c) => (
            <div className="client-row" key={c.id}>
              <div className="client-row-main">
                <span className="client-dot" style={{ background: c.active ? c.accentColor || "#1f4d3a" : "#b5432f" }} />
                <div>
                  <div className="client-name-lg">{c.name}</div>
                  <div className="client-meta">
                    <SlugEditor slug={c.slug} />
                    {" · updated "}
                    {new Date(c.updatedAt).toLocaleDateString()}
                    {!c.active ? " · inactive" : ""}
                  </div>
                </div>
              </div>
              <a href={`/c/${c.slug}`} className="client-row-actions">
                Open &rarr;
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
