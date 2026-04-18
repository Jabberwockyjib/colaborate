# Colaborate — session status (2026-04-18)

## What shipped this session

**Phase 0 — Fork SitePing & Rebrand → ✅ complete**, committed on `main` as `v0.0.0-fork` (commit `e656ff4`).

### Deliverables

- **Spec:** `docs/superpowers/specs/2026-04-18-colaborate-design.md` (full v0 design, end-to-end).
- **Phase 0 plan:** `docs/superpowers/plans/2026-04-18-phase-0-fork-and-rebrand.md` (15 bite-sized tasks).
- **Brainstorming transcript / plan-mode artifact:** `/Users/brian/.claude/plans/i-want-to-create-jaunty-bachman.md` (mirrors the spec).

### Fork state

- **Cloned at** `github.com/NeosiaNexus/SitePing` tag `widget-v0.9.5`, SHA `1bfb1db5778f0ca06583139180e6c0487f6eed8e`.
- **Fresh git history** on `main`; upstream added as read-only remote (`git remote -v` shows `upstream ... DISABLED_PUSH`) for future cherry-picks.
- **MIT license** preserved; `NOTICE` added with attribution.
- **Packages renamed:** `@siteping/{core,widget,adapter-prisma,adapter-memory,adapter-localstorage,cli}` → `@colaborate/*`, plus `@colaborate/demo` app.
- **Public API renames** (with deprecated aliases kept for one transition release):
  - `initSiteping` → `initColaborate`
  - `createSitepingHandler` → `createColaborateHandler`
  - `SitepingConfig/Instance/Store/PublicEvents` → `Colaborate*`
- **Data-model symbols renamed in code only** (DB migration lands in Phase 1): `SITEPING_MODELS` → `COLABORATE_MODELS`, `SitepingFeedback/Annotation` → `Colaborate*`, Prisma accessor `prisma.sitepingFeedback` → `prisma.colaborateFeedback`.
- **Runtime renames:** custom element `siteping-widget` → `colaborate-widget`; CLI bin `siteping` → `colaborate`; API route `/api/siteping` → `/api/colaborate`; localStorage keys `siteping_* → colaborate_*`; env var `SITEPING_API_KEY` → `COLABORATE_API_KEY`.
- **All package versions reset to `0.0.0`**; release-please manifest reset.

### Verified green

- `bun run build` → 7/7 packages build (17.3 s)
- `bun run test:run` → **780 / 780 unit tests pass** (36 files)
- `bun run test:e2e` → **85 / 85 Playwright tests pass**, 2 skipped (touch annotation, mobile-only — same skip as upstream)
- `bun run lint` → biome clean (146 files)

### Infra fixes applied during Phase 0

1. **Node 25 / jsdom conflict.** Node 25 ships an experimental Web Storage API that injects a stub `globalThis.localStorage` with no methods, shadowing jsdom's real `Storage`. Broke 33 localStorage tests. Fix: `NODE_OPTIONS=--no-experimental-webstorage` prepended to `test`, `test:run`, and `test:e2e` scripts in root `package.json`. This lets jsdom's Storage shim take precedence.
2. **jsdom version pin.** Caret `^29.0.1` resolved to `29.0.2` on first install; pinned to exact `29.0.1` to match what upstream CI was passing against.

## Outstanding items (open questions / decisions you'll want to weigh in on)

### 1. GitHub repo creation

Nothing on GitHub yet. When ready:

```bash
cd /Users/brian/dev/colaborate
gh repo create develotype/colaborate --public --source=. --description "Client feedback overlay with MCP-driven fix loop. Forked from NeosiaNexus/SitePing."
git push -u origin main --tags
```

The package.json repository URLs already point at `https://github.com/develotype/colaborate.git`. If the org/name should be different, a targeted sed will fix it.

### 2. `apps/demo` marketing copy

The demo site (`apps/demo/`) still contains SitePing's marketing pitch lightly rebranded — "Client feedback, pinned to the pixel," the comparison table, FAQ, etc. Branding tokens are fully swept, but the positioning still reads like SitePing (not wrong, just not our specific MCP angle yet). Left intentionally for Phase 7 when we rewrite around the MCP / Parkland story.

### 3. Package name on npm

`@colaborate` is an npm scope that may be taken. We haven't tried to publish yet. If the scope is unavailable, alternatives: `@develotype/colaborate-*`, `@colaborate-tools/*`, etc.

### 4. Upstream bug fix cherry-picks

Upstream SitePing is releasing weekly (widget-v0.9.5 dates from 2026-04-05, with churn since). A merge strategy note is in the spec under "Known risks." We don't auto-pull; we cherry-pick fixes we want.

## Next up — Phase 1

Schema migration + 5 new shape primitives (circle / arrow / line / text box / freehand). Plan to be written as `docs/superpowers/plans/2026-04-19-phase-1-schema-and-shapes.md` when you're ready to start — I didn't jump ahead since the Geometry-union schema work is TDD-heavy and benefits from a fresh Plan + Execute cycle with your review in between.

## How to pick this up

```bash
cd /Users/brian/dev/colaborate
git log --oneline             # see the single fork commit + tag
bun install                    # already done; re-run if deps drift
bun run test:run               # 780 passing
bun run test:e2e               # 85 passing
```

Spec + plan locations:
- `docs/superpowers/specs/2026-04-18-colaborate-design.md`
- `docs/superpowers/plans/2026-04-18-phase-0-fork-and-rebrand.md`

## Files modified / created today

- 243 files committed (full SitePing checkout + rebrand diffs + our spec/plan/NOTICE/README)
- Single commit `e656ff4` tagged `v0.0.0-fork`

---

*Report generated autonomously during a user-away session. No blocking issues encountered after the Node 25 fix.*
