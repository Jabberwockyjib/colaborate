import { MemoryStore } from "@colaborate/adapter-memory";
import { beforeEach, describe, expect, it } from "vitest";
import { handle, uriFor } from "../../src/resources/session.js";
import { type SeedResult, seedStore } from "../fixtures.js";

describe("colaborate://session/{id} resource", () => {
  let store: MemoryStore;
  let seed: SeedResult;

  beforeEach(async () => {
    store = new MemoryStore();
    seed = await seedStore(store);
  });

  it("builds a uri of the expected shape", () => {
    expect(uriFor("abc123")).toBe("colaborate://session/abc123");
  });

  it("returns session + feedback[] + empty screenshots", async () => {
    const uri = new URL(uriFor(seed.draftingSession.id));
    const result = await handle(uri, { id: seed.draftingSession.id }, { store });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]!.uri).toBe(uri.href);
    expect(result.contents[0]!.mimeType).toBe("application/json");
    const bundle = JSON.parse(result.contents[0]!.text as string) as {
      session: { id: string };
      feedback: unknown[];
      screenshots: unknown[];
    };
    expect(bundle.session.id).toBe(seed.draftingSession.id);
    expect(bundle.feedback).toHaveLength(1);
    expect(bundle.screenshots).toEqual([]);
  });

  it("populates screenshots from linked feedback records", async () => {
    const linkedFeedback = await store.findByClientId(seed.feedbackClientIds.draftInDrafting);
    expect(linkedFeedback).toBeDefined();
    await store.attachScreenshot(
      linkedFeedback!.id,
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    );
    const uri = new URL(uriFor(seed.draftingSession.id));
    const result = await handle(uri, { id: seed.draftingSession.id }, { store });
    const parsed = JSON.parse(result.contents[0]!.text as string) as {
      screenshots: Array<{ feedbackId: string }>;
    };
    expect(parsed.screenshots).toHaveLength(1);
    expect(parsed.screenshots[0]?.feedbackId).toBe(linkedFeedback!.id);
  });

  it("throws when the session id is unknown (resource handlers signal errors by throwing)", async () => {
    const uri = new URL(uriFor("missing"));
    await expect(handle(uri, { id: "missing" }, { store })).rejects.toThrow(/not found/i);
  });
});
