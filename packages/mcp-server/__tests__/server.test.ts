import { MemoryStore } from "@colaborate/adapter-memory";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createColaborateMcpServer } from "../src/index.js";

describe("createColaborateMcpServer", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("returns a ready-to-connect McpServer with Colaborate metadata", async () => {
    const server = createColaborateMcpServer({ store });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const info = client.getServerVersion();
    expect(info?.name).toBe("colaborate");
    expect(typeof info?.version).toBe("string");

    await client.close();
  });
});
