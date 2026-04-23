import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../types.js";

export const inputSchema = z.object({
  feedbackId: z.string().min(1).describe("Feedback id to attach the screenshot to."),
  dataUrl: z
    .string()
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "dataUrl must be data:image/png;base64,<base64>")
    .describe("PNG screenshot as a data URL."),
});

export type Input = z.infer<typeof inputSchema>;

export async function handle(
  args: Input,
  ctx: ServerContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const record = await ctx.store.attachScreenshot(args.feedbackId, args.dataUrl);
    return {
      content: [{ type: "text", text: JSON.stringify(record, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text", text: `Failed to attach screenshot: ${message}` }],
    };
  }
}

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "attach_screenshot",
    {
      title: "Attach a screenshot to a feedback",
      description:
        "Persist a PNG screenshot for an existing feedback record. Idempotent on identical content. Returns the persisted metadata record.",
      inputSchema: inputSchema.shape,
    },
    async (args) => handle(args, ctx),
  );
}
