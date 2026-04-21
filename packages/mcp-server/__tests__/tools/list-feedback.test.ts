import { MemoryStore } from "@colaborate/adapter-memory";
import { beforeEach, describe, expect, it } from "vitest";
import { handle, inputSchema } from "../../src/tools/list-feedback.js";
import { type SeedResult, seedStore } from "../fixtures.js";

describe("list_feedback tool", () => {
  let store: MemoryStore;
  let seed: SeedResult;

  beforeEach(async () => {
    store = new MemoryStore();
    seed = await seedStore(store);
  });

  it("returns every seeded feedback when no filters are applied", async () => {
    const result = await handle({ projectName: seed.projectName }, { store });
    const feedback = JSON.parse(result.content[0]!.text as string) as unknown[];
    expect(feedback).toHaveLength(4);
  });

  it("filters by sessionId", async () => {
    const result = await handle({ projectName: seed.projectName, sessionId: seed.draftingSession.id }, { store });
    const feedback = JSON.parse(result.content[0]!.text as string) as Array<{ clientId: string }>;
    expect(feedback).toHaveLength(1);
    expect(feedback[0]!.clientId).toBe(seed.feedbackClientIds.draftInDrafting);
  });

  it("filters by componentId", async () => {
    const result = await handle({ projectName: seed.projectName, componentId: "CheckoutButton" }, { store });
    const feedback = JSON.parse(result.content[0]!.text as string) as Array<{ componentId: string | null }>;
    expect(feedback).toHaveLength(2);
    expect(feedback.every((f) => f.componentId === "CheckoutButton")).toBe(true);
  });

  it("filters by status", async () => {
    const result = await handle({ projectName: seed.projectName, status: "resolved" }, { store });
    const feedback = JSON.parse(result.content[0]!.text as string) as Array<{ clientId: string; status: string }>;
    expect(feedback).toHaveLength(1);
    expect(feedback[0]!.clientId).toBe(seed.feedbackClientIds.resolvedWithComponent);
  });

  it("respects limit", async () => {
    const result = await handle({ projectName: seed.projectName, limit: 2 }, { store });
    const feedback = JSON.parse(result.content[0]!.text as string) as unknown[];
    expect(feedback).toHaveLength(2);
  });

  it("schema rejects unknown status values", () => {
    expect(inputSchema.safeParse({ projectName: "x", status: "garbage" }).success).toBe(false);
  });
});
