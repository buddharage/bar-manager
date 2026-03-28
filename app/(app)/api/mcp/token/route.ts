/**
 * OAuth 2.0 Token Endpoint.
 *
 * Supports:
 * - authorization_code grant (with PKCE verification)
 * - refresh_token grant
 *
 * All tokens are stateless signed JWTs.
 */
import { signJwt, verifyJwt, sha256 } from "@/lib/mcp-oauth";

export async function POST(req: Request) {
  const body = await req.formData().catch(() => null);
  const params = body
    ? Object.fromEntries(body.entries())
    : await req.json().catch(() => ({}));

  const grantType = params.grant_type as string;

  if (grantType === "authorization_code") {
    return handleAuthorizationCode(params);
  }
  if (grantType === "refresh_token") {
    return handleRefreshToken(params);
  }

  return Response.json(
    { error: "unsupported_grant_type" },
    { status: 400 }
  );
}

async function handleAuthorizationCode(
  params: Record<string, FormDataEntryValue>
) {
  const code = params.code as string;
  const codeVerifier = params.code_verifier as string;
  const redirectUri = params.redirect_uri as string;

  if (!code || !codeVerifier) {
    return Response.json(
      { error: "invalid_request", error_description: "Missing code or code_verifier" },
      { status: 400 }
    );
  }

  // Verify the authorization code JWT
  const claims = await verifyJwt(code);
  if (!claims || claims.type !== "authorization_code") {
    return Response.json(
      { error: "invalid_grant", error_description: "Invalid or expired authorization code" },
      { status: 400 }
    );
  }

  // Verify PKCE: S256(code_verifier) must match code_challenge
  const challenge = await sha256(codeVerifier);
  if (challenge !== claims.code_challenge) {
    return Response.json(
      { error: "invalid_grant", error_description: "PKCE verification failed" },
      { status: 400 }
    );
  }

  // Verify redirect_uri matches
  if (redirectUri && redirectUri !== claims.redirect_uri) {
    return Response.json(
      { error: "invalid_grant", error_description: "redirect_uri mismatch" },
      { status: 400 }
    );
  }

  return issueTokens(claims.client_id as string);
}

async function handleRefreshToken(
  params: Record<string, FormDataEntryValue>
) {
  const refreshToken = params.refresh_token as string;
  if (!refreshToken) {
    return Response.json(
      { error: "invalid_request", error_description: "Missing refresh_token" },
      { status: 400 }
    );
  }

  const claims = await verifyJwt(refreshToken);
  if (!claims || claims.type !== "refresh_token") {
    return Response.json(
      { error: "invalid_grant", error_description: "Invalid or expired refresh token" },
      { status: 400 }
    );
  }

  return issueTokens(claims.client_id as string);
}

async function issueTokens(clientId: string) {
  const accessToken = await signJwt(
    { type: "access_token", client_id: clientId, scope: "mcp:tools" },
    3600 // 1 hour
  );
  const refreshToken = await signJwt(
    { type: "refresh_token", client_id: clientId },
    30 * 24 * 3600 // 30 days
  );

  return Response.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    scope: "mcp:tools",
  });
}
