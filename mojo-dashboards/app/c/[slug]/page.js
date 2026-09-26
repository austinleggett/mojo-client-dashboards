import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma, toSafeClient } from "@/lib/db";
import {
  isStaff,
  isClientAuthorized,
  checkClientPassword,
  createClientSessionToken,
  clientCookieName,
} from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic"; // always read fresh content, never cache someone else's edits

export async function generateMetadata({ params }) {
  const client = await prisma.client.findUnique({ where: { slug: params.slug } });
  return { title: client ? `${client.name} · Mountain Mojo Dashboard` : "Dashboard not found" };
}

export default async function ClientDashboardPage({ params, searchParams }) {
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

  // Staff always gets straight through (they're the ones who'd set or
  // reset this password in the first place). Otherwise, if a portal
  // password is set for this client and the browser doesn't already
  // hold a valid, slug-matched session cookie for it, show the login
  // gate instead of the dashboard.
  const clientAuthed = staff || isClientAuthorized(params.slug);
  if (client.clientPassword && !clientAuthed) {
    async function login(formData) {
      "use server";
      const password = formData.get("password");
      const record = await prisma.client.findUnique({ where: { slug: params.slug } });
      if (!record || !checkClientPassword(record.clientPassword, password)) {
        redirect(`/c/${params.slug}?error=1`);
      }
      cookies().set(clientCookieName(params.slug), createClientSessionToken(params.slug), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      redirect(`/c/${params.slug}`);
    }

    const hasError = searchParams?.error === "1";
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mojo-logo.png" alt="" width={28} height={28} />
          </div>
          <h1>{client.name}</h1>
          <p className="sub">Enter your portal password to view your dashboard.</p>
          {hasError && <div className="login-error">That password isn&apos;t right. Try again.</div>}
          <form action={login}>
            <input
              className="login-input"
              type="password"
              name="password"
              placeholder="Portal password"
              autoFocus
              required
            />
            <button className="login-btn" type="submit">
              View my dashboard
            </button>
          </form>
        </div>
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
      <Dashboard client={toSafeClient(client)} isStaff={staff} canRespond={clientAuthed} />
    </>
  );
}
