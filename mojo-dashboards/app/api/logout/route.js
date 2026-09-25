import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { STAFF_COOKIE } from "@/lib/auth";

export async function POST(request) {
  cookies().delete(STAFF_COOKIE);
  return NextResponse.redirect(new URL("/staff-login", request.url));
}
