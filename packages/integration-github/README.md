# @colaborate/integration-github

GitHub `TrackerAdapter` for [Colaborate](https://github.com/Jabberwockyjib/colaborate). Direct `fetch`, no Octokit, no transitive dependencies. Used by [`@colaborate/triage`](../triage) to file issues from triaged sessions.

Shipped in **Phase 5** (`v0.6.0-phase-5`).

## Install

```bash
npm install @colaborate/integration-github @colaborate/core
```

`@colaborate/core` is a peer dep — the adapter implements that package's `TrackerAdapter` interface.

## Quick start

```ts
import { createGitHubAdapter } from "@colaborate/integration-github";

const adapter = createGitHubAdapter({
  token: process.env.GITHUB_TOKEN!,         // PAT, scopes below
  repo: process.env.COLABORATE_GITHUB_REPO!, // "owner/name"
});
```

Pass the adapter to a `TriageWorker`:

```ts
new TriageWorker({ store, anthropic, eventBus, trackerAdapter: adapter });
```

## Auth

PAT only in v0. Either a [classic](https://github.com/settings/tokens) or a [fine-grained](https://github.com/settings/tokens?type=beta) personal access token works.

| Token type | Required scope / permission |
|---|---|
| Classic | `repo` (or `public_repo` if the target repo is public) |
| Fine-grained | Repository access → the target repo. **Permissions:** `Issues: Read and write`. |

The adapter calls two endpoints — `POST /repos/{owner}/{name}/issues` and `PATCH /repos/{owner}/{name}/issues/{number}` — and sends `Authorization: Bearer <token>` plus `X-GitHub-Api-Version: 2022-11-28`. Issues are filed under the user (or app) that owns the token, so use a service account where appropriate.

GitHub App auth is deferred to Phase 7 — the `TrackerAdapter` interface insulates the triage worker from the auth model, so swapping in app auth is a one-package change.

## Repo format

`repo` must be `"owner/name"`. The validator allows letters, digits, `-`, `_`, `.` in each segment and rejects anything else with a synchronous `Error` from `createGitHubAdapter` / `createGitHubClient`.

## Errors

The adapter throws `GitHubAdapterError` on any non-2xx response:

```ts
import { GitHubAdapterError } from "@colaborate/integration-github";

try {
  await adapter.createIssue({ title: "…", body: "…" });
} catch (err) {
  if (err instanceof GitHubAdapterError) {
    err.status; // HTTP status code
    err.body;   // verbatim response body — preserved so triage worker can persist it
  }
}
```

The triage worker captures the message into `failureReason` as `github: created N of M, then: <message>` — partial-progress is preserved across the retry boundary, and a retry from `failed` filters out already-linked feedbacks.

## API surface

```ts
// TrackerAdapter implementation
function createGitHubAdapter(opts: { token: string; repo: string }): TrackerAdapter;

// Lower-level client (rarely needed; useful for custom callers)
function createGitHubClient(opts: { token: string; repo: string }): GitHubClient;

interface GitHubClient {
  createIssue(input: GitHubCreateIssueInput): Promise<GitHubCreateIssueResponse>;
  updateIssue(number: number, patch: GitHubUpdateIssuePatch): Promise<void>;
}

class GitHubAdapterError extends Error {
  readonly status: number;
  readonly body: string;
}
```

`linkResolve` is a Phase 5 placeholder that returns `{ resolved: false }` — bidirectional sync (closing a feedback when its tracker issue closes) is deferred to Phase 6+.

## Smoke-testing

To exercise the full submit→issue loop end-to-end, see the top-level [README quick-start](../../README.md#quick-start--run-the-demo-locally). A single submit with 3 feedbacks should produce 1–3 issues on the configured repo within ~10 seconds, with `externalIssueUrl` populated on each feedback and the session status flipped to `triaged`.

Filing real issues against a working repo creates noise. For iteration, point `COLABORATE_GITHUB_REPO` at a throwaway test repo.

## License

MIT.
