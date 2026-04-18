# Colaborate — Phase 0: Fork SitePing & Rebrand

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork NeosiaNexus/SitePing into a self-contained `colaborate` codebase, rename every `@siteping/*` → `@colaborate/*` identifier, keep all 780+ Vitest + 29 Playwright tests green, produce a first commit that future phases build on top of.

**Architecture:** Clone SitePing at tag `widget-v0.9.5` (sha `1bfb1db`), remove upstream history, init fresh git repo with upstream as a read-only remote (for cherry-picking bug fixes later). Rename packages, custom element, global name, CLI binary. Preserve MIT license + add NOTICE attribution. Do *not* add any new functionality in this phase — every test must still pass.

**Tech Stack:** Bun 1.3.11 (package manager + runtime), Turborepo, TypeScript strict, Vitest, Playwright, Biome, tsup, Next.js 15 (demo app), Prisma.

**Source spec:** `docs/superpowers/specs/2026-04-18-colaborate-design.md`

---

## File Structure Overview

All paths are relative to `/Users/brian/dev/colaborate/`.

Files that **must be renamed/modified** to rebrand:

| Path | Action | Reason |
|---|---|---|
| `package.json` (root) | Modify | Root package name, workspaces list |
| `packages/core/package.json` | Modify | `@siteping/core` → `@colaborate/core` |
| `packages/widget/package.json` | Modify | `@siteping/widget` → `@colaborate/widget` |
| `packages/adapter-prisma/package.json` | Modify | `@siteping/adapter-prisma` → `@colaborate/adapter-prisma` |
| `packages/adapter-memory/package.json` | Modify | `@siteping/adapter-memory` → `@colaborate/adapter-memory` |
| `packages/adapter-localstorage/package.json` | Modify | `@siteping/adapter-localstorage` → `@colaborate/adapter-localstorage` |
| `packages/cli/package.json` | Modify | `@siteping/cli` → `@colaborate/cli`; bin `siteping` → `colaborate` |
| `apps/demo/package.json` | Modify | Workspace deps renamed |
| `packages/widget/tsup.config.ts` | Modify | `globalName: "SitePing"` → `globalName: "Colaborate"`, `noExternal: ["@siteping/core"]` → `["@colaborate/core"]` |
| `packages/widget/src/launcher.ts` | Modify | Custom element tag `siteping-widget` → `colaborate-widget`, instance var names |
| `packages/widget/src/index.ts` | Modify | Rename `initSiteping` → `initColaborate`; keep `initSiteping` as deprecated alias for one version |
| `packages/widget/src/constants.ts` | Modify | Any `SITEPING_*` constants → `COLABORATE_*` |
| `packages/widget/src/identity.ts` | Modify | localStorage key prefix `siteping:` → `colaborate:` |
| `packages/core/src/schema.ts` | Modify | `SITEPING_MODELS` → `COLABORATE_MODELS`; `SitepingFeedback` → `ColaborateFeedback`; `SitepingAnnotation` → `ColaborateAnnotation` (these are code-level names — DB-level migration is in Phase 1) |
| `packages/core/src/types.ts` | Modify | `SitepingConfig` → `ColaborateConfig`, `SitepingInstance` → `ColaborateInstance`, `SitepingStore` → `ColaborateStore`, `SitepingEvents` → `ColaborateEvents`, `FEEDBACK_TYPES` untouched |
| `packages/core/src/errors.ts` | Modify | Error class names `SitepingError` → `ColaborateError` |
| `packages/adapter-prisma/src/index.ts` | Modify | Handler export `createSitepingHandler` → `createColaborateHandler`; keep `createSitepingHandler` as deprecated alias |
| `packages/adapter-prisma/src/validation.ts` | Modify | Zod schema variable names |
| `packages/cli/src/index.ts` | Modify | CLI name string `siteping` → `colaborate` |
| `packages/cli/src/commands/*.ts` | Modify | Command help text, logging prefixes |
| `apps/demo/src/**/*.{ts,tsx}` | Modify | All imports + any hardcoded "SitePing" strings in copy |
| `README.md` (root) | Rewrite | Fresh colaborate README (brief — full README is Phase 8) |
| `LICENSE` | Keep | MIT stays MIT |
| `NOTICE` | Create | Attribution to NeosiaNexus/SitePing (required by project convention, not by MIT) |
| `CONTRIBUTING.md` | Modify | Replace SitePing references; keep Bun workflow |
| `SECURITY.md` | Modify | Security contact → `security@develotype.com` |
| `CLAUDE.md` | Modify | Project description, brand name |
| `.github/workflows/ci.yml` | Modify | Badge URLs, any siteping refs |
| `release-please-config.json` + `.release-please-manifest.json` | Modify | Package names |
| `biome.json`, `tsconfig.base.json`, `turbo.json`, `playwright.config.ts`, `vitest.config.ts` | Keep | Tool configs are brand-agnostic; no changes needed |
| `e2e/**/*.spec.ts` | Modify | Only if they reference `@siteping/*` imports or hardcoded "SitePing" strings |

