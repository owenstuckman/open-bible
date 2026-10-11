import { NextResponse, type NextRequest } from "next/server";
import { sealData, unsealData } from "iron-session";
import {
  SESSION_COOKIE,
  SESSION_REFRESH_AFTER_MS,
  SESSION_TTL_SECONDS,
  cookieDefaults,
  sessionPassword,
  type SessionData,
} from "@/lib/auth/config";

// Optimistic gate: everything except sign-in/setup requires an owner session.
// Route handlers re-check the session themselves; this keeps pages private.

const PUBLIC_PATHS = ["/login", "/setup", "/api/auth/"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p));
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const password = sessionPassword();
  const seal = req.cookies.get(SESSION_COOKIE)?.value;
  const session = seal
    ? await unsealData<SessionData>(seal, { password, ttl: SESSION_TTL_SECONDS }).catch(() => ({}) as SessionData)
    : ({} as SessionData);

  if (session.owner === true) {
    const res = NextResponse.next();
    // Rolling session: re-issue the cookie at most once a day while in use.
    if (!session.issuedAt || Date.now() - session.issuedAt > SESSION_REFRESH_AFTER_MS) {
      const fresh = await sealData({ ...session, issuedAt: Date.now() }, { password, ttl: SESSION_TTL_SECONDS });
      res.cookies.set(SESSION_COOKIE, fresh, { ...cookieDefaults, maxAge: SESSION_TTL_SECONDS - 60 });
    }
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Static assets and the install metadata (manifest, icons) stay public so the
  // login page renders and phones can install the app.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|icon|apple-icon).*)"],
};
