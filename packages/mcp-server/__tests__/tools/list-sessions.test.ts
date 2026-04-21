import { MemoryStore } from "@colaborate/adapter-memory";
import { beforeEach, describe, expect, it } from "vitest";
import { handle, inputSchema } from "../../src/tools/list-sessions.js";
import { seedStore } from "../fixtures.js";

describe("list_sessions tool", () => {
  let store: MemoryStore;
  let projectName: string;

  beforeEach(async () => {
    store = new MemoryStore();
    ({ projectName } = await seedStore(store));
  });

  it("returns both seeded sessions when no status filter is provided", async () => {
    const result = await handle({ projectName }, { store });
    const sessions = JSON.parse(result.content[0]!.text as string) as { id: string; status: string }[];
    expect(sessions).toHaveLength(2);
    expect(new Set(sessions.map((s) => s.status))).toEqual(new Set(["drafting", "submitted"]));
  });

  it("filters by status=submitted", async () => {
    const result = await handle({ projectName, status: "submitted" }, { store });
    const sessions = JSON.parse(result.content[0]!.text as string) as { id: string; status: string }[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.status).toBe("submitted");
  });

  it("respects an explicit limit", async () => {
    const result = await handle({ projectName, limit: 1 }, { store });
    const sessions = JSON.parse(result.content[0]!.text as string) as unknown[];
    expect(sessions).toHaveLength(1);
  });

  it("returns an empty array for an unknown projectName", async () => {
    const result = await handle({ projectName: "does-not-exist" }, { store });
    const sessions = JSON.parse(result.content[0]!.text as string) as unknown[];
    expect(sessions).toEqual([]);
  });

  it("exposes a Zod inputSchema with `projectName`, optional `status`, optional `limit`", () => {
    const good = inputSchema.safeParse({ projectName: "x", status: "drafting", limit: 5 });
    expect(good.success).toBe(true);

    const missing = inputSchema.safeParse({});
    expect(missing.success).toBe(false);

    const badStatus = inputSchema.safeParse({ projectName: "x", status: "garbage" });
    expect(badStatus.success).toBe(false);
  });
});
