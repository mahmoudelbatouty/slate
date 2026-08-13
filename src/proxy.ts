import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isValidToken } from "@/lib/auth";

/**
 * Everything is behind the password except the login screen itself and
 * the cron route, which carries its own CRON_SECRET bearer token.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron).*)"],
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/connector/ingest"
  ) {
    return NextResponse.next();
  }

  if (await isValidToken(req.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}
