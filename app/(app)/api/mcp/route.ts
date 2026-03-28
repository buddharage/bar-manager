/**
 * Remote MCP endpoint for the bar-manager server.
 *
 * Exposes the same tools as the local stdio MCP server but over Streamable HTTP,
 * allowing access from Claude mobile app (iOS/Android), claude.ai, and
 * Claude CLI via the `url` transport type.
 *
 * Uses stateless mode with JSON responses for Vercel serverless compatibility.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServerClient } from "@/lib/supabase/server";
import { registerTools } from "@/lib/mcp-tools";

async function handleRequest(req: Request): Promise<Response> {
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

  return transport.handleRequest(req);
}

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}

export async function DELETE(req: Request) {
  return handleRequest(req);
}
