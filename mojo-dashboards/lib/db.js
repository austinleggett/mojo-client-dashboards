// Single shared Prisma client. Next.js reloads modules on every request
// in dev, so we stash the client on `global` to avoid opening a new DB
// connection pool on every hot-reload.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Strips clientPassword off a Client record. Use this at every point a
// record reaches either a JSON response or a "use client" component's
// props (e.g. <Dashboard client={...}> in app/c/[slug]/page.js) --
// both get serialized to the browser, and the client's portal password
// must never be one of the values that travels there, even hashed.
// Reading/writing it server-side (lib/auth.js, the API route that sets
// it) goes through the real Prisma record instead, never this one.
export function toSafeClient(client) {
  if (!client) return client;
  const { clientPassword, ...safe } = client;
  return safe;
}
