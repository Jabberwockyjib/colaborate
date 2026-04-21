#!/usr/bin/env node
// Entry point for local Claude Code integration.
// Usage in .claude/settings.json (or MCP client config):
//   {
//     "mcpServers": {
//       "colaborate": {
//         "command": "node",
//         "args": ["/absolute/path/to/packages/mcp-server/bin/stdio.mjs"]
//       }
//     }
//   }
//
// The MemoryStore variant is intended for local dev — data lives only for
// the lifetime of the spawned process. Phase 7 will ship a PrismaStore
// variant that connects to the deployed Postgres database.

import { MemoryStore } from "@colaborate/adapter-memory";
import { createColaborateMcpServer } from "../dist/index.js";
import { connectStdio } from "../dist/transports/stdio.js";

const store = new MemoryStore();
const server = createColaborateMcpServer({ store });
await connectStdio(server);
// Keep the process alive — stdio transport manages its own lifecycle via
// stream close detection; the `await` above resolves once connect() returns,
// but the server continues to handle requests as long as stdin is open.
