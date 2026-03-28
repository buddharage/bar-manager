import { baseUrl } from "@/lib/mcp-oauth";

/** RFC 9728 — Protected Resource Metadata */
export async function GET() {
  const origin = baseUrl();
  return Response.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
  });
}
