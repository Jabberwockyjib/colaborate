/**
 * Default cap on the size (in bytes) of an inbound screenshot dataUrl, measured
 * by the length of the base64 portion (the part after `data:image/png;base64,`).
 *
 * 14 MiB base64 ≈ 10 MiB decoded — generous for a viewport PNG and tight enough
 * to block pathological payloads. Both the HTTP route schema in
 * `@colaborate/adapter-prisma` and the `attach_screenshot` MCP tool in
 * `@colaborate/mcp-server` default to this value.
 *
 * Consumers override per-instance via `createColaborateHandler({ screenshotMaxBytes })`
 * or via the `screenshotMaxBytes` field on the MCP `ServerContext`.
 */
export const DEFAULT_SCREENSHOT_MAX_BYTES = 14 * 1024 * 1024;
