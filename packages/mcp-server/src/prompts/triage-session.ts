import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { uriFor } from "../resources/session.js";

export const inputSchema = z.object({
  id: z.string().min(1).describe("Session id to triage."),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * Build the triage-session prompt body.
 *
 * The message instructs the LLM to read the linked session bundle resource
 * and compose one or more well-formed tracker issues (GitHub or Linear). The
 * Phase 5 triage worker is the primary consumer; Claude Code can also invoke
 * it interactively.
 */
export function handle(args: Input): {
  messages: Array<{
    role: "user" | "assistant";
    content: { type: "text"; text: string };
  }>;
  [key: string]: unknown;
} {
  const uri = uriFor(args.id);
  const text = [
    `You are triaging Colaborate feedback session ${args.id}.`,
    "",
    `Read the full bundle at: ${uri}`,
    "",
    "The bundle contains a session record and every feedback linked to it, each with its",
    "DOM annotations (shape + geometry, selector, component hint). Your job is to compose",
    "structured issues for the configured tracker (GitHub or Linear).",
    "",
    "For each issue you propose, return an object with:",
    "- title: concise, imperative, max ~80 chars",
    "- body: markdown with (a) the reviewer's original feedback message, (b) the component",
    "  id if present, (c) the anchor selector, (d) the shape summary",
    "- labels: an array of strings (optional)",
    "- relatedFeedbackIds: the feedback ids from the bundle that this issue covers",
    "",
    "Return a JSON array wrapped in a ```json code fence. Do not include any other prose",
    "outside the code fence.",
  ].join("\n");

  return {
    messages: [
      {
        role: "user",
        content: { type: "text", text },
      },
    ],
  };
}

export function register(server: McpServer): void {
  server.registerPrompt(
    "triage-session",
    {
      title: "Triage a Colaborate session",
      description:
        "Produce structured tracker issues (GitHub/Linear) from a session bundle. Consumed by the Phase 5 triage worker and interactively by Claude Code.",
      argsSchema: inputSchema.shape,
    },
    (args) => handle(args as Input),
  );
}