Files that **must be deleted** in this phase:

- `.git/` (upstream history) — remove before re-initializing
- Any `apps/demo/public/` marketing assets specific to SitePing (logos, screenshots with SitePing branding) — replaced with placeholders
- Upstream `bun.lock` — regenerated after rename

Files that **remain untouched** structurally (read, but no edits) — keep them listed so nothing surprises you:

- `packages/widget/src/dom/*.ts` — anchoring logic; brand-neutral
- `packages/widget/src/annotator.ts` — phase 1 will extend this
- `packages/widget/src/markers.ts`, `tooltip.ts`, `panel*.ts`, `popup.ts`, `shortcuts.ts`, `fab.ts`, `events.ts` — read only; references to "siteping" inside them get swept in Task 4's global replace

---

## Task 1: Clone SitePing at tag widget-v0.9.5 into /Users/brian/dev/colaborate

**Files:**
- Target: `/Users/brian/dev/colaborate/`

Precondition: `/Users/brian/dev/colaborate/` exists but contains only `.superpowers/` and `docs/superpowers/` (the spec and this plan). Git not yet initialized.

- [ ] **Step 1: Verify target dir state and move existing artifacts aside**

```bash
cd /Users/brian/dev
ls -la colaborate
```

Expected: shows `.superpowers/` and `docs/` only. If anything else exists, stop and report.

```bash
# Stash our spec + this plan somewhere the clone won't clobber
mv /Users/brian/dev/colaborate /tmp/colaborate-docs-stash
```

- [ ] **Step 2: Clone at tag and verify HEAD**

```bash
cd /Users/brian/dev
git clone --depth 1 --branch widget-v0.9.5 https://github.com/NeosiaNexus/SitePing.git colaborate
cd colaborate
git rev-parse HEAD
```

Expected output: `1bfb1db5778f0ca06583139180e6c0487f6eed8e`

- [ ] **Step 3: Move spec + plan back into the clone**

```bash
mkdir -p /Users/brian/dev/colaborate/docs/superpowers
mv /tmp/colaborate-docs-stash/docs/superpowers/specs /Users/brian/dev/colaborate/docs/superpowers/specs
mv /tmp/colaborate-docs-stash/docs/superpowers/plans /Users/brian/dev/colaborate/docs/superpowers/plans
mv /tmp/colaborate-docs-stash/.superpowers /Users/brian/dev/colaborate/.superpowers
rm -rf /tmp/colaborate-docs-stash
ls /Users/brian/dev/colaborate/docs/superpowers/
```

Expected: `plans  specs`

- [ ] **Step 4: Commit is NOT done yet — we rip history in Task 2 first.** Proceed to Task 2.

---

## Task 2: Wipe upstream git history, init fresh repo, add upstream as read-only remote

