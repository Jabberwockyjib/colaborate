# Colaborate

Floating toolbar overlay that lets clients annotate a running web app with shapes and comments, serializes the feedback with durable DOM anchors, and exposes it to LLMs via an MCP server — so review turns into well-formed Linear or GitHub issues automatically.

**Status:** v0 in development. Forked from [NeosiaNexus/SitePing](https://github.com/NeosiaNexus/SitePing) (MIT). See [`NOTICE`](./NOTICE) for attribution.

## Planned v0 features

- Drop-in widget (`@colaborate/widget`) for React, Next, Vue, Svelte, Astro, vanilla
- Draw circles, arrows, lines, text boxes, freehand (plus Colaborate's rectangle)
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
