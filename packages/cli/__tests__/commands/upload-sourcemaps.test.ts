import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runUploadSourcemaps } from "../../src/commands/upload-sourcemaps.js";

const SIMPLE_MAP = JSON.stringify({
  version: 3,
  file: "bundle.js",
  sources: ["a.ts"],
  names: [],
  mappings: "AAAA",
});

describe("runUploadSourcemaps", () => {
  let dir: string;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let requests: Array<{ url: string; headers: Record<string, string>; bodyBytes: number }>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "colaborate-cli-sm-"));
    mkdirSync(join(dir, "static", "chunks"), { recursive: true });
    writeFileSync(join(dir, "static", "chunks", "main.js.map"), SIMPLE_MAP);
    writeFileSync(join(dir, "static", "chunks", "app.js.map"), SIMPLE_MAP);
    // A non-.map file should be ignored
    writeFileSync(join(dir, "static", "chunks", "main.js"), "console.log(1);");

    requests = [];
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const headers = Object.fromEntries(new Headers(init?.headers ?? {}).entries());
      const body = init?.body as Buffer | string | undefined;
      const bodyBytes = typeof body === "string" ? body.length : (body?.byteLength ?? 0);
      requests.push({ url, headers, bodyBytes });
      return new Response(JSON.stringify({ id: "ok" }), { status: 201 });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it("uploads every .map file under the directory", async () => {
    await runUploadSourcemaps({
      project: "parkland",
      env: "staging",
      dir,
      url: "http://localhost:3000",
      apiKey: "shh",
    });
    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.url === "http://localhost:3000/api/colaborate/sourcemaps")).toBe(true);
  });

  it("sends Authorization: Bearer when apiKey is provided", async () => {
    await runUploadSourcemaps({
      project: "parkland",
      env: "staging",
      dir,
      url: "http://localhost:3000",
      apiKey: "shh",
    });
    for (const r of requests) {
      expect(r.headers.authorization).toBe("Bearer shh");
    }
  });

  it("gzip-encodes the request body (content-encoding: gzip)", async () => {
    await runUploadSourcemaps({
      project: "parkland",
      env: "staging",
      dir,
      url: "http://localhost:3000",
      apiKey: "shh",
    });
    for (const r of requests) {
      expect(r.headers["content-encoding"]).toBe("gzip");
      expect(r.bodyBytes).toBeGreaterThan(30);
    }
  });

  it("throws with a usable message on a non-2xx response", async () => {
    fetchSpy.mockImplementation(async () => new Response("nope", { status: 401 }));
    await expect(
      runUploadSourcemaps({
        project: "parkland",
        env: "staging",
        dir,
        url: "http://localhost:3000",
        apiKey: "shh",
      }),
    ).rejects.toThrow(/401/);
  });

  it("reports a clear error when the directory is empty of .map files", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "colaborate-cli-sm-empty-"));
    try {
      await expect(
        runUploadSourcemaps({
          project: "parkland",
          env: "staging",
          dir: emptyDir,
          url: "http://localhost:3000",
          apiKey: "shh",
        }),
      ).rejects.toThrow(/No \.map files/);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
