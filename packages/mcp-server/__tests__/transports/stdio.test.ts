import { MemoryStore } from "@colaborate/adapter-memory";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { describe, expect, it, vi } from "vitest";
import { createColaborateMcpServer } from "../../src/index.js";
import { connectStdio } from "../../src/transports/stdio.js";

describe("connectStdio", () => {
  it("connects the server to a StdioServerTransport instance", async () => {
    const server = createColaborateMcpServer({ store: new MemoryStore() });
    const spy = vi.spyOn(server, "connect").mockResolvedValue(undefined);
    await connectStdio(server);
    expect(spy).toHaveBeenCalledOnce();
    const arg = spy.mock.calls[0]![0];
    expect(arg).toBeInstanceOf(StdioServerTransport);
  });
});
