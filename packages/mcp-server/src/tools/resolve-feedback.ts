import { isStoreNotFound } from "@colaborate/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../types.js";

export const inputSchema = z.object({
  id: z.string().min(1).describe("Feedback id to resolve."),
  externalIssueUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "Optional external tracker issue URL. v0 accepts but does NOT persist this value — write-through lands in Phase 6 when the GitHub/Linear adapters are wired in. Pass it anyway to match the long-term contract.",
    ),
});

export type Input = z.infer<typeof inputSchema>;

export async function handle(
  args: Input,
  ctx: ServerContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const updated = await ctx.store.updateFeedback(args.id, {
      status: "resolved",
      resolvedAt: new Date(),
    });
    const extraNote = args.externalIssueUrl
      ? ` (externalIssueUrl accepted but not persisted — Phase 6 limitation)`
      : "";
    return {
      content: [
        {
          type: "text",
          text: `Feedback ${updated.id} resolved at ${updated.resolvedAt?.toISOString() ?? "unknown"}${extraNote}.`,
        },
      ],
    };
  } catch (error) {
    if (isStoreNotFound(error)) {
      return {
        isError: true,
        content: [{ type: "text", text: `Feedback ${args.id} not found.` }],
      };
    }
    throw error;
  }
}

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "resolve_feedback",
    {
      title: "Mark a Colaborate feedback resolved",
      description:
        "Flip a feedback's status to 'resolved' and stamp resolvedAt. Accepts externalIssueUrl for forward compatibility with Phase 6 (GitHub + Linear adapters), but v0 does NOT persist the URL — the store interface doesn't support it yet.",
      inputSchema: inputSchema.shape,
    },
    async (args) => handle(args, ctx),
  );
}
