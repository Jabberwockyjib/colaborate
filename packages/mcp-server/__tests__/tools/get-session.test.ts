import { MemoryStore } from "@colaborate/adapter-memory";
import { beforeEach, describe, expect, it } from "vitest";
import { handle, inputSchema } from "../../src/tools/get-session.js";
import { type SeedResult, seedStore } from "../fixtures.js";

describe("get_session tool", () => {
  let store: MemoryStore;
  let seed: SeedResult;

  beforeEach(async () => {
    store = new MemoryStore();
    seed = await seedStore(store);
  });

  it("returns a full bundle for the drafting session — session + its drafts + annotations + empty screenshots", async () => {
    const result = await handle({ id: seed.draftingSession.id }, { store });
    const bundle = JSON.parse(result.content[0]!.text as string) as {
      session: { id: string; status: string };
      feedback: Array<{ clientId: string; annotations: unknown[] }>;
      screenshots: unknown[];
    };
    expect(bundle.session.id).toBe(seed.draftingSession.id);
    expect(bundle.session.status).toBe("drafting");
    expect(bundle.feedback).toHaveLength(1);
    expect(bundle.feedback[0]!.clientId).toBe(seed.feedbackClientIds.draftInDrafting);
    expect(bundle.feedback[0]!.annotations).toHaveLength(1);
    expect(bundle.screenshots).toEqual([]);
  });

  it("populates screenshots from linked feedback records", async () => {
    const linkedFeedback = await store.findByClientId(seed.feedbackClientIds.draftInDrafting);
    expect(linkedFeedback).toBeDefined();
    await store.attachScreenshot(
      linkedFeedback!.id,
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    );
    const result = await handle({ id: seed.draftingSession.id }, { store });
    const parsed = JSON.parse(result.content[0]!.text as string) as {
      screenshots: Array<{ feedbackId: string }>;
    };
    expect(parsed.screenshots).toHaveLength(1);
    expect(parsed.screenshots[0]?.feedbackId).toBe(linkedFeedback!.id);
  });

  it("returns the submitted-session bundle with feedbacks flipped to open by submit", async () => {
    const result = await handle({ id: seed.submittedSession.id }, { store });
    const bundle = JSON.parse(result.content[0]!.text as string) as {
      session: { status: string };
      feedback: Array<{ status: string }>;
    };
    expect(bundle.session.status).toBe("submitted");
    expect(bundle.feedback).toHaveLength(1);
    expect(bundle.feedback[0]!.status).toBe("open");
  });

  it("returns an error content block (not a thrown) when the id is unknown", async () => {
    const result = await handle({ id: "does-not-exist" }, { store });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not found/i);
  });

  it("rejects a missing id at the Zod layer", () => {
    const parsed = inputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});
