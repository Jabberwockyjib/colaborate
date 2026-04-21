# @colaborate/mcp-server

Model Context Protocol server exposing [Colaborate](https://github.com/develotype/colaborate) feedback to LLMs.

## What it is

A thin MCP server over the existing `ColaborateStore` abstraction. Connects any adapter
(`@colaborate/adapter-memory`, `@colaborate/adapter-prisma`, or a custom store) to:

- **6 tools** — `list_sessions`, `get_session`, `list_feedback`, `get_component_feedback`,
  `resolve_feedback`, `search_feedback`
- **2 resources** — `colaborate://session/{id}`, `colaborate://feedback/{id}`
- **1 prompt** — `triage-session {id}` — instructs an LLM to draft tracker issues from a session bundle

## Transports

Both stdio (local Claude Code) and Streamable HTTP (remote / production) are supported.

### Stdio — local Claude Code integration

```jsonc
// .claude/settings.json
{
  "mcpServers": {
    "colaborate": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp-server/bin/stdio.mjs"]
    }
  }
}
```

The default `bin/stdio.mjs` entry uses `MemoryStore` — data lives only for the process
lifetime. Swap in a `PrismaStore` in your own launcher for persistent storage.

### Streamable HTTP — remote mount

```ts
// Next.js App Router — app/api/mcp/route.ts
import { MemoryStore } from "@colaborate/adapter-memory";
import { createColaborateMcpServer } from "@colaborate/mcp-server";
import { createHttpHandler } from "@colaborate/mcp-server/transports/http";

const server = createColaborateMcpServer({ store: new MemoryStore() });
const handler = createHttpHandler({ server, apiKey: process.env.COLABORATE_API_KEY });

export { handler as POST, handler as GET };
```

When `apiKey` is set, every request must carry `Authorization: Bearer ${apiKey}` —
constant-time comparison, 401 on mismatch. OAuth 2.1 + PKCE lands in Phase 7.

## Current limitations (v0 / Phase 3)

- **Screenshots:** session bundles return `screenshots: []`. The Phase 4 sourcemap +
  screenshot ingest pipeline will populate these.
- **`externalIssueUrl`:** `resolve_feedback` accepts the argument but does not persist it
  yet. Phase 6 (GitHub + Linear adapters) will add store-level write-through.
- **Subscriptions:** resources are one-shot reads. No live subscriptions in v0.
- **`attach_screenshot` tool:** deferred to Phase 4.

## License

MIT.
