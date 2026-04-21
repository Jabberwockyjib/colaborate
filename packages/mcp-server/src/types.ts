import type { ColaborateStore } from "@colaborate/core";

/**
 * Shared context passed into every tool / resource / prompt handler.
 *
 * `store` is the adapter-agnostic data layer (Memory in tests, Prisma in prod).
 * `apiKey` is consulted only by the HTTP transport wrapper — handlers themselves
 * remain transport-agnostic.
 */
export interface ServerContext {
  store: ColaborateStore;
  apiKey?: string | undefined;
}
