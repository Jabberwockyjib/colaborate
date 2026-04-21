import { MemoryStore } from "@colaborate/adapter-memory";
import { beforeEach, describe, expect, it } from "vitest";
import { handle } from "../../src/tools/get-component-feedback.js";
import { type SeedResult, seedStore } from "../fixtures.js";

describe("get_component_feedback tool", () => {
  let store: MemoryStore;
  let seed: SeedResult;

  beforeEach(async () => {
    store = new MemoryStore();
    seed = await seedStore(store);
  });

  it("groups feedbacks by componentId across the whole project", async () => {
    const result = await handle({ projectName: seed.projectName }, { store });
    const grouped = JSON.parse(result.content[0]!.text as string) as Record<string, Array<{ clientId: string }>>;
    expect(Object.keys(grouped).sort()).toEqual(["CheckoutButton", "NavBar"]);
    expect(grouped.CheckoutButton).toHaveLength(2);
    expect(grouped.NavBar).toHaveLength(1);
    expect(grouped.NavBar![0]!.clientId).toBe(seed.feedbackClientIds.resolvedWithComponent);
  });

  it("excludes feedbacks with componentId=null from the grouping", async () => {
    const result = await handle({ projectName: seed.projectName }, { store });
    const grouped = JSON.parse(result.content[0]!.text as string) as Record<string, unknown[]>;
    // Nothing keyed under "null" / "" / etc.
    expect(Object.keys(grouped)).not.toContain("null");
    expect(Object.keys(grouped)).not.toContain("");
    // openNoSession has no componentId and is not grouped.
    const allClientIds = Object.values(grouped).flat() as Array<{ clientId: string }>;
    expect(allClientIds.map((f) => f.clientId)).not.toContain(seed.feedbackClientIds.openNoSession);
  });

  it("scopes to a single componentId when provided", async () => {
    const result = await handle({ projectName: seed.projectName, componentId: "NavBar" }, { store });
    const grouped = JSON.parse(result.content[0]!.text as string) as Record<string, unknown[]>;
    expect(Object.keys(grouped)).toEqual(["NavBar"]);
    expect(grouped.NavBar).toHaveLength(1);
  });

  it("returns an empty object when the componentId has no feedbacks", async () => {
    const result = await handle({ projectName: seed.projectName, componentId: "Ghost" }, { store });
    const grouped = JSON.parse(result.content[0]!.text as string) as Record<string, unknown>;
    expect(grouped).toEqual({});
  });
});
