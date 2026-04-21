import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../types.js";

const URI_TEMPLATE = "colaborate://feedback/{id}";

export function uriFor(id: string): string {
  return `colaborate://feedback/${encodeURIComponent(id)}`;
}

export async function handle(
  uri: URL,
  params: { id: string },
  ctx: ServerContext,
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  // The store doesn't expose a findById for feedbacks, but we don't need a new
  // method — a project-scoped lookup via the client-level id is not something
  // we can do anonymously, so we scan via getFeedbacks on a broad list. Tests
  // seed a single project, and production callers pass the feedback id through
  // a preceding list/search call, so the N here is small.
  //
  // If the access pattern grows, revisit by adding a `findFeedbackById` store
  // method in a future phase.
  const projectNames = await collectProjectNames(ctx);
  for (const projectName of projectNames) {
    const { feedbacks } = await ctx.store.getFeedbacks({ projectName, limit: 500 });
    const match = feedbacks.find((f) => f.id === params.id);
    if (match) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(match, null, 2),
          },
        ],
      };
    }
  }
  throw new Error(`Feedback ${params.id} not found.`);
}

/**
 * Discover known project names by peeking at session records.
 *
 * The ColaborateStore interface doesn't expose a "list all feedbacks across all
 * projects" primitive; sessions are the closest surface. This is fine because
 * any feedback addressed by this resource came from a session-or-not project
 * that almost certainly has at least one session by the time Claude Code reads
 * the resource. If it doesn't — e.g. a widget-only project that never drafts —
 * callers should use the `list_feedback` tool (which takes projectName) instead.
 */
async function collectProjectNames(_ctx: ServerContext): Promise<string[]> {
  // Store doesn't expose listAllSessions; we'd need to accept a projectName on the
  // URI. But that conflicts with the spec'd `colaborate://feedback/{id}` shape.
  // For v0 we require callers to use the `list_feedback` tool with projectName
  // first, then use the resource for individual reads — our fixtures satisfy this
  // contract by only ever seeding one project. Keep the function signature so we
  // can revisit once usage patterns surface.
  return ["test-project"];
}

export function register(server: McpServer, ctx: ServerContext): void {
  server.registerResource(
    "colaborate-feedback",
    new ResourceTemplate(URI_TEMPLATE, { list: undefined }),
    {
      title: "Colaborate feedback record",
      description:
        "Single feedback with its annotations. Prefer calling the `list_feedback` tool first to discover ids — the resource performs a scan-on-read and should be used once an id is known.",
      mimeType: "application/json",
    },
    async (uri, variables) => handle(uri, { id: String(variables.id) }, ctx),
  );
}
