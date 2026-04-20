# Colaborate — session status (2026-04-20)

## What's landed

| Phase | Status | Commit | Tag |
|---|---|---|---|
| Brainstorm + spec | ✅ | — | — |
| **Phase 0** — fork + rebrand | ✅ | `e656ff4` | `v0.0.0-fork` |
| **Phase 1a** — Geometry-as-union data layer | ✅ | `ce24787` | `v0.1.0-phase-1a` |
| **Phase 1c** — Widget shape UI (picker + 6 drawing modes + shortcuts) | ✅ | `f2f141e` | `v0.1.1-phase-1c` |

**Current main branch state — all green:**

- `bun run build` → 7/7 packages build
- `bun run test:run` → **831 / 831 unit tests pass** (was 796; +35 tests across shortcuts, shape-render, drawing-modes, shape-picker, annotator, markers)
- `bun run test:e2e` → 103/103 Playwright pass, 2 skipped (touch — mobile-only)
- `bun run lint` → biome clean (156 files)

## What Phase 1c shipped

All 5 new drawing primitives alongside rectangle, end-to-end — drawing, persistence, re-rendering on load.

- **New module** `packages/widget/src/shortcuts.ts` — `SHAPE_SHORTCUTS` map + `getShapeFromKey(key)` for R / C / A / L / T / F keyboard switch.
- **New module** `packages/widget/src/shape-render.ts` — `renderShapeHighlight(geometry, anchorBounds, color)` returns an absolutely-positioned overlay per shape. Rectangle + textbox as `<div>` with border (matches pre-1c look); circle / arrow / line / freehand as SVG. Freehand smoothed via `perfect-freehand.getStroke`.
- **New module** `packages/widget/src/drawing-modes.ts` — `DrawingMode` interface + 6 mode classes (RectangleMode, TextboxMode, CircleMode, LineMode, ArrowMode, FreehandMode). Circle is midpoint-centered (standard drag-to-bounding-box UX). MIN_EXTENT = 10 px rejects accidental clicks; FREEHAND_MIN_POINTS = 2 rejects single-click strokes.
- **New module** `packages/widget/src/shape-picker.ts` — `ShapePicker` class renders a glass pill-row of 6 icon buttons (`data-shape` attribute for E2E targeting), fires `onChange` on click, `setActive` is silent (for keyboard-shortcut sync).
- **New icons** in `packages/widget/src/icons.ts` — `ICON_SHAPE_RECTANGLE / CIRCLE / ARROW / LINE / TEXTBOX / FREEHAND`.
- **New dep** `perfect-freehand ^1.2.2` — MIT, ~4 KB, bundled via tsup `noExternal` (consumers never install it directly).
- **Refactored** `packages/widget/src/annotator.ts` — thin orchestrator. Delegates drag to mode classes; mounts shape picker in glass toolbar between instruction + cancel; routes R/C/A/L/T/F through `getShapeFromKey`; two-pass anchor selection (1-px probe → drawn-shape bounds) with a `rebaseGeometry` helper that re-projects the geometry into the chosen anchor's local frame.
- **Refactored** `packages/widget/src/markers.ts` — `showHighlight` parses geometry and delegates to `renderShapeHighlight`. Malformed geometry falls back to an anchor-sized rectangle.
- **i18n** — 7 new keys (`picker.aria` + `shape.{rectangle,circle,arrow,line,textbox,freehand}`) in en + fr. `annotator.instruction` reworded to be shape-agnostic.
- **Textbox UX** — the annotation's text content is the feedback message (single input; no second prompt).
- **E2E coverage** — `e2e/widget.spec.ts` gained a `drawShapeAndSubmit` helper + 6 new tests across all 3 browsers (18 test runs) asserting the persisted `shape` + parsed geometry JSON for each new primitive.

## Phase 1c commit trail

