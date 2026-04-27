[![npm version](https://img.shields.io/npm/v/@colaborate/cli)](https://www.npmjs.com/package/@colaborate/cli)
[![Live Demo](https://img.shields.io/badge/demo-try%20it%20live-22c55e)](https://colaborate.develotype.com/demo)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)

# @colaborate/cli

CLI tool to set up [Colaborate](https://github.com/Jabberwockyjib/colaborate) in your project — scaffolds Prisma schema and API routes.

Part of the [@colaborate](https://github.com/Jabberwockyjib/colaborate) monorepo.

## Usage

```bash
npx @colaborate/cli init
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Interactive setup: Prisma schema + API route generation |
| `sync` | Non-interactive Prisma schema sync (CI-friendly) |
| `status` | Diagnostic check of your Colaborate integration |
| `doctor` | Test API endpoint connectivity |
| `upload-sourcemaps` | Upload `.map` files to the ingest endpoint for source-resolved feedback |

### `init`

Walks you through setting up Colaborate:
1. Detects your `prisma/schema.prisma`
2. Merges `ColaborateFeedback` and `ColaborateAnnotation` models (idempotent)
3. Generates the Next.js App Router API route

```bash
npx @colaborate/cli init
npx prisma db push
```

### `sync`

Non-interactive schema sync, useful for CI:

```bash
npx @colaborate/cli sync --schema prisma/schema.prisma
```

### `status`

Checks your integration:

```bash
npx @colaborate/cli status
```

### `doctor`

Tests API connectivity:

```bash
npx @colaborate/cli doctor --url http://localhost:3000
```

### `upload-sourcemaps`

Sentry-style ingest. Uploads every `.map` under `--dir` to the configured Colaborate server, gzipped and hash-verified, so the backend can resolve bundled `line:col` to original `file:line:col` for feedbacks.

```bash
npx @colaborate/cli upload-sourcemaps \
  --project my-app \
  --env staging \
  --dir .next/ \
  --url https://colaborate.example.com
```

Auth: passes `--api-key` or `COLABORATE_API_KEY` env as `Authorization: Bearer …`. Requires the server to have a `sourcemapStore` configured (see [`@colaborate/adapter-prisma`](../adapter-prisma)).

## Related Packages

| Package | Description |
|---------|-------------|
| [`@colaborate/widget`](https://www.npmjs.com/package/@colaborate/widget) | Browser feedback widget |
| [`@colaborate/adapter-prisma`](https://www.npmjs.com/package/@colaborate/adapter-prisma) | Server-side Prisma adapter |
| [`@colaborate/adapter-memory`](https://www.npmjs.com/package/@colaborate/adapter-memory) | In-memory adapter (testing, demos) |
| [`@colaborate/adapter-localstorage`](https://www.npmjs.com/package/@colaborate/adapter-localstorage) | Client-side localStorage adapter |

## License

[MIT](https://github.com/Jabberwockyjib/colaborate/blob/main/LICENSE)
