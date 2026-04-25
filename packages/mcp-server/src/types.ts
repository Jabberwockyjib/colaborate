import type { ColaborateStore } from "@colaborate/core";

/**
 * Shared context passed into every tool / resource / prompt handler.
 *
 * `store` is the adapter-agnostic data layer (Memory in tests, Prisma in prod).
 * `apiKey` is consulted only by the HTTP transport wrapper — handlers themselves
 * remain transport-agnostic.
 *
 * `screenshotMaxBytes` overrides the cap on inbound screenshot dataUrls accepted
 * by the `attach_screenshot` tool. Defaults to `DEFAULT_SCREENSHOT_MAX_BYTES`
 * (14 MiB ≈ 10 MiB decoded) when omitted.
 */
export interface ServerContext {
  store: ColaborateStore;
  apiKey?: string | undefined;
  screenshotMaxBytes?: number | undefined;
}
