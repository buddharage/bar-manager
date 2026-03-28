/**
 * Remote MCP endpoint for the bar-manager server.
 *
 * Exposes the same tools as the local stdio MCP server but over Streamable HTTP,
 * allowing access from Claude mobile app (iOS/Android), claude.ai, and
 * Claude CLI via the `url` transport type.
 *
 * Uses stateless mode with JSON responses for Vercel serverless compatibility.
 *
 * Requires MCP_BEARER_TOKEN in your environment.
 * Clients must send an `Authorization: Bearer <token>` header.
 */
import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServerClient } from "@/lib/supabase/server";
import { registerTools } from "@/lib/mcp-tools";

function authenticate(req: Request): Response | null {
  const token = process.env.MCP_BEARER_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: "Server misconfigured: MCP_BEARER_TOKEN not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);

  if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

async function handleRequest(req: Request): Promise<Response> {
  const authError = authenticate(req);
  if (authError) return authError;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured: Supabase env vars not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const server = new McpServer({
    name: "bar-manager",
    version: "1.0.0",
  });

  const supabase = createServerClient();
  registerTools(server, supabase);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless for serverless
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(req);
  } finally {
    await transport.close();
  }
}

export async function POST(req: Request) {
  return handleRequest(req);
}