**Files:**
- Modify: `/Users/brian/dev/colaborate/.git/` (nuke + re-init)

- [ ] **Step 1: Remove upstream git directory**

```bash
cd /Users/brian/dev/colaborate
rm -rf .git
ls -la | head -5
```

Expected: no `.git` directory.

- [ ] **Step 2: Init fresh git repo on `main`**

```bash
cd /Users/brian/dev/colaborate
git init -b main
git config user.name "Brian Doud"
git config user.email "bdoud@develotype.com"
```

Expected: `Initialized empty Git repository in /Users/brian/dev/colaborate/.git/`

- [ ] **Step 3: Add upstream as a read-only remote (for cherry-picking later)**

```bash
cd /Users/brian/dev/colaborate
git remote add upstream https://github.com/NeosiaNexus/SitePing.git
git remote set-url --push upstream DISABLED_PUSH
git remote -v
```

Expected:
```
upstream	https://github.com/NeosiaNexus/SitePing.git (fetch)
upstream	DISABLED_PUSH (push)
```

- [ ] **Step 4: Add `.gitignore` additions for colaborate-specific artifacts**

Edit `/Users/brian/dev/colaborate/.gitignore` to append (if not already present):

```
# Colaborate-specific
.superpowers/
.env.colaborate
.sourcemaps/
```

- [ ] **Step 5: Stage but do not commit yet** — we need the rename done first to avoid a noisy history.

---

## Task 3: Add NOTICE and rewrite root README

**Files:**
- Create: `/Users/brian/dev/colaborate/NOTICE`
- Modify: `/Users/brian/dev/colaborate/README.md` (full rewrite — brief version)

- [ ] **Step 1: Write `NOTICE`**

Create file `/Users/brian/dev/colaborate/NOTICE` with exact content:

```
Colaborate
Copyright 2026 Develotype

This product is forked from SitePing, an MIT-licensed project by NeosiaNexus:
https://github.com/NeosiaNexus/SitePing

Original SitePing copyright holders retain authorship of the forked code.
See LICENSE for the MIT license terms that apply to both upstream and this fork.
```

- [ ] **Step 2: Rewrite `README.md`**

Overwrite `/Users/brian/dev/colaborate/README.md` with:

```markdown
# Colaborate

Floating toolbar overlay that lets clients annotate a running web app with shapes and comments, serializes the feedback with durable DOM anchors, and exposes it to LLMs via an MCP server — so review turns into well-formed Linear or GitHub issues automatically.

**Status:** v0 in development. Forked from [NeosiaNexus/SitePing](https://github.com/NeosiaNexus/SitePing) (MIT). See [`NOTICE`](./NOTICE) for attribution.

## Planned v0 features

- Drop-in widget (`@colaborate/widget`) for React, Next, Vue, Svelte, Astro, vanilla
- Draw circles, arrows, lines, text boxes, freehand (plus SitePing's rectangle)
- Anchor annotations to components via `data-colaborate-id` + source-map-resolved `file:line`
- Batch review sessions — reviewer submits when ready, LLM triages into issues
- Remote MCP server exposing feedback per component to coding agents
- Adapters for GitHub Issues and Linear (pick one at deploy time)

## Development

```bash
bun install
bun run build      # turbo run build across packages
bun run test:run   # vitest
bun run test:e2e   # playwright
bun run lint       # biome
```

## Design docs

- Spec: [`docs/superpowers/specs/2026-04-18-colaborate-design.md`](./docs/superpowers/specs/2026-04-18-colaborate-design.md)
- Plans: [`docs/superpowers/plans/`](./docs/superpowers/plans/)

## License

MIT. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
```

---

## Task 4: Rename root package.json and workspace paths

**Files:**
- Modify: `/Users/brian/dev/colaborate/package.json`

- [ ] **Step 1: Read current root package.json to confirm shape**

