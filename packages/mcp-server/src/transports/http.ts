import { timingSafeEqual } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export interface HttpHandlerOptions {
  server: McpServer;
  /**
   * Optional shared API key. When set, every request must include
   * `Authorization: Bearer {apiKey}` or it receives 401. When unset, the
   * handler is fully public (appropriate for local dev / internal networks).
   * OAuth 2.1 + PKCE lands in Phase 7 when Colaborate is deployed.
   */
  apiKey?: string | undefined;
}

/**
 * Constant-time bearer-token comparison.
 *
 * Returns false immediately on length mismatch (unavoidable length leak), but
 * the byte-level comparison is timing-safe. Mirrors the adapter-prisma pattern.
 */
function safeCompareBearer(header: string | null, expected: string): boolean {
  if (!header) return false;
  const expectedHeader = `Bearer ${expected}`;
  if (header.length !== expectedHeader.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expectedHeader));
}

/**
 * Build a Fetch-API handler that serves MCP over Streamable HTTP.
 *
 * Returns `(request: Request) => Promise<Response>` — mount in any framework
 * that speaks the Fetch API (Next.js App Router, Bun.serve, Hono, Cloudflare
 * Workers, etc.). Stateless mode — one transport per request.
 *
 * @example Next.js App Router — `app/api/mcp/route.ts`
 * ```ts
 * import { MemoryStore } from "@colaborate/adapter-memory";
 * import { createColaborateMcpServer } from "@colaborate/mcp-server";
 * import { createHttpHandler } from "@colaborate/mcp-server/transports/http";
 *
 * const server = createColaborateMcpServer({ store: new MemoryStore() });
 * const handler = createHttpHandler({ server, apiKey: process.env.COLABORATE_API_KEY });
 * export { handler as POST, handler as GET };
 * ```
 */
export function createHttpHandler({ server, apiKey }: HttpHandlerOptions): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (apiKey) {
      const header = request.headers.get("Authorization");
      if (!safeCompareBearer(header, apiKey)) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Build a stateless Web Standard transport for this request.
    // WebStandardStreamableHTTPServerTransport accepts Fetch Request directly
    // and returns a Fetch Response — no Node.js shim required.
    // Omitting sessionIdGenerator (i.e. not passing a generator) enables stateless mode.
    const transport = new WebStandardStreamableHTTPServerTransport({});
    await server.connect(transport);

    return transport.handleRequest(request);
  };
}
