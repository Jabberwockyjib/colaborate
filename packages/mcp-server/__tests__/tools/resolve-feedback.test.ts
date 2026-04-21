import { MemoryStore } from "@colaborate/adapter-memory";
import { beforeEach, describe, expect, it } from "vitest";
import { handle } from "../../src/tools/resolve-feedback.js";
import { type SeedResult, seedStore } from "../fixtures.js";

describe("resolve_feedback tool", () => {
  let store: MemoryStore;
  let seed: SeedResult;

  beforeEach(async () => {
    store = new MemoryStore();
    seed = await seedStore(store);
  });

  async function findByClientId(clientId: string) {
    return store.findByClientId(clientId);
  }

  it("flips status to 'resolved' and stamps resolvedAt", async () => {
    const before = await findByClientId(seed.feedbackClientIds.openNoSession);
    const id = before!.id;
    const result = await handle({ id }, { store });
    expect(result.isError).toBeUndefined();
    const after = await findByClientId(seed.feedbackClientIds.openNoSession);
    expect(after!.status).toBe("resolved");
    expect(after!.resolvedAt).toBeInstanceOf(Date);
  });

  it("is idempotent — resolving an already-resolved feedback leaves it resolved", async () => {
    const id = (await findByClientId(seed.feedbackClientIds.resolvedWithComponent))!.id;
    const result = await handle({ id }, { store });
    expect(result.isError).toBeUndefined();
    const after = await findByClientId(seed.feedbackClientIds.resolvedWithComponent);
    expect(after!.status).toBe("resolved");
  });

  it("returns isError when the id is unknown", async () => {
    const result = await handle({ id: "does-not-exist" }, { store });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not found/i);
  });

  it("accepts externalIssueUrl but does not persist it (Phase 6 limitation)", async () => {
    const id = (await findByClientId(seed.feedbackClientIds.openNoSession))!.id;
    const result = await handle({ id, externalIssueUrl: "https://github.com/develotype/test/issues/1" }, { store });
    expect(result.isError).toBeUndefined();
    const after = await findByClientId(seed.feedbackClientIds.openNoSession);
    // The store doesn't expose externalIssueUrl writes via updateFeedback today;
    // the v0 MCP contract accepts the arg so Claude Code's call signature matches
    // Phase 6, but the persisted value is still null.
    expect(after!.externalIssueUrl).toBeNull();
    // And the tool's text response surfaces the deferred behavior so callers know.
    expect(result.content[0]!.text).toMatch(/externalIssueUrl/i);
  });
});
