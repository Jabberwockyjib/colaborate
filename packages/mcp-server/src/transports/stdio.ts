import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * Connect a pre-built `McpServer` to the stdio transport.
 *
 * Use this in a CLI-style entry point (see `bin/stdio.mjs`). Stdio trusts
 * the local process boundary — no auth is performed here. If you need to
 * gate access, wrap the process launch with OS-level permissions or point
 * Claude Code at the HTTP transport instead.
 */
export async function connectStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
