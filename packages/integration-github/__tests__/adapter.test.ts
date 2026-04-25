import type { IssueRef } from "@colaborate/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubAdapter } from "../src/adapter.js";

const TOKEN = "ghp_test";
const REPO = "owner/repo";

describe("createGitHubAdapter", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("name is 'github'", () => {
    const adapter = createGitHubAdapter({ token: TOKEN, repo: REPO });
    expect(adapter.name).toBe("github");
  });

  it("createIssue maps client response → IssueRef", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ number: 7, html_url: "https://github.com/owner/repo/issues/7" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const adapter = createGitHubAdapter({ token: TOKEN, repo: REPO });
    const ref = await adapter.createIssue({ title: "x", body: "y" });
    expect(ref).toEqual({
      provider: "github",
      issueId: "7",
      issueUrl: "https://github.com/owner/repo/issues/7",
    });
  });

  it("updateIssue calls underlying client with parsed number", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 200 }));
    const adapter = createGitHubAdapter({ token: TOKEN, repo: REPO });
    const ref: IssueRef = { provider: "github", issueId: "42", issueUrl: "x" };
    await adapter.updateIssue(ref, { state: "closed" });
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/owner/repo/issues/42");
  });

  it("updateIssue throws on provider mismatch (no fetch made)", async () => {
    const adapter = createGitHubAdapter({ token: TOKEN, repo: REPO });
    const ref: IssueRef = { provider: "linear", issueId: "1", issueUrl: "x" };
    await expect(adapter.updateIssue(ref, { state: "closed" })).rejects.toThrow(/provider mismatch/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("linkResolve always returns { resolved: false } in v0", async () => {
    const adapter = createGitHubAdapter({ token: TOKEN, repo: REPO });
    const ref: IssueRef = { provider: "github", issueId: "1", issueUrl: "x" };
    expect(await adapter.linkResolve(ref)).toEqual({ resolved: false });
  });
});
