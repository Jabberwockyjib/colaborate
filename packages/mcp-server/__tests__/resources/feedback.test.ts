import { MemoryStore } from "@colaborate/adapter-memory";
import { beforeEach, describe, expect, it } from "vitest";
import { handle, uriFor } from "../../src/resources/feedback.js";
import { type SeedResult, seedStore } from "../fixtures.js";

describe("colaborate://feedback/{id} resource", () => {
  let store: MemoryStore;
  let seed: SeedResult;

  beforeEach(async () => {
    store = new MemoryStore();
    seed = await seedStore(store);
  });

  it("builds a uri of the expected shape", () => {
    expect(uriFor("abc123")).toBe("colaborate://feedback/abc123");
  });

  it("returns a single feedback with its annotations", async () => {
    const existing = await store.findByClientId(seed.feedbackClientIds.openNoSession);
    const uri = new URL(uriFor(existing!.id));
    const result = await handle(uri, { id: existing!.id }, { store });
    expect(result.contents[0]!.uri).toBe(uri.href);
    const feedback = JSON.parse(result.contents[0]!.text as string) as {
      id: string;
      annotations: unknown[];
    };
    expect(feedback.id).toBe(existing!.id);
    expect(feedback.annotations).toHaveLength(1);
  });

  it("throws when the feedback id is unknown", async () => {
    const uri = new URL(uriFor("missing"));
    await expect(handle(uri, { id: "missing" }, { store })).rejects.toThrow(/not found/i);
  });
});
