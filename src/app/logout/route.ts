import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

/**
 * Clears the session cookie, then lands on /login.
 *
 * requireUser() sends deactivated/deleted accounts here. Redirecting them to
 * /login directly would loop: the proxy sees the still-valid JWT cookie and
 * bounces /login back to the dashboard. Cookies cannot be modified during a
 * Server Component render, so the deletion happens in this Route Handler.
 */
export async function GET(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url));
}
