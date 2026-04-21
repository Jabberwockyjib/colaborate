import { MemoryStore } from "@colaborate/adapter-memory";
import { beforeEach, describe, expect, it } from "vitest";
import { createColaborateMcpServer } from "../../src/index.js";
import { createHttpHandler } from "../../src/transports/http.js";

describe("createHttpHandler", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  function initializePayload(): unknown {
    // Minimal JSON-RPC initialize request — the SDK responds to this
    // before any tool/resource calls are allowed.
    return {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "0.0.0" },
      },
    };
  }

  it("returns 401 when apiKey is set and the bearer token is missing", async () => {
    const server = createColaborateMcpServer({ store });
    const handler = createHttpHandler({ server, apiKey: "secret" });

    const req = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify(initializePayload()),
    });

    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when apiKey is set and the bearer token is wrong", async () => {
    const server = createColaborateMcpServer({ store });
    const handler = createHttpHandler({ server, apiKey: "secret" });

    const req = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer wrong",
      },
      body: JSON.stringify(initializePayload()),
    });

    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it("accepts a valid bearer and returns a 200 initialize response", async () => {
    const server = createColaborateMcpServer({ store });
    const handler = createHttpHandler({ server, apiKey: "secret" });

    const req = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer secret",
      },
      body: JSON.stringify(initializePayload()),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
  });

  it("skips auth entirely when apiKey is unset (fully public)", async () => {
    const server = createColaborateMcpServer({ store });
    const handler = createHttpHandler({ server });

    const req = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify(initializePayload()),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
  });
});
