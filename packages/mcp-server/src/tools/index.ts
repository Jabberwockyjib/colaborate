import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../types.js";
import * as getSession from "./get-session.js";
import * as listFeedback from "./list-feedback.js";
import * as listSessions from "./list-sessions.js";

/** Register every Colaborate tool on the provided `McpServer`. */
export function registerAllTools(server: McpServer, ctx: ServerContext): void {
  getSession.register(server, ctx);
  listSessions.register(server, ctx);
  listFeedback.register(server, ctx);
}
