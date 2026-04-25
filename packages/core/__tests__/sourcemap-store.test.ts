import { describe, expect, it } from "vitest";
import type {
  ResolveSourceInput,
  ResolveSourceResult,
  SourcemapPutInput,
  SourcemapRecord,
  SourcemapStore,
} from "../src/sourcemap-store.js";

describe("SourcemapStore interface", () => {
  it("round-trips put / get / resolve via a stub", async () => {
    const records = new Map<string, SourcemapRecord>();

    const store: SourcemapStore = {
      async putSourcemap(input: SourcemapPutInput): Promise<SourcemapRecord> {
        const record: SourcemapRecord = {
          id: `${input.projectName}:${input.env}:${input.hash}`,
          projectName: input.projectName,
          env: input.env,
          hash: input.hash,
          filename: input.filename,
          uploadedAt: new Date(),
        };
        records.set(record.id, record);
        return record;
      },
      async getSourcemap(id: string): Promise<{ record: SourcemapRecord; content: string } | null> {
        const record = records.get(id);
        return record ? { record, content: "{}" } : null;
      },
      async listSourcemaps(projectName: string, env: string): Promise<SourcemapRecord[]> {
        return [...records.values()].filter((r) => r.projectName === projectName && r.env === env);
      },
      async resolveSourceLocation(input: ResolveSourceInput): Promise<ResolveSourceResult | null> {
        const record = [...records.values()].find(
          (r) => r.projectName === input.projectName && r.env === input.env && r.hash === input.hash,
        );
        if (!record) return null;
        return { sourceFile: "stub.ts", sourceLine: input.line, sourceColumn: input.column };
      },
    };

    const put = await store.putSourcemap({
      projectName: "parkland",
      env: "staging",
      hash: "abc123",
      filename: "main.js.map",
      content: '{"version":3,"mappings":""}',
    });
    expect(put.id).toBe("parkland:staging:abc123");

    const list = await store.listSourcemaps("parkland", "staging");
    expect(list).toHaveLength(1);

    const got = await store.getSourcemap(put.id);
    expect(got?.record.hash).toBe("abc123");
    expect(got?.content).toBe("{}");

    const resolved = await store.resolveSourceLocation({
      projectName: "parkland",
      env: "staging",
      hash: "abc123",
      line: 10,
      column: 5,
    });
    expect(resolved).toEqual({ sourceFile: "stub.ts", sourceLine: 10, sourceColumn: 5 });

    const missing = await store.resolveSourceLocation({
      projectName: "parkland",
      env: "staging",
      hash: "nope",
      line: 1,
      column: 0,
    });
    expect(missing).toBeNull();
  });
});
