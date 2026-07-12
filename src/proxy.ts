import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "session";

type Session = { userId: string; role: "MAIN_CON" | "SUB_CON" };

async function readSession(req: NextRequest): Promise<Session | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] },
    );
    return { userId: String(payload.userId), role: payload.role as Session["role"] };
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await readSession(req);

  const isLogin = pathname === "/login";

  // Not signed in → allow only the login page.
  if (!session) {
    if (isLogin) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Signed in but visiting login or root → send to their landing page
  // (Main-Con: project selection; Sub-Con: their defect list).
  if (isLogin || pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = session.role === "MAIN_CON" ? "/main/projects" : "/sub";
    return NextResponse.redirect(url);
  }

  // Keep each role inside its own area.
  if (pathname.startsWith("/main") && session.role !== "MAIN_CON") {
    const url = req.nextUrl.clone();
    url.pathname = "/sub";
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/sub") && session.role !== "SUB_CON") {
    const url = req.nextUrl.clone();
    url.pathname = "/main/projects";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, API routes, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