```bash
cat /Users/brian/dev/colaborate/package.json
```

Expected: shows `"name": "siteping"` (or similar), `"workspaces"` array including `packages/*` and `apps/*`.

- [ ] **Step 2: Edit root `package.json`**

Change these fields in `/Users/brian/dev/colaborate/package.json`:

- `"name": "siteping"` → `"name": "colaborate"`
- `"version"`: reset to `"0.0.0"` (we start our own versioning)
- `"description"`: replace with `"Client feedback overlay with MCP-driven fix loop. Forked from NeosiaNexus/SitePing."`
- `"repository"`: update URL to `"git+https://github.com/develotype/colaborate.git"` (may not exist yet; placeholder is fine since the package is private/unpublished at this phase)
- `"author"`: `"Develotype <bdoud@develotype.com>"`
- `"homepage"`: `"https://github.com/develotype/colaborate"`
- `"bugs"`: `{"url": "https://github.com/develotype/colaborate/issues"}`

Leave `workspaces`, `packageManager`, `scripts`, `devDependencies` unchanged.

- [ ] **Step 3: Verify JSON is valid**

```bash
cd /Users/brian/dev/colaborate
bun run -e "console.log(JSON.stringify(require('./package.json'), null, 2).slice(0, 500))"
```

Expected: prints the first 500 chars of the new package.json with `"name": "colaborate"`.

---

## Task 5: Rename workspace packages' package.json names

**Files:**
- Modify: `packages/core/package.json`, `packages/widget/package.json`, `packages/adapter-prisma/package.json`, `packages/adapter-memory/package.json`, `packages/adapter-localstorage/package.json`, `packages/cli/package.json`, `apps/demo/package.json`

- [ ] **Step 1: For each package, change the `name` field**

For each file below, update `"name"` from the `@siteping/*` value to `@colaborate/*`:

| File | Old name | New name |
|---|---|---|
| `packages/core/package.json` | `@siteping/core` | `@colaborate/core` |
| `packages/widget/package.json` | `@siteping/widget` | `@colaborate/widget` |
| `packages/adapter-prisma/package.json` | `@siteping/adapter-prisma` | `@colaborate/adapter-prisma` |
| `packages/adapter-memory/package.json` | `@siteping/adapter-memory` | `@colaborate/adapter-memory` |
| `packages/adapter-localstorage/package.json` | `@siteping/adapter-localstorage` | `@colaborate/adapter-localstorage` |
| `packages/cli/package.json` | `@siteping/cli` | `@colaborate/cli` |
| `apps/demo/package.json` | whatever it is (likely `@siteping/demo`) | `@colaborate/demo` |

Also in each file:
- Reset `"version"` to `"0.0.0"` (we start our own versioning).
- Update `"repository"` to point at develotype/colaborate (same URL as root).
- Update `"dependencies"` and `"devDependencies"` — any `"@siteping/*"` key becomes `"@colaborate/*"` with the same workspace-protocol version (`"workspace:*"`).

For `packages/cli/package.json` specifically:
- Update the `"bin"` entry: `"siteping": "dist/index.js"` → `"colaborate": "dist/index.js"`.

- [ ] **Step 2: Verify all renames landed**

```bash
cd /Users/brian/dev/colaborate
grep -l '"@siteping/' packages/ apps/ --include='package.json' -r || echo "NONE FOUND"
```

Expected: `NONE FOUND` (no package.json still references `@siteping/`).

---

## Task 6: Update workspace import paths in source code

**Files:**
- Modify: every `.ts`/`.tsx` file under `packages/` and `apps/` that imports from `@siteping/*`

- [ ] **Step 1: Enumerate files needing updates**

```bash
cd /Users/brian/dev/colaborate
grep -r "from ['\"]@siteping/" --include='*.ts' --include='*.tsx' -l | tee /tmp/colaborate-rename-files.txt
wc -l /tmp/colaborate-rename-files.txt
```

