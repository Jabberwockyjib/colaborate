import { MemoryStore } from "@colaborate/adapter-memory";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createColaborateMcpServer } from "../src/index.js";
import { uriFor as sessionUri } from "../src/resources/session.js";
import { type SeedResult, seedStore } from "./fixtures.js";

describe("createColaborateMcpServer — end-to-end via InMemoryTransport", () => {
  let store: MemoryStore;
  let seed: SeedResult;
  let client: Client;
  let server: ReturnType<typeof createColaborateMcpServer>;

  beforeEach(async () => {
    store = new MemoryStore();
    seed = await seedStore(store);
    server = createColaborateMcpServer({ store });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
  });

  it("announces Colaborate metadata", () => {
    const info = client.getServerVersion();
    expect(info?.name).toBe("colaborate");
  });

  it("lists all 6 tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "get_component_feedback",
        "get_session",
        "list_feedback",
        "list_sessions",
        "resolve_feedback",
        "search_feedback",
      ].sort(),
    );
  });

  it("round-trips list_sessions through the protocol", async () => {
    const result = await client.callTool({
      name: "list_sessions",
      arguments: { projectName: seed.projectName },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    const sessions = JSON.parse(text) as unknown[];
    expect(sessions).toHaveLength(2);
  });

  it("round-trips colaborate://session/{id} as a resource read", async () => {
    const uri = sessionUri(seed.draftingSession.id);
    const result = await client.readResource({ uri });
    expect(result.contents).toHaveLength(1);
    const parsed = JSON.parse(result.contents[0]!.text as string) as { session: { id: string } };
    expect(parsed.session.id).toBe(seed.draftingSession.id);
  });

  it("advertises the triage-session prompt", async () => {
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name);
    expect(names).toContain("triage-session");
  });

  it("renders the triage-session prompt for a given id", async () => {
    const result = await client.getPrompt({
      name: "triage-session",
      arguments: { id: seed.submittedSession.id },
    });
    expect(result.messages).toHaveLength(1);
    const text = (result.messages[0]!.content as { text: string }).text;
    expect(text).toContain(seed.submittedSession.id);
  });
});
