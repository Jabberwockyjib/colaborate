import type { FeedbackRecord, ScreenshotRecord } from "@colaborate/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../types.js";

export const inputSchema = z.object({
  id: z.string().min(1).describe("Session id to fetch."),
});

export type Input = z.infer<typeof inputSchema>;

export interface SessionBundle {
  session: unknown;
  feedback: FeedbackRecord[];
  /** Metadata for screenshots attached to linked feedbacks. URLs are server-relative. */
  screenshots: ScreenshotRecord[];
}

export async function handle(
  args: Input,
  ctx: ServerContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const session = await ctx.store.getSession(args.id);
  if (!session) {
    return {
      isError: true,
      content: [{ type: "text", text: `Session ${args.id} not found.` }],
    };
  }
  const { feedbacks } = await ctx.store.getFeedbacks({ projectName: session.projectName, limit: 200 });
  const linked = feedbacks.filter((f) => f.sessionId === args.id);

  const screenshotLists = await Promise.all(linked.map((f) => ctx.store.listScreenshots(f.id)));
  const screenshots: ScreenshotRecord[] = screenshotLists.flat();

  const bundle: SessionBundle = {
    session,
    feedback: linked,
    screenshots,
  };
  return {
    content: [{ type: "text", text: JSON.stringify(bundle, null, 2) }],
  };
}

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_session",
    {
      title: "Get a Colaborate session bundle",
      description:
        "Return a session record plus all feedbacks (with annotations) linked to it, plus metadata for any attached screenshots. Screenshot `url` fields are server-relative paths under `/api/colaborate/feedbacks/:id/screenshots/:hash`; fetch bytes via the Colaborate HTTP surface separately if needed.",
      inputSchema: inputSchema.shape,
    },
    async (args) => handle(args, ctx),
  );
}
