# TODO — Colaborate

## In Progress
_(nothing in-flight — Phase 1b shipped cleanly)_

## Next Up

- [ ] **Phase 2** — Session drafting UX in widget (depends on 1b + 1c — both complete)
  - Session create / resume flow inside widget popup
  - `submitSession` tied to widget submit action
  - Display session status on markers
  - Depends on: `ColaborateSession`, `sessionId` field, store methods from Phase 1b

## Phase 2+ (written when Phase 2 lands)

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
- [ ] **Freehand re-projection across element boundaries** — tagged `TODO(phase-1d-or-later)` in `packages/widget/src/annotator.ts`'s `rebaseGeometry` helper. When a freehand stroke spans two elements, the first-pass (1-px probe) anchor may differ from the second-pass (drawn-bounds) anchor; stored `points` are then relative to the first-pass anchor. Low severity; invisible for single-element strokes.
- [ ] **Popup-open drag race in annotator** — while `popup.show(...)` is awaiting, the overlay retains `pointer-events: auto`. A click outside the popup card triggers a second `startDrawing`; the first `finishDrawing` continuation then emits the first drag and `deactivate()`s, silently discarding the second drag. Pre-existing from pre-Phase-1c. Fix: set `overlay.pointerEvents = "none"` before the popup await and restore on all exit paths.

## Completed This Session (2026-04-18 → 2026-04-20)

- [x] **Phase 0** — Forked NeosiaNexus/SitePing @ `widget-v0.9.5` (SHA `1bfb1db`) into `/Users/brian/dev/colaborate`, fresh git, MIT + NOTICE attribution, full rebrand (`@siteping/* → @colaborate/*`, `SitePing → Colaborate` across types/element/CLI/paths/keys). Fixed Node 25's experimental webstorage shadowing jsdom. Commit `e656ff4`, tag `v0.0.0-fork`.
- [x] **Phase 1a** — Replaced fixed `xPct/yPct/wPct/hPct` with `Geometry` discriminated union (6 shapes) across every layer: new `packages/core/src/geometry.ts` module, schema, Zod validation with `discriminatedUnion`, `flattenAnnotation`, all 3 adapters, widget annotator + markers, 14 new round-trip tests, all existing fixtures updated. Commit `ce24787`, tag `v0.1.0-phase-1a`.
- [x] **Phase 1c** — Shipped all 5 new drawing primitives: shape picker in the glass toolbar, `R/C/A/L/T/F` keyboard shortcuts, `DrawingMode` interface + 6 mode classes in `drawing-modes.ts`, per-shape highlight rendering in `shape-render.ts`, `perfect-freehand` smoothing for freehand, i18n en/fr, `drawShapeAndSubmit` Playwright helper + 6 new per-shape E2E tests. 831 unit / 103 E2E green. Final commit `ac27b1d`, tag `v0.1.1-phase-1c`.
- [x] **Phase 1b** — Schema extensions: `ColaborateSession` model, 9 new fields on `ColaborateFeedback` (`sessionId`, `componentId`, `sourceFile/Line/Column`, `mentions`, `externalProvider/IssueId/IssueUrl`), extended `FEEDBACK_STATUSES` (4 values), 4 new store methods (`createSession`, `getSession`, `listSessions`, `submitSession`), Zod wire-format extensions, `mentions.ts` module. Memory + LocalStorage + Prisma adapters all updated. 885 unit / 103 E2E green. Final commit `cb22e63`, tag `v0.2.0-phase-1b`.
- [x] Spec: `docs/superpowers/specs/2026-04-18-colaborate-design.md`
- [x] Phase 0 plan: `docs/superpowers/plans/2026-04-18-phase-0-fork-and-rebrand.md`
- [x] Phase 1a plan: `docs/superpowers/plans/2026-04-18-phase-1a-geometry-union.md`
- [x] Phase 1c plan: `docs/superpowers/plans/2026-04-20-phase-1c-widget-shape-ui.md`