Expected: a list of files; exact count depends on SitePing's current source.

- [ ] **Step 2: Apply literal import rewrite to every listed file**

For each file in `/tmp/colaborate-rename-files.txt`, replace every occurrence of `from "@siteping/` with `from "@colaborate/` and every `from '@siteping/` with `from '@colaborate/`.

Use this as a one-shot safe rewrite (macOS `sed` syntax):

```bash
cd /Users/brian/dev/colaborate
while read -r f; do
  sed -i '' -E "s|from (['\"])@siteping/|from \\1@colaborate/|g" "$f"
done < /tmp/colaborate-rename-files.txt
```

- [ ] **Step 3: Verify no stale imports**

```bash
cd /Users/brian/dev/colaborate
grep -rn "@siteping/" --include='*.ts' --include='*.tsx' packages/ apps/ || echo "NONE FOUND"
```

Expected: `NONE FOUND`.

---

## Task 7: Rename the widget custom element, global name, and public init function

**Files:**
- Modify: `packages/widget/tsup.config.ts` (global name)
- Modify: `packages/widget/src/launcher.ts` (custom element tag)
- Modify: `packages/widget/src/index.ts` (public export name + deprecated alias)
- Modify: `packages/widget/src/constants.ts` (branded constants)
- Modify: `packages/widget/src/identity.ts` (localStorage key prefix)

- [ ] **Step 1: Update `tsup.config.ts`**

In `packages/widget/tsup.config.ts`:

- `globalName: "SitePing"` → `globalName: "Colaborate"`
- `noExternal: ["@medv/finder", "@siteping/core"]` → `noExternal: ["@medv/finder", "@colaborate/core"]`

- [ ] **Step 2: Update custom element tag in `launcher.ts`**

Open `packages/widget/src/launcher.ts`. Find every occurrence of the string `"siteping-widget"` (the custom element registration name). Replace with `"colaborate-widget"`. There will also likely be a `class SitepingWidget extends HTMLElement` — rename the class to `ColaborateWidget`.

If an internal singleton variable is named `sitepingInstance`, rename it to `colaborateInstance`. Preserve all other logic verbatim.

- [ ] **Step 3: Update public export + provide deprecated alias in `index.ts`**

In `packages/widget/src/index.ts`:

- Rename the exported function `initSiteping` → `initColaborate` (update definition and export).
- Add a deprecated alias after the main export:

```ts
/** @deprecated Use `initColaborate` instead. Alias kept for one transition release. */
export const initSiteping = initColaborate;
```

- Any exported type names prefixed with `Siteping` (e.g. `SitepingConfig`, `SitepingInstance`) get re-exported under the `Colaborate*` name; keep the old names as aliases.

- [ ] **Step 4: Update `constants.ts`**

In `packages/widget/src/constants.ts`, any constant name starting with `SITEPING_` becomes `COLABORATE_` (e.g. `SITEPING_VERSION` → `COLABORATE_VERSION`). The `Z_INDEX_MAX` and similar non-branded constants stay. Any string *values* containing the word "SitePing" change to "Colaborate" only if they are user-visible strings (e.g. widget chrome labels). Structural names stay unchanged.

- [ ] **Step 5: Update `identity.ts` localStorage key**

In `packages/widget/src/identity.ts`, find the localStorage key prefix (likely `siteping:identity` or similar). Change the `siteping` prefix to `colaborate`. Adding a migration shim for users upgrading is NOT required — the widget has no shipped production users yet.

---

