# Colaborate

Floating toolbar overlay that lets clients annotate a running web app with shapes and comments, serializes the feedback with durable DOM anchors, and exposes it to LLMs via an MCP server — so review turns into well-formed GitHub or Linear issues automatically.

**Status:** v0 in development. Phases 0–5 shipped; current tag `v0.6.0-phase-5`. See [`status.md`](./status.md) for the full per-phase log and [`docs/superpowers/specs/2026-04-18-colaborate-design.md`](./docs/superpowers/specs/2026-04-18-colaborate-design.md) for the v0 spec.

Forked from [NeosiaNexus/SitePing](https://github.com/NeosiaNexus/SitePing) (MIT). See [`NOTICE`](./NOTICE) for attribution.

## What's in the box

- **Widget** ([`packages/widget`](./packages/widget)) — Shadow-DOM overlay with 6 drawing modes (rectangle, circle, arrow, line, textbox, freehand) and `R/C/A/L/T/F` keyboard shortcuts. Anchors via `@medv/finder` CSS selector + XPath fallback + text snippet. Bundles `perfect-freehand` + `html2canvas`.
- **Session drafting** — reviewer toggles session mode, draws several annotations, opens the side panel, clicks "Send to dev." All drafts flip to `open` atomically.
- **MCP server** ([`packages/mcp-server`](./packages/mcp-server)) — 6 tools, 2 resources, 1 prompt. Stdio for local Claude Code; Streamable HTTP with Bearer auth for remote.
- **Triage worker** ([`packages/triage`](./packages/triage)) — on session submit, calls Anthropic, groups feedbacks into 1+ issues, writes them via the configured tracker adapter, persists `externalIssueUrl` per feedback, flips session to `triaged`.
- **GitHub adapter** ([`packages/integration-github`](./packages/integration-github)) — direct `fetch`, no Octokit, PAT auth.
- **Sourcemap pipeline** — CLI `colaborate upload-sourcemaps` + `FsSourcemapStore` + resolver endpoint. Widget reads React fiber `_debugSource` in dev mode and threads `sourceFile / sourceLine / sourceColumn` through the wire format.
- **Screenshot pipeline** — opt-in via `captureScreenshots: true`. Bytes hashed, deduped, served behind the same API key as session/feedback routes.
- **Three storage adapters** — Prisma (server), in-memory (tests / serverless), localStorage (client-side prototyping). All three pass the same conformance suite.

## Quick start — run the demo locally

The demo app at [`apps/demo`](./apps/demo) is the easiest way to see the whole loop. It mounts the ingest handler + MCP server + landing page in one Next.js app, backed by `MemoryStore` (no database required).

```bash
bun install
cd apps/demo
bun run dev
# open http://localhost:3000/demo
```

Without env vars, sessions submit but stop at `status: "submitted"` — the triage worker is silently disabled. To enable the full submit→issue loop:

```bash
# apps/demo/.env.local
ANTHROPIC_API_KEY=sk-ant-…
GITHUB_TOKEN=ghp_…                          # PAT with `repo` scope
COLABORATE_GITHUB_REPO=owner/name           # target repo for filed issues
# optional:
COLABORATE_TRIAGE_MODEL=claude-sonnet-4-6   # default
```

When all three of `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `COLABORATE_GITHUB_REPO` are set, draft a session of 3+ annotations and click submit. Within ~10 s, expect 1+ issues on the configured repo and the session status to flip to `triaged`. See [`packages/triage/README.md`](./packages/triage/README.md) for the failure-mode taxonomy and the manual-retry route.

## Embed the widget in your own app

```bash
npm install @colaborate/widget
```

```tsx
// app/layout.tsx (or any client component)
"use client";
import { initColaborate } from "@colaborate/widget";
import { useEffect } from "react";

export default function Layout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const { destroy } = initColaborate({
      endpoint: "/api/colaborate",
      projectName: "my-app",
      // optional:
      apiKey: process.env.NEXT_PUBLIC_COLABORATE_API_KEY,
      captureScreenshots: true,
      accentColor: "#173CFF",
      locale: "en", // or "fr"
    });
    return destroy;
  }, []);
  return <>{children}</>;
}
```

For the server side, mount [`@colaborate/adapter-prisma`](./packages/adapter-prisma) in a Next.js App Router route — see that package's README for the full setup including sourcemap + screenshot stores.

## Wire MCP into Claude Code

```jsonc
// .claude/settings.json
{
  "mcpServers": {
    "colaborate": {
      "command": "node",
      "args": ["/absolute/path/to/colaborate/packages/mcp-server/bin/stdio.mjs"]
    }
  }
}
```

The default `bin/stdio.mjs` uses an in-memory store for quick local poking. Swap in `PrismaStore` in your own launcher to point Claude Code at real persistent feedback. See [`packages/mcp-server/README.md`](./packages/mcp-server/README.md).

## Repo layout

```
packages/
  core                    shared types, Geometry union, schema, store-error helpers
  widget                  browser overlay (closed Shadow DOM), 6 drawing modes
  adapter-prisma          server-side request handlers + Fs{Sourcemap,Screenshot}Store
  adapter-memory          in-memory store
  adapter-localstorage    client-side localStorage store
  cli                     colaborate init | sync | status | doctor | upload-sourcemaps
  mcp-server              MCP tools + resources + prompts, stdio + Streamable HTTP
  triage                  Anthropic-driven session → issue worker (Phase 5)
  integration-github      GitHub TrackerAdapter (Phase 5)
apps/
  demo                    Next.js — landing + dogfooded /demo + ingest + MCP mount
docs/
  superpowers/specs/      v0 spec
  superpowers/plans/      per-phase implementation plans
```

## Development

```bash
bun install
bun run build      # turbo run build across all packages
bun run check      # typecheck
bun run test:run   # vitest (1234 tests)
bun run test:e2e   # playwright
bun run lint       # biome
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for commit conventions (Conventional Commits) and the per-phase TDD workflow.

## Status & roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Fork + rebrand | ✅ `v0.0.0-fork` |
| 1a | Geometry-as-union data layer | ✅ `v0.1.0-phase-1a` |
| 1b | Schema extensions (sessions + 9 feedback fields + mentions) | ✅ `v0.2.0-phase-1b` |
| 1c | Widget shape UI (picker + 6 drawing modes + shortcuts) | ✅ `v0.1.1-phase-1c` |
| 2 | Widget session drafting UX + session HTTP routes | ✅ `v0.3.0-phase-2` |
| 3 | MCP server | ✅ `v0.4.0-phase-3` |
| 4a | Sourcemap uploader + ingest + widget `_debugSource` capture | ✅ `v0.5.0-phase-4a` |
| 4b | Screenshot ingest + `attach_screenshot` MCP tool | ✅ `v0.5.1-phase-4b` |
| 5 | Triage worker + GitHub adapter | ✅ `v0.6.0-phase-5` |
| 6 | Linear adapter + tracker config switch | ⏳ next |
| 7 | Deploy to sop-hub + dogfood with parkland | ⏳ |
| 8 | README polish + public OSS release | ⏳ |

## License

MIT. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
