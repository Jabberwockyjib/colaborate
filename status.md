# Colaborate — session status (2026-04-18)

## What's landed

| Phase | Status | Commit | Tag |
|---|---|---|---|
| Brainstorm + spec | ✅ | — | — |
| **Phase 0** — fork + rebrand | ✅ | `e656ff4` | `v0.0.0-fork` |
| **Phase 1a** — Geometry-as-union data layer | ✅ | `ce24787` | `v0.1.0-phase-1a` |

**Current main branch state — all green:**

- `bun run build` → 7/7 packages build
- `bun run test:run` → **796 / 796 unit tests pass** (was 780; +14 geometry tests, +2 validation tests added this phase)
- `bun run test:e2e` → 85/85 Playwright pass, 2 skipped (touch — mobile-only)
- `bun run lint` → biome clean (148 files)

## What Phase 1a shipped

Replaced the fixed `xPct / yPct / wPct / hPct` rectangle with a **`Geometry` discriminated union** across every layer:

- **New module** `packages/core/src/geometry.ts`: `Shape` literal (6 primitives: rectangle, circle, arrow, line, textbox, freehand), `Geometry` union, `serializeGeometry`, `parseGeometry`, `geometryFromRect`. 14 round-trip + validation tests.
- **Schema:** `ColaborateAnnotation` dropped the four legacy Float columns, gained `shape: String` + `geometry: String @db.Text` (JSON-serialized union — DB-agnostic: Postgres/MySQL/SQLite).
- **Wire format:** `AnnotationPayload` carries `shape: Shape` + `geometry: Geometry` object. Zod validates with `discriminatedUnion("shape", [...])`.
- **Store layer:** `AnnotationCreateInput` / `AnnotationRecord` / `AnnotationResponse` all changed uniformly. `flattenAnnotation` now serializes geometry to JSON string on the store boundary.
- **All 3 adapters** (Prisma, memory, localStorage) updated.
- **Widget** annotator emits `{ shape: "rectangle", geometry: { x, y, w, h } }`. Markers parse `geometry` and narrow to rectangle (other shapes are no-op for now — Plan 1c adds them).
- **Deprecated:** `RectData` type removed (no stable consumers yet).

## Phase 1 decomposition (in-flight)

The spec's "Phase 1" was too big for one plan — I split it into three:

| Plan | Scope | Status |
|---|---|---|
| **1a** | Geometry data layer (types, schema, validation, storage) | ✅ `ce24787` |
| **1b** | New schema fields: `ColaborateSession`, `sessionId`, `componentId`, `sourceFile/Line/Column`, `mentions[]` | 📝 not yet written |
| **1c** | Widget UI: shape picker + 5 drawing modes + shortcuts + marker rendering for all shapes | 📝 not yet written |

Plan 1b is purely additive (new columns, new table) — no breaking changes, ships independently, keeps session drafting + component-aware feedback on the backend even before the widget consumes them.

Plan 1c depends only on 1a (not on 1b) — it adds the drawing UI for shapes already representable in the data layer.

## Outstanding items (unchanged from the prior handoff)

- **GitHub repo creation** — nothing on GitHub yet. When ready: `gh repo create develotype/colaborate --public --source=. && git push -u origin main --tags`.
- **@colaborate npm scope** — not verified available. Alternatives: `@develotype/colaborate-*`.
- **`apps/demo` marketing copy** — rebranded but still pitches the SitePing value-prop; rewrite lands in Phase 7.
- **Upstream cherry-picks** — SitePing is moving; we pin, cherry-pick bug fixes only.

## How to pick this up

```bash
cd /Users/brian/dev/colaborate
git log --oneline          # 4 commits
git tag --list             # v0.0.0-fork, v0.1.0-phase-1a
bun run test:run           # 796 passing
bun run test:e2e           # 85 passing
```

Design docs:
- `docs/superpowers/specs/2026-04-18-colaborate-design.md` — full v0 spec
- `docs/superpowers/plans/2026-04-18-phase-0-fork-and-rebrand.md` — executed
- `docs/superpowers/plans/2026-04-18-phase-1a-geometry-union.md` — executed

---

*Phase 1a complete. Ready for Plan 1b (schema) or 1c (widget UI). Both can be written + executed autonomously on request — 1c is the more visibly impactful option since it unlocks all 5 new drawing primitives for reviewers.*
