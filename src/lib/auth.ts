import "server-only";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getSession, type SessionPayload, type UserRole } from "@/lib/session";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Returns the signed-in user's session, or redirects to /login.
 * Use in server components / layouts that require any authenticated user.
 */
export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Requires the signed-in user to have a specific role, otherwise redirects
 * them to their own dashboard.
 */
export async function requireRole(role: UserRole): Promise<SessionPayload> {
  const session = await requireUser();
  if (session.role !== role) {
    redirect(session.role === "MAIN_CON" ? "/main" : "/sub");
  }
  return session;
}

export function dashboardPathForRole(role: UserRole): string {
  return role === "MAIN_CON" ? "/main" : "/sub";
}