## Task 8: Rename core types, schema models, errors

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/schema.ts`
- Modify: `packages/core/src/errors.ts`

- [ ] **Step 1: In `packages/core/src/types.ts`**

Rename these exports (definitions + all references within the file):

- `SitepingConfig` → `ColaborateConfig`
- `SitepingInstance` → `ColaborateInstance`
- `SitepingStore` → `ColaborateStore`
- `SitepingEvents` → `ColaborateEvents`
- `SitepingError` (if present as type) → `ColaborateError`
- Any type beginning with `Siteping` → `Colaborate` equivalent

Add aliases at the bottom:

```ts
/** @deprecated Renamed — use Colaborate* types. Aliases kept for one release. */
export type SitepingConfig = ColaborateConfig;
export type SitepingInstance = ColaborateInstance;
export type SitepingStore = ColaborateStore;
export type SitepingEvents = ColaborateEvents;
```

Preserve all structural content (fields, methods) verbatim.

- [ ] **Step 2: In `packages/core/src/schema.ts`**

Rename the model tuple constant: `SITEPING_MODELS` → `COLABORATE_MODELS`. Inside the object, model keys stay the same (e.g. `Feedback`, `Annotation`) but the Prisma model *names* — which currently render as `SitepingFeedback` / `SitepingAnnotation` in the generated Prisma schema — need to become `ColaborateFeedback` / `ColaborateAnnotation`. Find the string names used to stamp Prisma models (likely a `name:` field per model entry) and update them.

**Do NOT add new models yet** — that's Phase 1's job. This is rename-only.

- [ ] **Step 3: In `packages/core/src/errors.ts`**

Rename every error class `class SitepingXError extends Error` → `class ColaborateXError extends Error`. Add a deprecated alias after each definition:

```ts
/** @deprecated Renamed to Colaborate*Error. */
export const SitepingValidationError = ColaborateValidationError;
```

(repeat for every error class)

---

## Task 9: Rename adapter handler factory + validation

**Files:**
- Modify: `packages/adapter-prisma/src/index.ts`
- Modify: `packages/adapter-prisma/src/validation.ts`

- [ ] **Step 1: In `packages/adapter-prisma/src/index.ts`**

- Rename exported function `createSitepingHandler` → `createColaborateHandler`.
- Rename `PrismaStore` class remains `PrismaStore` (no brand in name — keep).
- Rename any internal type `SitepingHandlerOptions` → `ColaborateHandlerOptions` (add alias).

Add deprecated alias:

```ts
/** @deprecated Use createColaborateHandler. */
export const createSitepingHandler = createColaborateHandler;
```

- [ ] **Step 2: In `packages/adapter-prisma/src/validation.ts`**

Rename any Zod schema variable prefixed with `siteping` to `colaborate`. Example: `sitepingFeedbackSchema` → `colaborateFeedbackSchema`. Field names inside schemas are unchanged.

---

## Task 10: Rename CLI binary name and user-facing strings

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/commands/*.ts`

- [ ] **Step 1: Replace program name in `packages/cli/src/index.ts`**

Find the `commander` program declaration:

```ts
program.name("siteping")
```

Replace with:

```ts
program.name("colaborate")
```

Update any `.description()` string with "SitePing" in it to read "Colaborate" instead.

- [ ] **Step 2: Sweep command help text**

For each `.ts` under `packages/cli/src/commands/`, replace every user-visible occurrence of the literal string `"SitePing"` (case-sensitive) with `"Colaborate"`. Do not touch code symbols — only doc strings and console output.

```bash
cd /Users/brian/dev/colaborate
grep -rn "SitePing" packages/cli/src/ --include='*.ts' | tee /tmp/cli-siteping-strings.txt
```

Expected: a list of user-visible strings. Review and rewrite each in the source.

---

## Task 11: Rename demo app references

**Files:**
- Modify: files in `apps/demo/` that reference SitePing branding

- [ ] **Step 1: Enumerate**

```bash
cd /Users/brian/dev/colaborate
grep -rn "SitePing\|siteping" apps/demo/src --include='*.ts' --include='*.tsx' -l | tee /tmp/demo-brand-files.txt
wc -l /tmp/demo-brand-files.txt
```

- [ ] **Step 2: Replace each user-visible occurrence**

