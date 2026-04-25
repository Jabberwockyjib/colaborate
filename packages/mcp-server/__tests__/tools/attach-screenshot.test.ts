import { MemoryStore } from "@colaborate/adapter-memory";
import type { ColaborateStore } from "@colaborate/core";
import { StoreValidationError } from "@colaborate/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createColaborateMcpServer } from "../../src/index.js";
import { handle, inputSchema, makeInputSchema } from "../../src/tools/attach-screenshot.js";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("attach_screenshot tool", () => {
  it("returns the persisted screenshot record as text JSON", async () => {
    const store = new MemoryStore();
    const fb = await store.createFeedback({
      projectName: "demo",
      type: "bug",
      message: "hi",
      status: "open",
      url: "https://example.com",
      viewport: "1024x768",
      userAgent: "ua",
      authorName: "a",
      authorEmail: "a@b.com",
      clientId: `cid-${Math.random()}`,
      mentions: "[]",
      annotations: [],
    });

    const result = await handle({ feedbackId: fb.id, dataUrl: PNG_DATA_URL }, { store });
    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as { feedbackId: string; id: string };
    expect(parsed.feedbackId).toBe(fb.id);
    expect(parsed.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns isError=true on malformed dataUrl", async () => {
    const store = new MemoryStore();
    const result = await handle({ feedbackId: "any", dataUrl: "not a url" }, { store });
    expect(result.isError).toBe(true);
  });

  it("inputSchema rejects dataUrl exceeding the 14 MiB base64 cap", () => {
    // 14 MiB + 1 byte of base64 after the prefix — deliberately oversized.
    const oversized = `data:image/png;base64,${"A".repeat(14 * 1024 * 1024 + 1)}`;
    const parsed = inputSchema.safeParse({ feedbackId: "any", dataUrl: oversized });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path.join(".") === "dataUrl");
      expect(issue?.message).toMatch(/10 MB|cap/i);
    }
  });

  it("flags non-PNG bytes as invalid input (validation-flavored error text)", async () => {
    // dataUrl passes the Zod regex (valid base64 chars) but decodes to bytes that
    // are NOT a PNG — exercises the store's signature gate.
    const notAPng = `data:image/png;base64,${Buffer.from("definitely not a png").toString("base64")}`;
    const store = new MemoryStore();
    const result = await handle({ feedbackId: "any", dataUrl: notAPng }, { store });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/^Invalid screenshot input:/);
  });

  it("surfaces validation errors with a distinct prefix when the store throws StoreValidationError", async () => {
    // A custom store that throws StoreValidationError directly. The MCP tool must
    // surface this as a validation-flavored error, not a generic server error.
    const validatingStore: Partial<ColaborateStore> = {
      attachScreenshot: async () => {
        throw new StoreValidationError("custom validation failure");
      },
    };
    const result = await handle(
      { feedbackId: "any", dataUrl: PNG_DATA_URL },
      { store: validatingStore as ColaborateStore },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe("Invalid screenshot input: custom validation failure");
  });

  it("surfaces generic server errors with the generic prefix", async () => {
    // A store throwing a non-validation Error must NOT be classified as input error.
    const failingStore: Partial<ColaborateStore> = {
      attachScreenshot: async () => {
        throw new Error("database is on fire");
      },
    };
    const result = await handle(
      { feedbackId: "any", dataUrl: PNG_DATA_URL },
      { store: failingStore as ColaborateStore },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe("Failed to attach screenshot: database is on fire");
  });

  it("makeInputSchema honors a custom cap (rejects payload exceeding the configured size)", () => {
    const tinyCap = 1024;
    const oversized = `data:image/png;base64,${"A".repeat(tinyCap + 1)}`;
    const customSchema = makeInputSchema(tinyCap);

    const parsed = customSchema.safeParse({ feedbackId: "any", dataUrl: oversized });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path.join(".") === "dataUrl");
      expect(issue?.message).toMatch(/cap/i);
    }

    // And the same payload passes with a larger cap
    const looserSchema = makeInputSchema(tinyCap * 4);
    const parsedLoose = looserSchema.safeParse({ feedbackId: "any", dataUrl: oversized });
    expect(parsedLoose.success).toBe(true);
  });

  it("ServerContext.screenshotMaxBytes is honored end-to-end via the SDK Client", async () => {
    // Wire a server with a tiny cap, then call attach_screenshot through the
    // SDK Client/InMemoryTransport pair. The over-cap payload must be rejected by
    // the published JSON schema, surfacing as a tool/protocol error.
    const tinyCap = 2048;
    const store = new MemoryStore();
    const server = createColaborateMcpServer({ store, screenshotMaxBytes: tinyCap });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const oversized = `data:image/png;base64,${"A".repeat(tinyCap + 1)}`;
      // The SDK enforces the input schema before dispatch — over-cap payloads
      // come back as an `isError: true` result whose text mentions the cap,
      // proving the configured ServerContext.screenshotMaxBytes was honored.
      const result = await client.callTool({
        name: "attach_screenshot",
        arguments: { feedbackId: "fb-1", dataUrl: oversized },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toMatch(/cap|dataUrl/i);
      expect(text).toContain(`${tinyCap}`); // Cap value appears in the error message
    } finally {
      await client.close();
    }
  });
});
