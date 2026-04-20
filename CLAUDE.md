# @colaborate/*

## Build & Test
- `bun install` — install dependencies (bun workspaces)
- `bun run build` — build all packages via Turborepo + tsup (cached)
- `bun run check` — TypeScript type-checking via Turborepo (cached)
- `bun run clean` — clean all dist/ directories
- `bun run test` — run tests in watch mode
- `bun run test:run` — run tests once
- `bun run lint` — biome check
- `bun run lint:fix` — biome auto-fix

## Architecture
- **Monorepo** with bun workspaces — 6 packages in `packages/`:
  - `@colaborate/core` — shared types, schema, store errors + helpers (internal, not published)
  - `@colaborate/widget` — browser feedback widget (Shadow DOM, closed mode). Accepts `store` option for client-side mode (no server needed)
  - `@colaborate/adapter-prisma` — server-side Prisma request handlers
  - `@colaborate/adapter-memory` — in-memory adapter (testing, demos, serverless)
  - `@colaborate/adapter-localstorage` — client-side localStorage adapter (demos, prototyping)
  - `@colaborate/cli` — CLI tool for project setup (`colaborate init/sync/status/doctor`)
- Widget uses Shadow DOM (mode: closed), overlay + toolbar + markers live outside Shadow DOM (appended to `document.body`) so they can be queried by E2E tests and natively interact with page coordinates
- DOM anchoring: @medv/finder CSS selector + XPath fallback + text snippet fallback
- Annotations persist as a `Geometry` discriminated union (6 shapes: rectangle / circle / arrow / line / textbox / freehand) stringified as JSON in the `geometry` column. Coordinates are fractions (0..1) of the anchor element's bounding box — see `packages/core/src/geometry.ts` for the canonical types
- Drawing modes live in `packages/widget/src/drawing-modes.ts` (one `DrawingMode` class per shape). Marker highlights render via `packages/widget/src/shape-render.ts`. Draw → persist → replay round-trips through both modules — they must agree on per-shape geometry semantics
- Core is an Internal Package (exports raw TS, no build step), bundled into consumers via `noExternal: ["@colaborate/core"]` in tsup. `perfect-freehand` is similarly bundled into the widget
- Turborepo handles build orchestration, dependency ordering (`^build`), and local caching

## jsdom gotchas (for widget tests)
- jsdom does NOT parse multi-line `element.style.cssText = \`...\`` assignments reliably — individual properties read back as empty strings. **Always use `element.style.prop = "value"` setters** in widget source. Affects: `shape-render.ts`, `drawing-modes.ts`, `shape-picker.ts`. `cssText` is safe in `annotator.ts` and `launcher.ts` because their tests don't assert on individual computed style values.
- `document.body.getBoundingClientRect()` returns zero-sized in jsdom. Tests that exercise the full annotator finish-path can produce NaN geometry from the divide-by-zero. Existing tests only assert `data.annotation` is defined to avoid this. If you need to assert on geometry values, either mock the rect or use E2E (Playwright) coverage.

## Code Style
- TypeScript strict mode with exactOptionalPropertyTypes
- Conventional Commits: `type(scope): description`
- i18n: English (default) and French locales — target audience is French freelance clients
