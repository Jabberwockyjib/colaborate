/**
 * @colaborate/mcp-server — MCP server exposing Colaborate feedback to LLMs.
 *
 * Public entry point.
 */
export { createColaborateMcpServer, MCP_SERVER_VERSION as PACKAGE_VERSION } from "./server.js";
export type { ServerContext } from "./types.js";
