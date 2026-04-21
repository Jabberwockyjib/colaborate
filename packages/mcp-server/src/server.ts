import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "./types.js";

/** Constant so the same version string flows to both package.json and the MCP handshake. */
export const MCP_SERVER_VERSION = "0.4.0";

/**
 * Build a fully-registered Colaborate MCP server.
 *
 * - `store` — any `ColaborateStore` (MemoryStore for tests/dev, PrismaStore for prod).
 * - `apiKey` — optional shared bearer token; enforced only by the HTTP transport helper.
 *
 * Tool / resource / prompt registrations land in Tasks 3–11.
 */
export function createColaborateMcpServer(context: ServerContext): McpServer {
  const server = new McpServer({
    name: "colaborate",
    version: MCP_SERVER_VERSION,
  });

  // Placeholder — populated in subsequent tasks. Referenced here so the
  // registration entry points exist from Task 2 onward.
  void context;

  return server;
}
