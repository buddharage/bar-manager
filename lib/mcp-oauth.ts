/**
 * OAuth 2.0 utilities for the remote MCP endpoint.
 *
 * Uses HMAC-signed JWTs (via CRON_SECRET) so we don't need a database
 * table for auth codes or access tokens — works statelessly on Vercel.
 */

const ALG = "HS256";

function getSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is not set");
  return secret;
}

async function hmacSign(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64url(obj: Record<string, unknown>): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(s: string): Record<string, unknown> {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(padded));
}

/** Create a signed JWT with the given claims and TTL in seconds. */
export async function signJwt(
  claims: Record<string, unknown>,
  ttlSeconds: number
): Promise<string> {
  const header = base64url({ alg: ALG, typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url({
    ...claims,
    iat: now,
    exp: now + ttlSeconds,
  });
  const signature = await hmacSign(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

/** Verify and decode a signed JWT. Returns null if invalid or expired. */
export async function verifyJwt(
  token: string
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, sig] = parts;
  const expected = await hmacSign(`${header}.${payload}`);

  // Constant-time-ish comparison
  if (sig.length !== expected.length) return null;
  let mismatch = 0;
  for (let i = 0; i < sig.length; i++) {
    mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  const claims = fromBase64url(payload) as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < now) return null;

  return claims;
}

/** SHA-256 hash (for PKCE code_challenge verification). */
export async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Base URL for the app, derived from env or defaults. */
export function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
