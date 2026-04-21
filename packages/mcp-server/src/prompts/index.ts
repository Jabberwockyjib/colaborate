import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as triageSession from "./triage-session.js";

export function registerAllPrompts(server: McpServer): void {
  triageSession.register(server);
}
