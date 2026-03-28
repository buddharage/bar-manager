/**
 * OAuth 2.0 Authorization Endpoint.
 *
 * Since this is a single-user app, we auto-approve if the user has a valid
 * session cookie. If not, we redirect to login with a returnTo parameter.
 *
 * Issues a signed authorization code (JWT) containing the PKCE challenge
 * so the token endpoint can verify it statelessly.
 */
import { verifyToken } from "@/lib/auth/session";
import { signJwt } from "@/lib/mcp-oauth";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const codeChallenge = url.searchParams.get("code_challenge") ?? "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");

  if (!redirectUri || !codeChallenge || codeChallengeMethod !== "S256") {
    return new Response("Missing required OAuth parameters", { status: 400 });
  }

  // Check if user is authenticated via session cookie
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;
  const isAuthenticated = sessionToken ? await verifyToken(sessionToken) : false;

  if (!isAuthenticated) {
    // Redirect to login, preserving the full authorize URL as returnTo
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("returnTo", url.pathname + url.search);
    return Response.redirect(loginUrl.toString());
  }

  // User is authenticated — issue an authorization code
  const code = await signJwt(
    {
      type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
    },
    300 // 5 minutes
  );

  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  if (state) callback.searchParams.set("state", state);

  return Response.redirect(callback.toString());
}