```
f2f141e  docs(widget): clarify toRectData is for marker pin positioning, not highlights
47c4187  docs: status.md + todo.md updated for Phase 1c completion
ac27b1d  test(e2e): Playwright coverage for all 5 new shape drawing primitives
93f8624  feat(widget): annotator drives 6 shapes via drawing-modes + picker + shortcuts
41988d1  feat(widget): shape-picker — 6-button toolbar row for the annotator
90c03c8  feat(widget): i18n for shape picker aria + 6 shape labels (en/fr)
7b06715  feat(widget): drawing-modes — 6 per-shape drawing classes
d524bd1  refactor(widget): markers.ts delegates highlight rendering to shape-render
95ceac1  feat(widget): renderShapeHighlight — per-shape geometry → overlay element
75396be  feat(widget): bundle perfect-freehand + add 6 shape-picker SVG icons
ab5f6c1  feat(widget): add shape keyboard shortcut mapping
886800f  docs(plan): Phase 1c — widget shape UI implementation plan
```

## Known debt surfaced during Phase 1c

- **Freehand re-projection** — when the first-pass (1-px probe) anchor differs from the second-pass (drawn-bounds) anchor, the stored freehand `points` are relative to the first-pass anchor. For strokes confined to a single element this is invisible; for strokes spanning multiple elements the replay may be offset. Tagged `TODO(phase-1d-or-later)` in `annotator.ts`'s `rebaseGeometry` helper.
- **Popup-open drag race** — the annotator overlay stays active with `pointer-events: auto` during `await popup.show(...)`. A user can start a second drag while the popup is open; the first `finishDrawing` continuation then builds a payload from the first drag and `deactivate()`s, silently discarding the second. Pre-existing from the pre-1c code (not a regression introduced here). Low severity — users rarely click outside a popup they just summoned.

## Phase 1 decomposition — one sub-plan left

| Plan | Scope | Status |
|---|---|---|
| **1a** | Geometry data layer (types, schema, validation, storage) | ✅ `ce24787` / `v0.1.0-phase-1a` |
| **1b** | New schema fields: `ColaborateSession`, `sessionId`, `componentId`, `sourceFile/Line/Column`, `mentions[]` | 📝 not yet written |
| **1c** | Widget UI: shape picker + 5 drawing modes + shortcuts + marker rendering for all shapes | ✅ `f2f141e` / `v0.1.1-phase-1c` |

Plan 1b is purely additive (new columns, new table) — no breaking changes, ships independently, keeps session drafting + component-aware feedback on the backend. It unblocks Phase 2 (session drafting UX in the widget).

## Outstanding items (unchanged from the prior handoff)

- **GitHub repo creation** — nothing on GitHub yet. When ready: `gh repo create develotype/colaborate --public --source=. && git push -u origin main --tags`.
- **@colaborate npm scope** — not verified available. Alternatives: `@develotype/colaborate-*`.
- **`apps/demo` marketing copy** — rebranded but still pitches the SitePing value-prop; rewrite lands in Phase 7.
- **Upstream cherry-picks** — SitePing is moving; we pin, cherry-pick bug fixes only.

## How to pick this up

```bash
cd /Users/brian/dev/colaborate
git log --oneline          # 16 commits
git tag --list             # v0.0.0-fork, v0.1.0-phase-1a, v0.1.1-phase-1c
bun run test:run           # 831 passing
bun run test:e2e           # 103 passing, 2 skipped
```

Design docs:
- `docs/superpowers/specs/2026-04-18-colaborate-design.md` — full v0 spec
- `docs/superpowers/plans/2026-04-18-phase-0-fork-and-rebrand.md` — executed
- `docs/superpowers/plans/2026-04-18-phase-1a-geometry-union.md` — executed
- `docs/superpowers/plans/2026-04-20-phase-1c-widget-shape-ui.md` — executed

---

*Phase 1c complete. Ready for Plan 1b (schema extensions) whenever convenient — purely additive backend work that unblocks session drafting in Phase 2.*
