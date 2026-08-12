import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, safeEqual, tokenFor } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const submitted = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/") || "/";
  const expected = process.env.APP_PASSWORD;

  const origin = req.nextUrl.origin;

  if (!expected) {
    return NextResponse.redirect(`${origin}/login?e=unset`, { status: 303 });
  }

  if (!safeEqual(submitted, expected)) {
    return NextResponse.redirect(`${origin}/login?e=1`, { status: 303 });
  }

  // Only ever redirect to a path on this app, never an absolute URL.
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const res = NextResponse.redirect(`${origin}${dest}`, { status: 303 });

  res.cookies.set(AUTH_COOKIE, await tokenFor(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 120, // a season
  });
  return res;
}
