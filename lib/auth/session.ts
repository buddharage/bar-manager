import { NextRequest } from "next/server";

const COOKIE_NAME = "session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is not set");
  return secret;
}

async function hmacSign(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Create a signed session token: `timestamp.signature` */
export async function createToken(): Promise<string> {
  const timestamp = Date.now().toString();
  const signature = await hmacSign(timestamp);
  return `${timestamp}.${signature}`;
}

/** Verify a session token is valid and not expired */
export async function verifyToken(token: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [timestamp, signature] = parts;
  const expected = await hmacSign(timestamp);

  // Constant-time comparison
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return false;

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
export async function verifyRequest(request: NextRequest): Promise<boolean> {
  // Check Bearer token first (for GitHub Actions cron)
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  // Fall back to session cookie
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token && (await verifyToken(token))) {
    return true;
  }

  return false;
}
