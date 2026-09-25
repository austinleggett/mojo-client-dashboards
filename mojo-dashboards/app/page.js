import { redirect } from "next/navigation";
import { isStaff } from "@/lib/auth";

// Root route has nothing to show on its own -- staff go to the client
// list, everyone else goes to the login page (there's no public
// "index"; clients only ever land on their own /c/[slug] link).
export default function RootPage() {
  redirect(isStaff() ? "/admin" : "/staff-login");
}
