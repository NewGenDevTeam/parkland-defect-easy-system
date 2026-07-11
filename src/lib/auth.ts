import "server-only";

import { cache } from "react";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, type UserRole } from "@/lib/session";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Current, database-backed identity of the signed-in user. */
export type AuthUser = {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
};

/**
 * Returns the signed-in user, or redirects away.
 *
 * The JWT only proves identity (userId); existence, the `active` flag and the
 * current profile are re-checked against the DATABASE on every protected
 * request, so deactivating an account blocks it immediately — no waiting for
 * cookie expiry — and name/email edits show up on the next request.
 *
 * Deleted/deactivated accounts are sent to /logout (a Route Handler that
 * clears the cookie) rather than /login directly: the proxy would otherwise
 * see the still-valid JWT and bounce them straight back — a redirect loop.
 *
 * Wrapped in React cache() so layout + page + actions in one request share a
 * single user query.
 */
export const requireUser = cache(async (): Promise<AuthUser> => {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!user || !user.active) redirect("/logout");

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
  };
});

/**
 * Requires the signed-in user to have a specific role, otherwise redirects
 * them to their own dashboard. Checks the CURRENT database role via
 * requireUser(), never the stale JWT claim.
 */
export async function requireRole(role: UserRole): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== role) {
    redirect(user.role === "MAIN_CON" ? "/main" : "/sub");
  }
  return user;
}

export function dashboardPathForRole(role: UserRole): string {
  return role === "MAIN_CON" ? "/main" : "/sub";
}
