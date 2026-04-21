import { describe, expect, it } from "vitest";
import { handle, inputSchema } from "../../src/prompts/triage-session.js";

describe("triage-session prompt", () => {
  it("emits exactly one user-role text message", () => {
    const result = handle({ id: "sess-abc" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.role).toBe("user");
    expect(result.messages[0]!.content.type).toBe("text");
  });

  it("embeds the session id and resource uri in the message text", () => {
    const result = handle({ id: "sess-abc" });
    const text = (result.messages[0]!.content as { text: string }).text;
    expect(text).toContain("sess-abc");
    expect(text).toContain("colaborate://session/sess-abc");
  });

  it("schema rejects missing id", () => {
    expect(inputSchema.safeParse({}).success).toBe(false);
  });
});