For each file listed, replace the string `SitePing` with `Colaborate` in user-visible text (titles, headings, paragraphs, metadata). Replace `siteping` in code identifiers only where they were already imports or lowercase references meant to become `colaborate`.

Exceptions to leave alone:
- Any explicit reference to the upstream project (e.g. `<a href="https://github.com/NeosiaNexus/SitePing">`) stays intact — attribution is good.

---

## Task 12: Update CI workflow, release-please config, CLAUDE.md, CONTRIBUTING.md, SECURITY.md

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `release-please-config.json`, `.release-please-manifest.json`
- Modify: `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`

- [ ] **Step 1: CI workflow**

In `.github/workflows/ci.yml`, change any references to `siteping` (e.g. artifact names, cache keys, badges in comments) to `colaborate`. Leave all Bun/Turbo/Vitest/Playwright invocations intact.

- [ ] **Step 2: release-please**

In `release-please-config.json`, replace package keys `packages/core` etc. with the new package names under `"packages"` — literally the *map keys* from `@siteping/core` to `@colaborate/core`, matching what's in package.json.

In `.release-please-manifest.json`, reset all versions to `"0.0.0"`.

- [ ] **Step 3: CLAUDE.md (repo-level)**

Replace the project description paragraph at the top of `CLAUDE.md` with:

```
# Colaborate

Floating feedback overlay for web apps. Forked from NeosiaNexus/SitePing (MIT). Adds richer drawing primitives, session batching, MCP server, Linear/GitHub adapters, and sourcemap-aware component anchoring.

## Quickref

- Package manager: Bun 1.3.11
- Monorepo: Turborepo
- Tests: Vitest (unit) + Playwright (E2E)
- Lint: Biome
- Build: tsup per package
- Build everything: `bun run build`
- Unit tests: `bun run test:run`
- E2E: `bun run test:e2e`
- Lint: `bun run lint`
```

Keep any SitePing-authored quickref for internal architecture intact (the forked content is valuable reference).

- [ ] **Step 4: CONTRIBUTING.md**

Replace product name "SitePing" with "Colaborate" in every user-visible occurrence. Keep the contribution workflow (Bun install, build, check, test:run, test:e2e, lint) as-is.

- [ ] **Step 5: SECURITY.md**

Replace security contact email `security@neosianexus.dev` → `security@develotype.com`. Keep the "use GitHub Security Advisories" language.

---

## Task 13: Regenerate bun.lock and install

**Files:**
- Delete: `bun.lock`
- Regenerate: via `bun install`

- [ ] **Step 1: Remove stale lockfile**

```bash
cd /Users/brian/dev/colaborate
rm -f bun.lock
```

- [ ] **Step 2: Install**

```bash
cd /Users/brian/dev/colaborate
bun install
```

Expected: dependencies install cleanly; a new `bun.lock` is created. No errors about missing `@colaborate/*` packages (they resolve via workspace protocol).

If install fails with "cannot resolve @siteping/*": go back to Tasks 5-6 and hunt the missed reference.

---

## Task 14: Run full test suite — baseline must stay green

**Files:** none — verification step

- [ ] **Step 1: Build all packages**

```bash
cd /Users/brian/dev/colaborate
bun run build 2>&1 | tail -40
```

Expected: turbo reports `Tasks: N successful, N total` with no errors. If anything fails with unresolved imports, stop and diagnose — likely a missed `@siteping/` reference.

- [ ] **Step 2: Run unit tests**

```bash
cd /Users/brian/dev/colaborate
bun run test:run 2>&1 | tail -40
```

