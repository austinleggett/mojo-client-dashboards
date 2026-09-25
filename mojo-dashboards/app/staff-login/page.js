import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STAFF_COOKIE, checkPassword, createSessionToken } from "@/lib/auth";

async function login(formData) {
  "use server";
  const password = formData.get("password");
  if (!checkPassword(password)) {
    redirect("/staff-login?error=1");
  }
  cookies().set(STAFF_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/admin");
}

export default function StaffLoginPage({ searchParams }) {
  const hasError = searchParams?.error === "1";
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-mark">🏔️</div>
        <h1>Mountain Mojo staff</h1>
        <p className="sub">Sign in to view and edit client dashboards.</p>
        {hasError && <div className="login-error">That password isn&apos;t right. Try again.</div>}
        <form action={login}>
          <input
            className="login-input"
            type="password"
            name="password"
            placeholder="Team password"
            autoFocus
            required
          />
          <button className="login-btn" type="submit">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
