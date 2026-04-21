import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../types.js";
import * as feedback from "./feedback.js";
import * as session from "./session.js";

export function registerAllResources(server: McpServer, ctx: ServerContext): void {
  session.register(server, ctx);
  feedback.register(server, ctx);
}