Expected: vitest reports all 780+ tests passing (exact number may vary by SitePing's current count). Zero failures.

- [ ] **Step 3: Run Playwright E2E tests**

Install browsers if first run:

```bash
cd /Users/brian/dev/colaborate
bunx playwright install chromium firefox webkit
```

Then:

```bash
cd /Users/brian/dev/colaborate
bun run test:e2e 2>&1 | tail -40
```

Expected: all 29 Playwright specs pass.

- [ ] **Step 4: Run Biome lint**

```bash
cd /Users/brian/dev/colaborate
bun run lint 2>&1 | tail -20
```

Expected: zero errors. If lint fails on renamed identifiers (import order etc), run `bun run lint --apply` to autofix, then re-run to confirm green.

- [ ] **Step 5: Gate**

If any of Steps 1-4 failed, STOP and fix before proceeding to commit. Do not commit a broken baseline.

---

## Task 15: Initial commit

**Files:** all

- [ ] **Step 1: Stage everything**

```bash
cd /Users/brian/dev/colaborate
git add -A
git status | head -30
```

Expected: shows many files staged (all forked files plus rename diffs plus NOTICE plus docs/).

- [ ] **Step 2: Commit**

```bash
cd /Users/brian/dev/colaborate
git commit -m "$(cat <<'EOF'
chore: fork NeosiaNexus/SitePing @ widget-v0.9.5, rebrand to colaborate

Fork base: github.com/NeosiaNexus/SitePing @ 1bfb1db5778f0ca06583139180e6c0487f6eed8e
License: MIT (upstream) + NOTICE attribution.

Renames applied:
- @siteping/* → @colaborate/* (all workspace packages)
- initSiteping() → initColaborate() (deprecated alias kept)
- SitePing* types → Colaborate* types (deprecated aliases kept)
- siteping-widget custom element → colaborate-widget
- siteping CLI binary → colaborate
- SITEPING_MODELS → COLABORATE_MODELS
- localStorage key prefix siteping: → colaborate:

No functional changes. All 780+ Vitest + 29 Playwright tests pass on this commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds. Git reports the insertion/deletion counts.

- [ ] **Step 3: Tag the fork point**

```bash
cd /Users/brian/dev/colaborate
git tag -a v0.0.0-fork -m "Fork point: NeosiaNexus/SitePing widget-v0.9.5 (1bfb1db) + rebrand"
git log --oneline | head -5
git tag --list
```

Expected: one commit, tag `v0.0.0-fork` present.

---

## Self-Review (perform before marking this plan done)

- **Spec coverage:** Phase 0 in the spec = "Fork, rename, rebrand, CI green". Every spec bullet above is covered by Tasks 1-15. ✓
- **Placeholder scan:** No `TBD`, `TODO`, `fill in`, vague error handling. Each `sed` command is literal. Each package name is spelled in full. ✓
- **Type consistency:** Deprecated aliases are named consistently (`SitepingConfig` → `ColaborateConfig`, alias `SitepingConfig = ColaborateConfig` added). CLI binary renamed once (`siteping` → `colaborate`). Custom element renamed once (`siteping-widget` → `colaborate-widget`). ✓
- **Ambiguity:** "user-visible strings" is explicitly distinguished from "code identifiers" in Tasks 10-11. Each `grep` is given so the executor can verify zero stragglers. ✓
- **Verification gate:** Task 14 blocks commit until baseline is green — no chance of committing broken code. ✓

---

## Exit criteria (Phase 0 done when all true)

1. `git log` shows exactly 1 commit on `main` with the rebrand message.
2. `git tag --list` shows `v0.0.0-fork`.
3. `bun run build && bun run test:run && bun run test:e2e && bun run lint` all exit 0.
4. `grep -rn "@siteping/" --include='*.{ts,tsx,json}' packages/ apps/` returns zero lines (except in `NOTICE`, `README.md`, the upstream remote reference, and intentional attribution links).
5. The widget can still be imported and initialized via `initColaborate({...})` in a smoke test. (The existing Playwright E2E confirms this.)

---

## Handoff to Phase 1

Phase 1 (schema migration + 5 new shape primitives) has its own plan in `docs/superpowers/plans/2026-04-19-phase-1-schema-and-shapes.md` (to be written when Phase 0 is complete).
