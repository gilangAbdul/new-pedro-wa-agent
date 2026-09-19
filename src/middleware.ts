import { NextRequest, NextResponse } from "next/server";
import { isValidSessionCookie } from "@/lib/auth";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/conversations/incoming", // dipanggil wa-service, jangan diblokir
  "/api/cron/reminder",          // dipanggil Vercel Cron
  "/api/cron/categorize",        // dipanggil Vercel Cron
  "/api/health-check",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const isStaticAsset =
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.png" ||
    pathname === "/icon.png";

  if (isPublic || isStaticAsset) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get("pedro_auth")?.value;

  if (!isValidSessionCookie(cookie)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};