import { prisma } from "@/lib/db";
import { isStaff } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic"; // always read fresh content, never cache someone else's edits

export async function generateMetadata({ params }) {
  const client = await prisma.client.findUnique({ where: { slug: params.slug } });
  return { title: client ? `${client.name} · Mountain Mojo Dashboard` : "Dashboard not found" };
}

export default async function ClientDashboardPage({ params }) {
  const client = await prisma.client.findUnique({ where: { slug: params.slug } });
  const staff = isStaff();

  if (!client || (!client.active && !staff)) {
    return (
      <div className="not-found-shell">
        <h1>Dashboard not found</h1>
        <p>This link may have been retired. Check with your Mountain Mojo contact for the current one.</p>
      </div>
    );
  }

  return (
    <>
      {staff && (
        <div className="staff-bar">
          Staff view — you can edit this page. <a href="/admin">All clients</a>
        </div>
      )}
      <Dashboard client={client} isStaff={staff} />
    </>
  );
}
