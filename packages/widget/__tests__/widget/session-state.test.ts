// @vitest-environment jsdom

import type { SessionResponse } from "@colaborate/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetClient } from "../../src/api-client.js";
import { SessionState } from "../../src/session-state.js";

const sampleSession: SessionResponse = {
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

function mockClient(): WidgetClient {
  return {
    sendFeedback: vi.fn(),
    getFeedbacks: vi.fn(),
    resolveFeedback: vi.fn(),
    deleteFeedback: vi.fn(),
    deleteAllFeedbacks: vi.fn(),
    createSession: vi.fn().mockResolvedValue(sampleSession),
    submitSession: vi.fn().mockResolvedValue({ ...sampleSession, status: "submitted" }),
    getSession: vi.fn().mockResolvedValue(sampleSession),
    listSessions: vi.fn(),
  };
}

describe("SessionState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("sessionModeEnabled", () => {
    it("defaults to false", () => {
      const state = new SessionState(mockClient(), "p");
      expect(state.sessionModeEnabled).toBe(false);
    });

    it("persists to localStorage scoped by projectName", () => {
      const state = new SessionState(mockClient(), "p");
      state.setSessionMode(true);
      const raw = localStorage.getItem("colaborate_session_mode_p");
      expect(raw).toBe("true");
      const state2 = new SessionState(mockClient(), "p");
      expect(state2.sessionModeEnabled).toBe(true);
    });

    it("isolates sessionMode across projects", () => {
      const a = new SessionState(mockClient(), "proj-a");
      a.setSessionMode(true);
      const b = new SessionState(mockClient(), "proj-b");
      expect(b.sessionModeEnabled).toBe(false);
    });
  });

  describe("beginSession", () => {
    it("lazy-creates a session via client.createSession on first call", async () => {
      const client = mockClient();
      const state = new SessionState(client, "p");
      const session = await state.beginSession();
      expect(client.createSession).toHaveBeenCalledWith({ projectName: "p" });
      expect(session.id).toBe("sess-1");
      expect(state.currentSession?.id).toBe("sess-1");
    });

    it("returns the existing session on subsequent calls without re-creating", async () => {
      const client = mockClient();
      const state = new SessionState(client, "p");
      await state.beginSession();
      await state.beginSession();
      expect(client.createSession).toHaveBeenCalledOnce();
    });

    it("persists the session id to localStorage", async () => {
      const state = new SessionState(mockClient(), "p");
      await state.beginSession();
      const raw = localStorage.getItem("colaborate_current_session_p");
      expect(raw).toBe("sess-1");
    });
  });

  describe("resume on startup", () => {
    it("rehydrates currentSession from localStorage via getSession", async () => {
      localStorage.setItem("colaborate_current_session_p", "sess-1");
      const client = mockClient();
      const state = new SessionState(client, "p");
      await state.hydrate();
      expect(client.getSession).toHaveBeenCalledWith("sess-1");
      expect(state.currentSession?.id).toBe("sess-1");
    });

    it("clears a stale id when getSession returns null", async () => {
      localStorage.setItem("colaborate_current_session_p", "sess-stale");
      const client = mockClient();
      vi.mocked(client.getSession).mockResolvedValue(null);
      const state = new SessionState(client, "p");
      await state.hydrate();
      expect(state.currentSession).toBeNull();
      expect(localStorage.getItem("colaborate_current_session_p")).toBeNull();
    });

    it("clears a rehydrated session that has already been submitted", async () => {
      localStorage.setItem("colaborate_current_session_p", "sess-1");
      const client = mockClient();
      vi.mocked(client.getSession).mockResolvedValue({ ...sampleSession, status: "submitted" });
      const state = new SessionState(client, "p");
      await state.hydrate();
      expect(state.currentSession).toBeNull();
    });
  });

  describe("submitSession", () => {
    it("calls client.submitSession with the current id and clears local state", async () => {
      const client = mockClient();
      const state = new SessionState(client, "p");
      await state.beginSession();
      const result = await state.submitSession();
      expect(client.submitSession).toHaveBeenCalledWith("sess-1");
      expect(result.status).toBe("submitted");
      expect(state.currentSession).toBeNull();
      expect(localStorage.getItem("colaborate_current_session_p")).toBeNull();
    });

    it("throws when no session is active", async () => {
      const state = new SessionState(mockClient(), "p");
      await expect(state.submitSession()).rejects.toThrow(/no active session/i);
    });
  });

  describe("cancelSession", () => {
    it("clears local state without touching the backend", async () => {
      const client = mockClient();
      const state = new SessionState(client, "p");
      await state.beginSession();
      state.cancelSession();
      expect(state.currentSession).toBeNull();
      expect(localStorage.getItem("colaborate_current_session_p")).toBeNull();
      expect(client.submitSession).not.toHaveBeenCalled();
    });
  });

  describe("corrupt storage", () => {
    it("treats invalid session-mode JSON as false", () => {
      localStorage.setItem("colaborate_session_mode_p", "not-bool");
      const state = new SessionState(mockClient(), "p");
      expect(state.sessionModeEnabled).toBe(false);
    });
  });
});
