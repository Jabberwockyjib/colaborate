import { DEFAULT_SCREENSHOT_MAX_BYTES, isStoreValidation } from "@colaborate/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../types.js";

/**
 * Build the input schema for `attach_screenshot` with a configurable max base64
 * length. Use `inputSchema` (the default-cap export) when no override is needed;
 * call this factory for tests or contexts that override `screenshotMaxBytes`.
 */
export function makeInputSchema(maxBytes: number) {
  return z.object({
    feedbackId: z.string().min(1).describe("Feedback id to attach the screenshot to."),
    dataUrl: z
      .string()
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "dataUrl must be data:image/png;base64,<base64>")
      .max(maxBytes, `dataUrl exceeds ${maxBytes}-byte cap`)
      .describe("PNG screenshot as a data URL."),
  });
}

/** Default-cap input schema. Equivalent to `makeInputSchema(DEFAULT_SCREENSHOT_MAX_BYTES)`. */
export const inputSchema = makeInputSchema(DEFAULT_SCREENSHOT_MAX_BYTES);

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
    // Distinguish caller-input errors from server faults so the LLM knows whether
    // to retry with corrected input vs. surface a server problem.
    if (isStoreValidation(error)) {
      return {
        isError: true,
        content: [{ type: "text", text: `Invalid screenshot input: ${message}` }],
      };
    }
    return {
      isError: true,
      content: [{ type: "text", text: `Failed to attach screenshot: ${message}` }],
    };
  }
}

export function register(server: McpServer, ctx: ServerContext): void {
  const schema = makeInputSchema(ctx.screenshotMaxBytes ?? DEFAULT_SCREENSHOT_MAX_BYTES);
  server.registerTool(
    "attach_screenshot",
    {
      title: "Attach a screenshot to a feedback",
      description:
        "Persist a PNG screenshot for an existing feedback record. Idempotent on identical content. Returns the persisted metadata record.",
      inputSchema: schema.shape,
    },
    async (args) => handle(args, ctx),
  );
}
