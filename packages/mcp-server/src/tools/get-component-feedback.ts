import type { FeedbackRecord } from "@colaborate/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../types.js";

export const inputSchema = z.object({
  projectName: z.string().min(1).max(200).describe("Colaborate project name."),
  componentId: z.string().min(1).optional().describe("Optional — when set, return only this component's group."),
});

export type Input = z.infer<typeof inputSchema>;

export async function handle(
  args: Input,
  ctx: ServerContext,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { feedbacks } = await ctx.store.getFeedbacks({ projectName: args.projectName, limit: 200 });
  const grouped: Record<string, FeedbackRecord[]> = {};
  for (const fb of feedbacks) {
    if (fb.componentId === null || fb.componentId === "") continue;
    if (args.componentId !== undefined && fb.componentId !== args.componentId) continue;
    const bucket = grouped[fb.componentId] ?? [];
    bucket.push(fb);
    grouped[fb.componentId] = bucket;
  }
  return {
    content: [{ type: "text", text: JSON.stringify(grouped, null, 2) }],
  };
}

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_component_feedback",
    {
      title: "Group Colaborate feedback by component",
      description:
        "Return feedbacks grouped by componentId for a project. Feedbacks without a componentId are excluded. Pass `componentId` to return only that component's group.",
      inputSchema: inputSchema.shape,
    },
    async (args) => handle(args, ctx),
  );
}
