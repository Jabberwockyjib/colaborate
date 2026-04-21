import { FEEDBACK_STATUSES } from "@colaborate/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../types.js";

export const inputSchema = z.object({
  projectName: z.string().min(1).max(200).describe("Colaborate project name."),
  query: z.string().min(1).max(500).describe("Case-insensitive substring match on feedback.message."),
  sessionId: z.string().min(1).optional().describe("Optional — restrict to feedbacks in this session."),
  componentId: z.string().min(1).optional().describe("Optional — restrict to feedbacks tagged with this componentId."),
  status: z.enum(FEEDBACK_STATUSES).optional().describe("Optional — draft|open|triaged|resolved."),
  limit: z.number().int().min(1).max(200).optional().describe("Max feedbacks to return. Defaults to 50."),
});

export type Input = z.infer<typeof inputSchema>;

export async function handle(
  args: Input,
  ctx: ServerContext,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { feedbacks } = await ctx.store.getFeedbacks({
    projectName: args.projectName,
    status: args.status,
    search: args.query,
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
    "search_feedback",
    {
      title: "Search Colaborate feedback",
      description:
        "Substring-search a project's feedback messages (case-insensitive). Optional AND filters: `sessionId`, `componentId`, `status`. Capped by `limit` (default 50, max 200).",
      inputSchema: inputSchema.shape,
    },
    async (args) => handle(args, ctx),
  );
}
