[![npm version](https://img.shields.io/npm/v/@colaborate/adapter-memory)](https://www.npmjs.com/package/@colaborate/adapter-memory)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)

# @colaborate/adapter-memory

In-memory adapter for [Colaborate](https://github.com/NeosiaNexus/Colaborate) — zero dependencies, works everywhere.

Part of the [@colaborate](https://github.com/develotype/colaborate) monorepo.

## Install

```bash
npm install @colaborate/adapter-memory
```

## Usage

### With the HTTP handler (server-side)

```ts
import { createColaborateHandler } from '@colaborate/adapter-prisma'
import { MemoryStore } from '@colaborate/adapter-memory'

const store = new MemoryStore()

export const { GET, POST, PATCH, DELETE, OPTIONS } = createColaborateHandler({ store })
```

### With the widget directly (client-side, no server)

```ts
import { initColaborate } from '@colaborate/widget'
import { MemoryStore } from '@colaborate/adapter-memory'

const store = new MemoryStore()

initColaborate({
  store,
  projectName: 'my-project',
})
```

## API

### `new MemoryStore()`

Creates a new in-memory store. Data lives in a plain array — lost on process restart.

### `store.clear()`

Remove all data and reset the ID counter.

## Use Cases

- **Testing** — fast, isolated store for unit and integration tests
- **Demos** — lightweight store that needs no database or localStorage
- **Prototyping** — get started without any infrastructure
- **Reference implementation** — simplest possible adapter for contributors

## Creating Your Own Adapter

`MemoryStore` is the simplest reference implementation of the `ColaborateStore` interface. To create a new adapter (e.g. Drizzle, Supabase):

1. Implement the `ColaborateStore` interface (6 methods)
2. Throw `StoreNotFoundError` on missing records in `updateFeedback` / `deleteFeedback`
3. Validate with the conformance test suite:

```ts
import { testColaborateStore } from '@colaborate/core/testing'
import { MyStore } from '../src/index.js'

testColaborateStore(() => new MyStore())
```

## Related Packages

| Package | Description |
|---------|-------------|
| [`@colaborate/widget`](https://www.npmjs.com/package/@colaborate/widget) | Browser feedback widget |
| [`@colaborate/adapter-prisma`](https://www.npmjs.com/package/@colaborate/adapter-prisma) | Server-side Prisma adapter |
| [`@colaborate/adapter-localstorage`](https://www.npmjs.com/package/@colaborate/adapter-localstorage) | Client-side localStorage adapter |
| [`@colaborate/cli`](https://www.npmjs.com/package/@colaborate/cli) | CLI for project setup |

## License

[MIT](https://github.com/NeosiaNexus/Colaborate/blob/main/LICENSE)
