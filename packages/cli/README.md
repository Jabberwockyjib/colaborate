[![npm version](https://img.shields.io/npm/v/@colaborate/cli)](https://www.npmjs.com/package/@colaborate/cli)
[![Live Demo](https://img.shields.io/badge/demo-try%20it%20live-22c55e)](https://colaborate.develotype.com/demo)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)

# @colaborate/cli

CLI tool to set up [Colaborate](https://github.com/NeosiaNexus/Colaborate) in your project — scaffolds Prisma schema and API routes.

Part of the [@colaborate](https://github.com/develotype/colaborate) monorepo — **[try the live demo](https://colaborate.develotype.com/demo)**.

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

## Related Packages

| Package | Description |
|---------|-------------|
| [`@colaborate/widget`](https://www.npmjs.com/package/@colaborate/widget) | Browser feedback widget |
| [`@colaborate/adapter-prisma`](https://www.npmjs.com/package/@colaborate/adapter-prisma) | Server-side Prisma adapter |
| [`@colaborate/adapter-memory`](https://www.npmjs.com/package/@colaborate/adapter-memory) | In-memory adapter (testing, demos) |
| [`@colaborate/adapter-localstorage`](https://www.npmjs.com/package/@colaborate/adapter-localstorage) | Client-side localStorage adapter |

## License

[MIT](https://github.com/NeosiaNexus/Colaborate/blob/main/LICENSE)
