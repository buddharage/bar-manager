/**
 * Dynamic Client Registration (RFC 7591).
 *
 * Accepts any registration since this is a single-user app.
 * Returns a deterministic client_id derived from the redirect_uris
 * so repeated registrations are idempotent.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const redirectUris: string[] = body.redirect_uris ?? [];
  const clientName: string = body.client_name ?? "unknown";

  // Deterministic client_id from redirect URIs
  const raw = redirectUris.sort().join(",") || clientName;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw)
  );
  const clientId = Array.from(new Uint8Array(hash).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return Response.json({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }, { status: 201 });
}
