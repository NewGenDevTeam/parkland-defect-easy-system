import "server-only";

import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export type UserRole = "MAIN_CON" | "SUB_CON";

export type SessionPayload = {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
};

const SESSION_COOKIE = "session";
// Browser-session logins get NO cookie Max-Age (cookie dies with the browser),
// but browsers restore session cookies across restarts (Chrome "continue where
// you left off", iOS Safari), so the JWT itself stays capped at 7 days as the
// server-side limit. "Remember me" logins get a 30-day cookie and JWT.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const REMEMBER_ME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function encryptSession(
  payload: SessionPayload,
  maxAgeSeconds: number = MAX_AGE_SECONDS,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(getSecretKey());
}

export async function decryptSession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(
  payload: SessionPayload,
  options: { rememberMe?: boolean } = {},
): Promise<void> {
  const rememberMe = options.rememberMe === true;
  const maxAge = rememberMe ? REMEMBER_ME_MAX_AGE_SECONDS : MAX_AGE_SECONDS;
  const token = await encryptSession(payload, maxAge);
  // Secure must follow how the browser actually connects, not NODE_ENV:
  // a production build served over plain HTTP (LAN phone testing against
  // `next start`, http://192.168.x.x) would otherwise set a Secure cookie the
  // browser refuses to store, silently logging the user out on navigation.
  // Behind HTTPS (Railway's proxy) x-forwarded-proto is "https" → Secure on.
  const proto = (await headers()).get("x-forwarded-proto");
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: proto?.split(",")[0]?.trim() === "https",
    sameSite: "lax",
    path: "/",
    // No Max-Age/Expires without "remember me" → browser-session cookie.
    ...(rememberMe ? { maxAge } : {}),
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decryptSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
