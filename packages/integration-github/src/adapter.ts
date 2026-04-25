import type { IssueInput, IssuePatch, IssueRef, TrackerAdapter } from "@colaborate/core";
import { createGitHubClient } from "./client.js";

/**
 * Build a GitHub-backed `TrackerAdapter`.
 *
 * Auth: PAT via `token`. Repo: `"owner/name"` shape.
 *
 * @example
 * ```ts
 * import { createGitHubAdapter } from "@colaborate/integration-github";
 * const adapter = createGitHubAdapter({ token: process.env.GITHUB_TOKEN!, repo: "myorg/myrepo" });
 * ```
 */
export function createGitHubAdapter(opts: { token: string; repo: string }): TrackerAdapter {
  const client = createGitHubClient(opts);
  return {
    name: "github",

    async createIssue(input: IssueInput): Promise<IssueRef> {
      const created = await client.createIssue({
        title: input.title,
        body: input.body,
        ...(input.labels !== undefined ? { labels: input.labels } : {}),
      });
      return {
        provider: "github",
        issueId: String(created.number),
        issueUrl: created.html_url,
      };
    },

    async updateIssue(ref: IssueRef, patch: IssuePatch): Promise<void> {
      if (ref.provider !== "github") {
        throw new Error(`GitHubAdapter.updateIssue: provider mismatch — got '${ref.provider}', expected 'github'`);
      }
      const number = Number(ref.issueId);
      if (!Number.isInteger(number)) {
        throw new Error(`GitHubAdapter.updateIssue: invalid issueId '${ref.issueId}' (expected integer string)`);
      }
      await client.updateIssue(number, {
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.labels !== undefined ? { labels: patch.labels } : {}),
      });
    },

    // Phase 5 placeholder — Phase 6+ may implement bidirectional sync.
    async linkResolve(): Promise<{ resolved: boolean }> {
      return { resolved: false };
    },
  };
}
