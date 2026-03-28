import { baseUrl } from "@/lib/mcp-oauth";

/** RFC 8414 — Authorization Server Metadata */
export async function GET() {
  const origin = baseUrl();
  return Response.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/mcp/authorize`,
    token_endpoint: `${origin}/api/mcp/token`,
    registration_endpoint: `${origin}/api/mcp/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp:tools"],
  });
}
