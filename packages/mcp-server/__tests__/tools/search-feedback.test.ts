import { MemoryStore } from "@colaborate/adapter-memory";
import { beforeEach, describe, expect, it } from "vitest";
import { handle } from "../../src/tools/search-feedback.js";
import { type SeedResult, seedStore } from "../fixtures.js";

describe("search_feedback tool", () => {
  let store: MemoryStore;
  let seed: SeedResult;

  beforeEach(async () => {
    store = new MemoryStore();
    seed = await seedStore(store);
  });

  it("returns feedbacks whose message matches the query (case-insensitive substring)", async () => {
    const result = await handle({ projectName: seed.projectName, query: "checkout" }, { store });
    const feedback = JSON.parse(result.content[0]!.text as string) as Array<{ clientId: string }>;
    // Two seeded feedbacks mention "Checkout" in the message.
    expect(feedback).toHaveLength(2);
    const ids = new Set(feedback.map((f) => f.clientId));
    expect(ids).toContain(seed.feedbackClientIds.draftInDrafting);
    expect(ids).toContain(seed.feedbackClientIds.draftInSubmitted);
  });

  it("returns [] when no message matches", async () => {
    const result = await handle({ projectName: seed.projectName, query: "zzz-no-match" }, { store });
    const feedback = JSON.parse(result.content[0]!.text as string) as unknown[];
    expect(feedback).toEqual([]);
  });

  it("AND-combines query with componentId filter", async () => {
    const result = await handle(
      { projectName: seed.projectName, query: "checkout", componentId: "CheckoutButton" },
      { store },
    );
    const feedback = JSON.parse(result.content[0]!.text as string) as unknown[];
    expect(feedback).toHaveLength(2);
  });

  it("AND-combines query with status filter — draft-only results", async () => {
    const result = await handle({ projectName: seed.projectName, query: "checkout", status: "draft" }, { store });
    const feedback = JSON.parse(result.content[0]!.text as string) as Array<{ status: string }>;
    // The submittedSession's drafts were flipped to "open" by submitSession in seedStore.
    // Only the draftingSession's draft remains with status=draft.
    expect(feedback).toHaveLength(1);
    expect(feedback[0]!.status).toBe("draft");
  });
});
