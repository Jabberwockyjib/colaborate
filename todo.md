# TODO — Colaborate

## In Progress
_(nothing in-flight — Phase 1a shipped cleanly)_

## Next Up — Phase 1 (two remaining sub-plans, either order works)

- [ ] **Plan 1c — Widget UI for 5 new drawing primitives** (most visible impact)
  - Shape picker in the annotator's glass toolbar
  - Drawing modes: circle, arrow, line, textbox, freehand
  - Keyboard shortcuts: `R` rect, `C` circle, `A` arrow, `L` line, `T` textbox, `F` freehand
  - Per-shape marker rendering in `packages/widget/src/markers.ts`
  - Freehand via Perfect Freehand (MIT, ~4 KB) — add dep
  - TDD red-first for each primitive: Playwright draws shape, assert saved geometry JSON
  - Critical files: `packages/widget/src/annotator.ts`, `markers.ts`, `shortcuts.ts`
  - Data path already fully live (Phase 1a) — widget just needs to emit/render the other 5 shapes

- [ ] **Plan 1b — Schema extensions** (backend-only, unblocks MCP + triage)
  - New table: `ColaborateSession` (drafting → submitted → triaged → archived)
  - New fields on `ColaborateFeedback`: `sessionId`, `componentId`, `sourceFile/Line/Column`, `mentions` (JSON), `externalProvider/IssueId/IssueUrl`, extended `status` state
  - Store interface: add `createSession`, `getSession`, `listSessions`, `submitSession`
  - Update adapters (Prisma + memory + localStorage)
  - Purely additive — no Phase 1a rework needed

## Phase 2+ (written when Phase 1 lands)

- [ ] **Phase 2** — Session drafting UX in widget (depends on 1b + 1c)
- [ ] **Phase 3** — MCP server (`packages/mcp-server`) exposing feedback to Claude Code
- [ ] **Phase 4** — Sourcemap uploader CLI + ingest endpoint
- [ ] **Phase 5** — Triage worker (Claude API) + GitHub adapter
- [ ] **Phase 6** — Linear adapter + config switch
- [ ] **Phase 7** — Deploy to sop-hub, wire into parkland, internal dogfood
- [ ] **Phase 8** — README polish + public OSS release

## Backlog — decisions deferred until needed

- [ ] Create GitHub repo `develotype/colaborate` and push (needs user confirm on org/name)
- [ ] Verify `@colaborate` npm scope availability before first publish
- [ ] Rewrite `apps/demo` marketing copy around the MCP/Parkland angle (currently still SitePing-flavored pitch, just rebranded)
- [ ] Pick Anthropic model + triage prompt template for Phase 5
- [ ] GitHub App vs. PAT for the GitHub adapter
- [ ] Upstream SitePing cherry-pick policy — currently no automation; cherry-pick bug fixes manually as needed

## Completed This Session (2026-04-18 → 2026-04-20)

- [x] **Phase 0** — Forked NeosiaNexus/SitePing @ `widget-v0.9.5` (SHA `1bfb1db`) into `/Users/brian/dev/colaborate`, fresh git, MIT + NOTICE attribution, full rebrand (`@siteping/* → @colaborate/*`, `SitePing → Colaborate` across types/element/CLI/paths/keys). Fixed Node 25's experimental webstorage shadowing jsdom. Commit `e656ff4`, tag `v0.0.0-fork`.
- [x] **Phase 1a** — Replaced fixed `xPct/yPct/wPct/hPct` with `Geometry` discriminated union (6 shapes) across every layer: new `packages/core/src/geometry.ts` module, schema, Zod validation with `discriminatedUnion`, `flattenAnnotation`, all 3 adapters, widget annotator + markers, 14 new round-trip tests, all existing fixtures updated. Commit `ce24787`, tag `v0.1.0-phase-1a`.
- [x] Spec: `docs/superpowers/specs/2026-04-18-colaborate-design.md`
- [x] Phase 0 plan: `docs/superpowers/plans/2026-04-18-phase-0-fork-and-rebrand.md`
- [x] Phase 1a plan: `docs/superpowers/plans/2026-04-18-phase-1a-geometry-union.md`
