import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubClient, GitHubAdapterError } from "../src/client.js";

const TOKEN = "ghp_test_token";
const REPO = "owner/repo";

describe("createGitHubClient", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("createIssue POSTs to /repos/{owner}/{name}/issues with correct headers + body", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ number: 42, html_url: "https://github.com/owner/repo/issues/42" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createGitHubClient({ token: TOKEN, repo: REPO });
    const result = await client.createIssue({ title: "T", body: "B", labels: ["bug"] });
    expect(result).toEqual({ number: 42, html_url: "https://github.com/owner/repo/issues/42" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/owner/repo/issues");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(headers["Accept"]).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ title: "T", body: "B", labels: ["bug"] });
  });

  it("createIssue throws GitHubAdapterError on non-2xx with status + body", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("Bad credentials", { status: 401 }));
    const client = createGitHubClient({ token: TOKEN, repo: REPO });
    try {
      await client.createIssue({ title: "T", body: "B" });
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(GitHubAdapterError);
      expect((err as GitHubAdapterError).status).toBe(401);
      expect((err as GitHubAdapterError).body).toContain("Bad credentials");
    }
  });

  it("updateIssue PATCHes /repos/{owner}/{name}/issues/{number}", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 200 }));
    const client = createGitHubClient({ token: TOKEN, repo: REPO });
    await client.updateIssue(42, { state: "closed" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/owner/repo/issues/42");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ state: "closed" });
  });

  it("updateIssue throws GitHubAdapterError on 422 (validation)", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Validation failed" }), { status: 422 }));
    const client = createGitHubClient({ token: TOKEN, repo: REPO });
    await expect(client.updateIssue(1, { state: "open" })).rejects.toBeInstanceOf(GitHubAdapterError);
  });

  it("throws on invalid repo format", () => {
    expect(() => createGitHubClient({ token: TOKEN, repo: "no-slash" })).toThrow(/Invalid repo/);
  });

  it("network failure bubbles through (not wrapped)", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ENOTFOUND"));
    const client = createGitHubClient({ token: TOKEN, repo: REPO });
    await expect(client.createIssue({ title: "T", body: "B" })).rejects.toThrow("ENOTFOUND");
  });
});
