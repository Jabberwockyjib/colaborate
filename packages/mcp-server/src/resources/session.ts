import type { ScreenshotRecord } from "@colaborate/core";
import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../types.js";

const URI_TEMPLATE = "colaborate://session/{id}";

export function uriFor(id: string): string {
  return `colaborate://session/${encodeURIComponent(id)}`;
}

/**
 * One-shot handler for `colaborate://session/{id}`.
 *
 * Throws on unknown ids — the SDK surfaces the error to the client as a
 * resources/read protocol error.
 */
export async function handle(
  uri: URL,
  params: { id: string },
  ctx: ServerContext,
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  const session = await ctx.store.getSession(params.id);
  if (!session) throw new Error(`Session ${params.id} not found.`);
  const { feedbacks } = await ctx.store.getFeedbacks({ projectName: session.projectName, limit: 200 });
  const linked = feedbacks.filter((f) => f.sessionId === params.id);

  const screenshotLists = await Promise.all(linked.map((f) => ctx.store.listScreenshots(f.id)));
  const screenshots: ScreenshotRecord[] = screenshotLists.flat();

  const bundle = { session, feedback: linked, screenshots };
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(bundle, null, 2),
      },
    ],
  };
}

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerResource(
    "colaborate-session",
    new ResourceTemplate(URI_TEMPLATE, { list: undefined }),
    {
      title: "Colaborate session bundle",
      description:
        "Full session bundle — session record + linked feedbacks (with annotations) + screenshot metadata for attached PNGs. Screenshot `url` fields are server-relative. One-shot reads; no subscriptions in v0.",
      mimeType: "application/json",
    },
    async (uri, variables) => handle(uri, { id: String(variables.id) }, ctx),
  );
}
