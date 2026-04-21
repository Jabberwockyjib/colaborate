import { SESSION_STATUSES, type SessionStatus } from "@colaborate/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../types.js";

export const inputSchema = z.object({
  projectName: z.string().min(1).max(200).describe("Colaborate project name."),
  status: z.enum(SESSION_STATUSES).optional().describe("Optional session status filter."),
  limit: z.number().int().min(1).max(200).optional().describe("Max sessions to return. Defaults to 50 when omitted."),
});

export type Input = z.infer<typeof inputSchema>;

export async function handle(
  args: Input,
  ctx: ServerContext,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const all = await ctx.store.listSessions(args.projectName, args.status as SessionStatus | undefined);
  const limit = args.limit ?? 50;
  const clipped = all.slice(0, limit);
  return {
    content: [{ type: "text", text: JSON.stringify(clipped, null, 2) }],
  };
}

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_sessions",
    {
      title: "List Colaborate sessions",
      description:
        "List review sessions for a project, newest first. Filter by status (drafting|submitted|triaged|archived) and/or cap with `limit` (default 50, max 200).",
      inputSchema: inputSchema.shape,
    },
    async (args) => handle(args, ctx),
  );
}
