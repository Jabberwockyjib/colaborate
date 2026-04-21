import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../types.js";
import * as getComponentFeedback from "./get-component-feedback.js";
import * as getSession from "./get-session.js";
import * as listFeedback from "./list-feedback.js";
import * as listSessions from "./list-sessions.js";
import * as resolveFeedback from "./resolve-feedback.js";
import * as searchFeedback from "./search-feedback.js";

/** Register every Colaborate tool on the provided `McpServer`. */
export function registerAllTools(server: McpServer, ctx: ServerContext): void {
  listSessions.register(server, ctx);
  getSession.register(server, ctx);
  listFeedback.register(server, ctx);
  getComponentFeedback.register(server, ctx);
  resolveFeedback.register(server, ctx);
  searchFeedback.register(server, ctx);
}
