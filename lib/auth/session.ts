import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

const COOKIE_NAME = "session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is not set");
  return secret;
}

/** Create a signed session token: `timestamp.signature` */
export function createToken(): string {
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", getSecret())
    .update(timestamp)
    .digest("hex");
  return `${timestamp}.${signature}`;
}

/** Verify a session token is valid and not expired */
export function verifyToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [timestamp, signature] = parts;
  const expected = createHmac("sha256", getSecret())
    .update(timestamp)
    .digest("hex");

  // Timing-safe comparison
  if (signature.length !== expected.length) return false;
  const valid = timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
  if (!valid) return false;

  // Check expiry (30 days)
  const age = Date.now() - Number(timestamp);
  return age >= 0 && age < MAX_AGE_SECONDS * 1000;
}

/** Cookie options for setting/clearing the session cookie */
export function cookieOptions(clear = false) {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: clear ? 0 : MAX_AGE_SECONDS,
  };
}

/**
 * Verify a request is authenticated via either:
 * 1. Bearer CRON_SECRET header (GitHub Actions)
 * 2. Session cookie (dashboard user)
 */
export function verifyRequest(request: NextRequest): boolean {
  // Check Bearer token first (for GitHub Actions cron)
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  // Fall back to session cookie
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token && verifyToken(token)) {
    return true;
  }

  return false;
}
