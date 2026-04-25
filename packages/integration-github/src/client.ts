/**
 * Thin GitHub REST client. Two endpoints, no Octokit, no transitive deps.
 *
 * Auth: PAT via `Authorization: Bearer <token>`. App auth deferred to Phase 7+.
 */

export interface GitHubCreateIssueInput {
  title: string;
  body: string;
  labels?: string[];
}

export interface GitHubCreateIssueResponse {
  number: number;
  html_url: string;
}

export interface GitHubUpdateIssuePatch {
  state?: "open" | "closed";
  body?: string;
  labels?: string[];
}

export interface GitHubClient {
  createIssue(input: GitHubCreateIssueInput): Promise<GitHubCreateIssueResponse>;
  updateIssue(number: number, patch: GitHubUpdateIssuePatch): Promise<void>;
}

/**
 * Error raised when the GitHub API returns a non-2xx response.
 * `status` is the HTTP status code; `body` is the verbatim response body
 * (so the triage worker can persist it into `failureReason`).
 */
export class GitHubAdapterError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "GitHubAdapterError";
    this.status = status;
    this.body = body;
  }
}

const REPO_RE = /^([A-Za-z0-9][A-Za-z0-9-_.]*)\/([A-Za-z0-9][A-Za-z0-9-_.]*)$/;

export function createGitHubClient(opts: { token: string; repo: string }): GitHubClient {
  const m = REPO_RE.exec(opts.repo);
  if (!m) throw new Error(`Invalid repo: ${opts.repo} (expected "owner/name")`);
  const [, owner, name] = m as unknown as [string, string, string];

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  return {
    async createIssue(input) {
      const res = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          ...(input.labels !== undefined ? { labels: input.labels } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new GitHubAdapterError(`GitHub createIssue failed: ${res.status} ${res.statusText}`, res.status, body);
      }
      return (await res.json()) as GitHubCreateIssueResponse;
    },

    async updateIssue(number, patch) {
      const res = await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${number}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new GitHubAdapterError(`GitHub updateIssue failed: ${res.status} ${res.statusText}`, res.status, body);
      }
    },
  };
}
