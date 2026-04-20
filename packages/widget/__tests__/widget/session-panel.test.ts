// @vitest-environment jsdom
import type { FeedbackResponse, SessionResponse } from "@colaborate/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createT } from "../../src/i18n/index.js";
import { SessionPanel } from "../../src/session-panel.js";
import { buildThemeColors } from "../../src/styles/theme.js";

const session: SessionResponse = {
  id: "sess-1",
  projectName: "p",
  reviewerName: null,
  reviewerEmail: null,
  status: "drafting",
  submittedAt: null,
  triagedAt: null,
  notes: null,
  createdAt: "2026-04-20T00:00:00.000Z",
  updatedAt: "2026-04-20T00:00:00.000Z",
};

function fb(id: string, message: string): FeedbackResponse {
  return {
    id,
    projectName: "p",
    type: "bug",
    message,
    status: "draft",
    url: "https://example.com",
    viewport: "1920x1080",
    userAgent: "Mozilla",
    authorName: "Alice",
    authorEmail: "a@b.c",
    resolvedAt: null,
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
    sessionId: "sess-1",
    componentId: null,
    sourceFile: null,
    sourceLine: null,
    sourceColumn: null,
    mentions: "[]",
    externalProvider: null,
    externalIssueId: null,
    externalIssueUrl: null,
    annotations: [],
  };
}

describe("SessionPanel", () => {
  let host: HTMLElement;
  let shadow: ShadowRoot;
  const colors = buildThemeColors(undefined, "light");
  const t = createT("en");

  beforeEach(() => {
    host = document.createElement("div");
    shadow = host.attachShadow({ mode: "open" });
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it("shows the empty state when no session is active", () => {
    const panel = new SessionPanel(shadow, colors, t, { onSubmit: vi.fn(), onCancel: vi.fn() });
    panel.render(null, []);
    panel.open();
    expect(shadow.querySelector("[data-session-empty]")).not.toBeNull();
    expect(shadow.querySelector("[data-session-draft]")).toBeNull();
  });

  it("lists drafts when a session is active", () => {
    const panel = new SessionPanel(shadow, colors, t, { onSubmit: vi.fn(), onCancel: vi.fn() });
    panel.render(session, [fb("fb-a", "first"), fb("fb-b", "second")]);
    panel.open();
    const drafts = shadow.querySelectorAll("[data-session-draft]");
    expect(drafts.length).toBe(2);
    expect(drafts[0]?.textContent).toContain("first");
    expect(drafts[1]?.textContent).toContain("second");
  });

  it("fires onSubmit when submit button is clicked", () => {
    const onSubmit = vi.fn();
    const panel = new SessionPanel(shadow, colors, t, { onSubmit, onCancel: vi.fn() });
    panel.render(session, [fb("fb-a", "x")]);
    panel.open();
    (shadow.querySelector("[data-session-submit]") as HTMLButtonElement).click();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("submit button is disabled when there are no drafts yet", () => {
    const panel = new SessionPanel(shadow, colors, t, { onSubmit: vi.fn(), onCancel: vi.fn() });
    panel.render(session, []);
    panel.open();
    const btn = shadow.querySelector("[data-session-submit]") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("fires onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    const panel = new SessionPanel(shadow, colors, t, { onSubmit: vi.fn(), onCancel });
    panel.render(session, [fb("fb-a", "x")]);
    panel.open();
    (shadow.querySelector("[data-session-cancel]") as HTMLButtonElement).click();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("open / close / toggle manage visibility", () => {
    const panel = new SessionPanel(shadow, colors, t, { onSubmit: vi.fn(), onCancel: vi.fn() });
    panel.render(null, []);
    expect(panel.isOpen).toBe(false);
    panel.open();
    expect(panel.isOpen).toBe(true);
    panel.close();
    expect(panel.isOpen).toBe(false);
    panel.toggle();
    expect(panel.isOpen).toBe(true);
  });
});
