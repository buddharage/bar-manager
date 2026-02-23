import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/session";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/session",
  "/api/auth/google",
  "/api/auth/google/callback",
  "/api/sync/",
  "/api/webhooks/",
  "/api/ai/",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = request.cookies.get("session")?.value;
  if (token && (await verifyToken(token))) {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
