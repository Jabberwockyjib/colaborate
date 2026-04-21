import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../types.js";
import * as listSessions from "./list-sessions.js";

/** Register every Colaborate tool on the provided `McpServer`. */
export function registerAllTools(server: McpServer, ctx: ServerContext): void {
  listSessions.register(server, ctx);
}
