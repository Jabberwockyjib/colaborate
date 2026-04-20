# @colaborate/core

**Internal package** -- shared types and schema definitions for all `@colaborate/*` packages.

Part of the [@colaborate](https://github.com/develotype/colaborate) monorepo.

## Internal Package

This package is `private: true` and is **never published to npm**. It exports raw TypeScript (no build step) and is bundled directly into consumers via `noExternal: ["@colaborate/core"]` in their tsup config.

This makes `@colaborate/core` the **single source of truth** for:

- All shared TypeScript types
- The Prisma model definitions used by the CLI to generate schemas
- Store error classes and type guards
- Shared adapter helpers
- Conformance test suite for adapter authors

## Main Exports

### Types

| Type | Description |
|------|-------------|
| `ColaborateConfig` | Widget initialization options (endpoint, projectName, position, accentColor, events) |
| `ColaborateInstance` | Return value of `initColaborate()` — contains `destroy()` |
| `FeedbackType` | `'question' \| 'change' \| 'bug' \| 'other'` |
| `FeedbackStatus` | `'draft' \| 'open' \| 'triaged' \| 'resolved'` |
| `FeedbackPayload` | Shape of the POST request body sent by the widget |
| `FeedbackResponse` | Shape of feedback objects returned by the API |
| `AnnotationPayload` | Annotation data sent with a feedback (anchor + rect + viewport) |
| `AnnotationResponse` | Annotation as returned by the API |
| `AnchorData` | Multi-selector anchoring data (CSS selector, XPath, text snippet, fingerprint) |
| `RectData` | Percentage-relative rectangle within the anchor element |
| `FieldDef` | Schema field definition used by `COLABORATE_MODELS` |

### Adapter Pattern

| Export | Description |
|--------|-------------|
| `ColaborateStore` | Abstract store interface — 10 methods that every adapter implements (6 feedback + 4 session) |
| `StoreNotFoundError` | Error class for missing records (update/delete) |
| `StoreDuplicateError` | Error class for duplicate `clientId` |
| `isStoreNotFound(err)` | Type guard — detects `StoreNotFoundError` and Prisma P2025 |
| `isStoreDuplicate(err)` | Type guard — detects `StoreDuplicateError` and Prisma P2002 |
| `flattenAnnotation(payload)` | Convert nested `AnnotationPayload` to flat `AnnotationCreateInput` |

### Testing (`@colaborate/core/testing`)

| Export | Description |
|--------|-------------|
| `testColaborateStore(factory)` | Conformance test suite — runs 39 tests against any `ColaborateStore` implementation (22 feedback + 17 Phase 1b session/extended-field tests) |

### Schema

| Export | Description |
|--------|-------------|
| `COLABORATE_MODELS` | TypeScript representation of the Prisma models (`ColaborateFeedback`, `ColaborateAnnotation`). Used by the CLI to generate and sync the actual `.prisma` schema. |

## How It's Consumed

```ts
// In tsup.config.ts of widget, adapter-prisma, or cli:
export default defineConfig({
  noExternal: ["@colaborate/core"],
  // ...
})
```

This inlines the raw TS exports at build time -- no separate build step needed for core.

## License

[MIT](https://github.com/NeosiaNexus/Colaborate/blob/main/LICENSE)
