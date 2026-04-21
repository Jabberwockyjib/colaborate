import { FEEDBACK_STATUSES } from "@colaborate/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../types.js";

export const inputSchema = z.object({
  projectName: z.string().min(1).max(200).describe("Colaborate project name."),
  sessionId: z.string().min(1).optional().describe("Optional — return only feedbacks linked to this session."),
  componentId: z.string().min(1).optional().describe("Optional — return only feedbacks tagged with this componentId."),
  status: z.enum(FEEDBACK_STATUSES).optional().describe("Optional — draft|open|triaged|resolved."),
  limit: z.number().int().min(1).max(200).optional().describe("Max feedbacks to return. Defaults to 50 when omitted."),
});

export type Input = z.infer<typeof inputSchema>;

export async function handle(
  args: Input,
  ctx: ServerContext,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { feedbacks } = await ctx.store.getFeedbacks({
    projectName: args.projectName,
    status: args.status,
    limit: args.limit ?? 50,
  });
  const filtered = feedbacks.filter((f) => {
    if (args.sessionId !== undefined && f.sessionId !== args.sessionId) return false;
    if (args.componentId !== undefined && f.componentId !== args.componentId) return false;
    return true;
  });
  return {
    content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
  };
}

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_feedback",
    {
      title: "List Colaborate feedback",
      description:
        "List feedbacks for a project, newest first. Optional filters: `sessionId`, `componentId`, `status` (draft|open|triaged|resolved). Capped by `limit` (default 50, max 200).",
      inputSchema: inputSchema.shape,
    },
    async (args) => handle(args, ctx),
  );
}
