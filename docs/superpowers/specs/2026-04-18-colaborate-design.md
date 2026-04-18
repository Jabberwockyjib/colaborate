# Colaborate — client feedback overlay with MCP-driven fix loop

**Working name:** `colaborate`
**Fork base:** [NeosiaNexus/SitePing](https://github.com/NeosiaNexus/SitePing) @ latest tagged commit, MIT
**First target:** `/Users/brian/dev/parkland` (Next.js + shadcn + Python/Supabase backend)
**Release:** open source, MIT, matching upstream

---

## Context

Develotype ships apps to clients like Parkland. Today there is no clean way for a non-technical reviewer to annotate a running app — draw a circle around a mis-colored chart, arrow an off-copy heading, drop a comment on a broken state — and have that feedback land as a well-formed issue in the dev workflow. Existing OSS options either store pixel screenshots (Sentry feedback) or lack the review-loop semantics (FeedbackFin, Formbricks). Commercial tools (BugHerd, Marker.io, Jam) solve this but are closed and do not expose feedback to LLMs.

**Colaborate** fills the gap: a floating toolbar overlay on any target app that lets reviewers draw shapes, attach comments, tag components, and @mention teammates; a backend that stores feedback with durable DOM anchors; an MCP server that exposes per-component feedback to LLMs; and a tracker adapter that — after LLM triage — creates well-formed GitHub or Linear issues. Claude Code fixes those issues via MCP; the developer reviews + merges.

Intended outcome: Parkland reviewers submit annotated feedback; Brian + Claude Code close the loop with minimal transcription friction; the tool gets reused on future Develotype clients and is released to the community.

---

## Scope — v0

**In scope:**

1. Fork of SitePing with richer drawing (circle, arrow, line, text box, freehand) alongside inherited rectangle.
2. Batch review sessions — annotations are drafts until reviewer clicks "Send to dev."
3. `@` mentions (teammates) + component/file tags.
4. Schema additions: `componentId`, `sourceFile` + `sourceLine`, `shape` + `geometry` JSON, `sessionId`, `mentions[]`, `status` state machine.
5. **Colaborate MCP server** (new package) — tools: `list_feedback`, `get_component_feedback`, `get_session`, `resolve_feedback`, `attach_screenshot`. Resources: session bundles.
6. **Integration adapters** — `packages/integration-github` and `packages/integration-linear`. Config picks one at deploy time.
7. **LLM triage pipeline** — on batch submit, a Claude API call reads the batch and composes structured issue(s) in the configured tracker.
8. **Sourcemap uploader** — CLI (`colaborate upload-sourcemaps`) + ingest endpoint, Sentry-style.
9. Deployment on sop-hub (Hetzner), Docker + Caddy + Postgres, behind `colaborate.develotype.com` and `mcp.colaborate.develotype.com`.
10. Widget embedded in parkland's Next.js frontend.
11. Test coverage — Vitest for schema/adapters, Playwright for widget E2E, MCP integration tests via `@modelcontextprotocol/inspector`.

**Out of scope (deferred to v0.1+):**

- Autonomous LLM-fix loop (LLM opens PR unattended). Claude Code, invoked by Brian, handles this in v0.
- Multi-tenant user/org tables. Single shared API key inherited from SitePing.
- Secure preview proxy for letting external users test local apps.
- Agent-trigger mentions (`@claude-fix`, `@triage`). Explicitly excluded per design decision.
- Bidirectional sync (tracker → feedback resolution). v0 is write-only to trackers.
- Mobile support (SitePing disables < 768 px; we inherit that limit).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  parkland.develotype.com  (Next.js, shadcn/ui)                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  @colaborate/widget  (imported in root client component)        │  │
│  │  FAB → toolbar → shape picker → annotator → session panel       │  │
│  └────────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────────┘
                             │  HTTPS (apiKey + allowlisted origin)
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│  colaborate.develotype.com  (Hetzner sop-hub, Docker, Caddy)          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐     │
│  │ Ingest API      │  │ Triage worker   │  │ Colaborate MCP   │     │
│  │ (Fetch handler, │  │ (on batch       │  │ server           │     │
│  │ inherits Site-  │  │ submit: Claude  │  │ (OAuth 2.1 PKCE  │     │
│  │ Ping handler)   │  │ API → issue)    │  │ remote)          │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬─────────┘     │
│           │                    │                    │                │
│           └────────┬───────────┴──────┬─────────────┘                │
│                    ▼                  ▼                              │
│           ┌─────────────────┐  ┌─────────────────┐                   │
│           │  Postgres       │  │  Sourcemap blob │                   │
│           │  (Prisma)       │  │  store (local   │                   │
│           │                 │  │  FS, v0)        │                   │
│           └─────────────────┘  └─────────────────┘                   │
└──────────┬───────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────┐      ┌──────────────────────────┐
│ integration-github  OR          │ ───▶ │ GitHub Issues  /  Linear │
│ integration-linear (config)     │      │                          │
└─────────────────────────────────┘      └──────────────────────────┘
           ▲
           │  Claude Code on Brian's machine, colaborate MCP + github/linear MCP attached
           ▼
    [Brian reviews PR, merges, closes issue, feedback auto-resolves in colaborate]
```

### Components

| Component | Package / path | Role |
|---|---|---|
| Widget | `packages/widget` (fork) | Overlay, toolbar, 6 drawing modes (rect + 5 new), session drafts |
| Core types + schema | `packages/core` (fork, extended) | Shared types, `COLABORATE_MODELS` (superset of `SITEPING_MODELS`) |
| Prisma adapter | `packages/adapter-prisma` (fork, extended) | Handler factory with `onFeedbackCreated`/`onSessionSubmitted` hooks |
| MCP server | `packages/mcp-server` (NEW) | Remote MCP, wraps `ColaborateStore` (extends `SitepingStore`) |
| GitHub integration | `packages/integration-github` (NEW) | Creates/updates issues; called from triage worker |
| Linear integration | `packages/integration-linear` (NEW) | Creates/updates issues; called from triage worker |
| Triage worker | `packages/triage` (NEW) | Consumes `sessionSubmitted` events; calls Claude API; writes issues |
| Sourcemap uploader | `packages/cli` (fork, extended) | `colaborate upload-sourcemaps` CLI |
| Deployment glue | `apps/server` (NEW, replaces `apps/demo`) | Next.js app = ingest API + admin + MCP mount |

---

## Data model — schema additions over SitePing

Additions to `packages/core/src/schema.ts` (`COLABORATE_MODELS`):

```prisma
model ColaborateSession {
  id             String   @id @default(cuid())
  projectName    String
  reviewerName   String?
  reviewerEmail  String?
  status         String   // "drafting" | "submitted" | "triaged" | "archived"
  submittedAt    DateTime?
  triagedAt      DateTime?
  notes          String?
  feedbacks      ColaborateFeedback[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([projectName, status])
}

model ColaborateFeedback {
  // All SitepingFeedback fields inherited. Additions:
  sessionId        String?
  session          ColaborateSession? @relation(fields: [sessionId], references: [id])
  componentId      String?            // opt-in data-colaborate-id
  sourceFile       String?            // resolved via sourcemap upload
  sourceLine       Int?
  sourceColumn     Int?
  mentions         Json?              // [{kind: "user"|"component", handle: string}]
  externalProvider String?            // "github" | "linear"
  externalIssueId  String?
  externalIssueUrl String?
  // status string becomes: "draft" | "submitted" | "triaged" | "in-progress" | "resolved"
  annotations      ColaborateAnnotation[]
}

model ColaborateAnnotation {
  // All SitepingAnnotation anchoring fields inherited (cssSelector, xpath, textSnippet,
  // elementTag, elementId, textPrefix, textSuffix, fingerprint, neighborText, scrollX/Y,
  // viewportW/H, devicePixelRatio, createdAt). The legacy rectangle columns
  // (xPct, yPct, wPct, hPct) are REPLACED by the geometry field below. Additions:
  shape    String  // "rectangle" | "circle" | "arrow" | "line" | "textbox" | "freehand"
  geometry Json    // discriminated union — see Geometry type below
}
```

Geometry union (`packages/core/src/types.ts`):

```ts
type Geometry =
  | { shape: "rectangle"; x: number; y: number; w: number; h: number }       // all % of anchor bbox
  | { shape: "circle";    cx: number; cy: number; rx: number; ry: number }
  | { shape: "arrow";     x1: number; y1: number; x2: number; y2: number; headSize: number }
  | { shape: "line";      x1: number; y1: number; x2: number; y2: number }
  | { shape: "textbox";   x: number; y: number; w: number; h: number; text: string; fontSize: number }
  | { shape: "freehand";  points: Array<[number, number]>; strokeWidth: number };
```

All coordinates are percentages of the anchor element's bounding box — SitePing's existing approach extended to new shapes. Freehand uses Perfect Freehand (MIT, ~4 KB) for stroke smoothing.

---

## Widget changes

- **Drawing modes:** shape picker in the top glass toolbar next to cancel. Keyboard shortcuts `R` rect, `C` circle, `A` arrow, `L` line, `T` textbox, `F` freehand. State machine in `annotator.ts` dispatches per-mode mouse/touch handlers; all modes serialize to `Geometry`.
- **Session drafting:** widget holds a `currentSession` in memory + localStorage. New annotation → feedback with `status: "draft"`, `sessionId: currentSession.id`. Side panel shows drafts with "Submit session" button. On submit, POST to `/api/colaborate/sessions/:id/submit`, flip session `status: "submitted"`, triage worker fires.
- **@ picker:** dropdown populated from `GET /api/colaborate/mentionables` (merges team list + discovered `data-colaborate-id` values). Selected mentions serialize into feedback `mentions[]`.
- **Source resolution:** on anchor capture, widget reads `getComputedStyle` + walks fiber (if `window.__NEXT_DATA__` present) for component hint, and calls `resolveSourceLocation(anchorSelector, uploadedSourcemapId)` against the backend. Fails open — no sourcemap = no `sourceFile`.
- **Marker rendering:** `markers.ts` generalizes current rect marker anchor to an "anchor-on-geometry-centroid" helper used by all shapes.
- **Events:** public `SitepingInstance` extended with `session:start`, `session:submit`, `feedback:mention`. No breaking changes.

---

## Backend additions

### Colaborate MCP server (`packages/mcp-server`)

Uses `@modelcontextprotocol/typescript-sdk`. Remote MCP, OAuth 2.1 + PKCE per current spec; shared API key fallback for scripted access.

Tools:
- `list_sessions({status?, projectName?, limit})`
- `get_session({id}) → { feedback[], annotations[], screenshots[] }`
- `list_feedback({sessionId?, componentId?, status?, limit})`
- `get_component_feedback({componentId}) → grouped`
- `resolve_feedback({id, externalIssueUrl?})`
- `attach_screenshot({feedbackId, dataUrl})`
- `search_feedback({query, filters})`

Resources (subscribable):
- `colaborate://session/{id}` — full bundle (JSON + base64 screenshots)
- `colaborate://feedback/{id}` — single feedback with annotations + source

Prompts:
- `/triage-session {id}` — instructs the LLM to compose issues from a session

### Integration adapters

`packages/integration-github` and `packages/integration-linear` each export:

```ts
interface TrackerAdapter {
  name: "github" | "linear";
  createIssue(input: IssueInput): Promise<IssueRef>;
  updateIssue(ref: IssueRef, patch: IssuePatch): Promise<void>;
  linkResolve(ref: IssueRef): Promise<{ resolved: boolean }>;
}
```

Config picks one via env (`COLABORATE_TRACKER=github|linear`). Auth: GitHub App for GH, API token for Linear. Adapters call the tracker REST/GraphQL APIs directly — no nested MCP clients.

### Triage worker (`packages/triage`)

On `session.submitted`:

1. Load full session bundle via `ColaborateStore`.
2. Call Claude API (model configurable; default `claude-sonnet-4-7`) with bundle + triage prompt template. Use prompt caching on the template and few-shot examples.
3. LLM outputs JSON array of issues: `[{title, body, labels?, componentId, sourceFile?, relatedFeedbackIds}]`.
4. For each issue, call `trackerAdapter.createIssue`. Persist `externalIssueUrl` onto related feedbacks. Flip session `status: "triaged"`.

### Sourcemap uploader

CLI extends `packages/cli`:

```
colaborate upload-sourcemaps --project parkland --env staging --dir .next/
```

- Hashes each sourcemap, POSTs to `/api/colaborate/sourcemaps`, stores to local FS (v0) keyed by `{project, env, hash}`.
- Backend resolves `(selector, uploadedSourcemapId)` → `sourceFile:line:col` using `source-map-js` or `@jridgewell/trace-mapping`.

---

## Deployment (sop-hub / Hetzner)

- New Docker service `colaborate` in `docker-compose.yml` on sop-hub.
- Postgres 16 (shared instance with existing services). Dedicated database `colaborate`.
- Caddyfile entries for `colaborate.develotype.com` and `mcp.colaborate.develotype.com`.
- Secrets: `COLABORATE_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_APP_*` or `LINEAR_TOKEN`, `SOURCEMAP_STORE_PATH`.
- Backups via existing VPS runbook.
- CI: GitHub Actions on the fork — run Vitest + Playwright + `bun run build`; deploy on tag push to sop-hub.

---

## Testing strategy (TDD)

- **Inherited:** 780+ Vitest + 29 Playwright specs from SitePing stay green.
- **New unit tests** (Vitest):
  - Geometry serialization/deserialization for all 5 new shapes
  - Schema migrations from `Siteping*` → `Colaborate*`
  - Triage prompt output parsing
  - Mention resolution
  - Sourcemap `file:line` resolver
  - GitHub + Linear adapters (nock-mocked)
- **New E2E tests** (Playwright):
  - Draw one of each shape, submit session, assert Postgres state
  - Session-draft → submit → issue created (tracker API mocked)
  - MCP `list_feedback` / `get_component_feedback` round-trip
- **Contract tests:** MCP server against `@modelcontextprotocol/inspector` harness.
- **Red-first workflow:** for each new feature, write failing test → implement → green → refactor. Enforced per `superpowers:test-driven-development`.

---

## Delivery phases

| Phase | Goal | Exit criteria |
|---|---|---|
| 0 | Fork, rename, rebrand, CI green | `@colaborate/widget` publishable; demo app boots |
| 1 | Schema migration + 5 new shape primitives | All shapes drawable + persisted + replayed |
| 2 | Session drafting + batch submit UX | Reviewer draws 3 shapes, submits once, 1 session + 3 feedbacks in DB |
| 3 | MCP server package + Claude Code integration | Claude Code reads a session via MCP |
| 4 | Sourcemap uploader + resolver | Parkland staging supplies `file:line` into feedback |
| 5 | Triage worker + GitHub adapter | Session submit auto-creates GH issue |
| 6 | Linear adapter + config switch | Same flow, Linear output |
| 7 | Deploy to sop-hub, wire parkland, internal dogfood | Parkland uses it for one real review cycle |
| 8 | README, open-source release | Public repo + announcement |

---

## Critical files to create/modify

Existing (fork + modify):
- `packages/core/src/schema.ts`, `types.ts`
- `packages/widget/src/annotator.ts`, `markers.ts`, `popup.ts`, `panel.ts`, `panel-detail.ts`, `shortcuts.ts`
- `packages/widget/src/dom/anchor.ts`
- `packages/adapter-prisma/src/index.ts`, `validation.ts`
- `packages/cli` — sourcemap upload command

New:
- `packages/mcp-server/`
- `packages/triage/`
- `packages/integration-github/`, `packages/integration-linear/`
- `apps/server/` (replaces `apps/demo`)
- `docs/superpowers/specs/` — this file and follow-on design docs

---

## Verification (end-to-end acceptance for v0)

1. Deploy colaborate to sop-hub, embed widget in parkland staging.
2. As reviewer, open parkland, toggle widget, draw each of the 5 shapes across ≥ 3 components.
3. Click "Send to dev" in session panel.
4. Confirm (a) issue appears in GitHub (configured tracker) within 30 s, (b) issue body contains componentId + sourceFile + shape geometry summary + screenshot URL.
5. From Brian's terminal, launch Claude Code with the colaborate MCP attached. `list_feedback status=submitted` returns the session. `get_component_feedback` for the first componentId returns full bundle.
6. Ask Claude Code to propose a fix; confirm it references the correct `file:line` and produces a PR.
7. Brian merges PR, closes issue manually (v0 is one-way); verify feedback status visible in colaborate admin.

If every step passes end-to-end on the real parkland app, v0 is done.

---

## Known risks & mitigations

- **Upstream SitePing churn** (v0.9.x, weekly releases): pin to tagged commit; cherry-pick bug fixes only; document merge pain.
- **Closed Shadow DOM limits host interop:** keep widget in closed mode; extend `SitepingInstance` public API instead.
- **Triage LLM cost:** prompt caching on template + few-shot; batch triage at session granularity (not per-feedback).
- **Sourcemap leak risk:** sourcemaps live behind API key; never exposed to widget clients.
- **License:** upstream MIT, fork stays MIT with NOTICE attribution.

---

## Decisions deferred to implementation planning

- Exact Anthropic model + triage prompt template (decided during Phase 5).
- GitHub App vs. PAT for the GH adapter (decided based on repo perms needed).
- Admin dashboard scope (bare table view v0; polish v0.1).
- Session auto-expire policy after N days of inactivity.

---

## Provenance

This spec is the source of truth for v0 scope. The implementation plan (`docs/superpowers/plans/`) decomposes it into concrete TDD steps. The design was brainstormed on 2026-04-17 → 2026-04-18 via interactive Q&A; choices are documented in the conversation log at `/Users/brian/.claude/plans/i-want-to-create-jaunty-bachman.md`.
