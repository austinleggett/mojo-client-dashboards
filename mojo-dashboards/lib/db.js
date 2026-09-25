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
