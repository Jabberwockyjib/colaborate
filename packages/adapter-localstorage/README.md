[![npm version](https://img.shields.io/npm/v/@colaborate/adapter-localstorage)](https://www.npmjs.com/package/@colaborate/adapter-localstorage)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)

# @colaborate/adapter-localstorage

Client-side localStorage adapter for [Colaborate](https://github.com/NeosiaNexus/Colaborate) — feedback persistence without a server.

Part of the [@colaborate](https://github.com/develotype/colaborate) monorepo.

## Install

```bash
npm install @colaborate/adapter-localstorage
```

## Usage

Pass the store directly to the widget — no server needed:

```ts
import { initColaborate } from '@colaborate/widget'
import { LocalStorageStore } from '@colaborate/adapter-localstorage'

const store = new LocalStorageStore()

initColaborate({
  store,
  projectName: 'my-project',
})
```

Feedback persists across page reloads via `localStorage`. Data is scoped to the current origin.

## API

### `new LocalStorageStore(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `key` | `string` | `'colaborate_feedbacks'` | localStorage key for data persistence |

### `store.clear()`

Remove all data from localStorage for this store key.

## Use Cases

- **Demo pages** — static pages with feedback persistence, zero server
- **Prototyping** — test the widget without setting up a database
- **Offline-first** — feedback stored locally, synced later

## Edge Cases

- **localStorage full** — writes are silently dropped (best-effort persistence)
- **Corrupted data** — returns empty array, does not throw
- **Multiple stores** — use different `key` values for isolation

## Related Packages

| Package | Description |
|---------|-------------|
| [`@colaborate/widget`](https://www.npmjs.com/package/@colaborate/widget) | Browser feedback widget |
| [`@colaborate/adapter-prisma`](https://www.npmjs.com/package/@colaborate/adapter-prisma) | Server-side Prisma adapter |
| [`@colaborate/adapter-memory`](https://www.npmjs.com/package/@colaborate/adapter-memory) | In-memory adapter (testing, demos) |
| [`@colaborate/cli`](https://www.npmjs.com/package/@colaborate/cli) | CLI for project setup |

## License

[MIT](https://github.com/NeosiaNexus/Colaborate/blob/main/LICENSE)
