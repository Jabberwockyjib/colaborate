import { MemoryStore } from "@colaborate/adapter-memory";
import { beforeEach, describe, expect, it } from "vitest";
import { createColaborateHandler } from "../src/index.js";
import { validSessionBody } from "./fixtures.js";

describe("Session routes", () => {
  let store: MemoryStore;
  let handler: ReturnType<typeof createColaborateHandler>;

  beforeEach(() => {
    store = new MemoryStore();
    handler = createColaborateHandler({ store });
  });

  describe("POST /api/colaborate/sessions", () => {
    it("creates a session and returns 201 with the persisted record", async () => {
      const req = new Request("http://localhost/api/colaborate/sessions", {
        method: "POST",
        body: JSON.stringify(validSessionBody),
      });
      const res = await handler.POST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.projectName).toBe("test-project");
      expect(body.status).toBe("drafting");
      expect(body.reviewerName).toBe("Alice");
      // Dates serialized as strings
      expect(typeof body.createdAt).toBe("string");
    });

    it("returns 400 when projectName missing", async () => {
      const req = new Request("http://localhost/api/colaborate/sessions", {
        method: "POST",
        body: JSON.stringify({ notes: "no project" }),
      });
      const res = await handler.POST(req);
      expect(res.status).toBe(400);
    });

    it("requires auth when apiKey is set", async () => {
      const authedHandler = createColaborateHandler({ store, apiKey: "secret" });
      const req = new Request("http://localhost/api/colaborate/sessions", {
        method: "POST",
        body: JSON.stringify(validSessionBody),
      });
      const res = await authedHandler.POST(req);
      expect(res.status).toBe(401);
    });

    it("accepts valid bearer token when apiKey is set", async () => {
      const authedHandler = createColaborateHandler({ store, apiKey: "secret" });
      const req = new Request("http://localhost/api/colaborate/sessions", {
        method: "POST",
        body: JSON.stringify(validSessionBody),
        headers: { Authorization: "Bearer secret" },
      });
      const res = await authedHandler.POST(req);
      expect(res.status).toBe(201);
    });
  });

  describe("POST /api/colaborate/sessions/:id/submit", () => {
    it("flips status to 'submitted' and stamps submittedAt", async () => {
      const session = await store.createSession({ projectName: "test-project" });
      const req = new Request(`http://localhost/api/colaborate/sessions/${session.id}/submit`, {
        method: "POST",
      });
      const res = await handler.POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("submitted");
      expect(body.submittedAt).toBeDefined();
      expect(typeof body.submittedAt).toBe("string");
    });

    it("returns 404 for unknown session id", async () => {
      const req = new Request("http://localhost/api/colaborate/sessions/nope/submit", {
        method: "POST",
      });
      const res = await handler.POST(req);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/colaborate/sessions", () => {
    it("returns sessions for a project", async () => {
      await store.createSession({ projectName: "p1" });
      await store.createSession({ projectName: "p1" });
      await store.createSession({ projectName: "p2" });
      const req = new Request("http://localhost/api/colaborate/sessions?projectName=p1", {
        method: "GET",
      });
      const res = await handler.GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
    });

    it("filters by status", async () => {
      const s1 = await store.createSession({ projectName: "p" });
      await store.createSession({ projectName: "p" });
      await store.submitSession(s1.id);
      const req = new Request("http://localhost/api/colaborate/sessions?projectName=p&status=submitted", {
        method: "GET",
      });
      const res = await handler.GET(req);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].status).toBe("submitted");
    });

    it("returns 400 when projectName missing", async () => {
      const req = new Request("http://localhost/api/colaborate/sessions", { method: "GET" });
      const res = await handler.GET(req);
      expect(res.status).toBe(400);
    });

    it("requires auth by default when apiKey is set", async () => {
      const authedHandler = createColaborateHandler({ store, apiKey: "secret" });
      const req = new Request("http://localhost/api/colaborate/sessions?projectName=p", {
        method: "GET",
      });
      const res = await authedHandler.GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/colaborate/sessions/:id", () => {
    it("returns the session when found", async () => {
      const session = await store.createSession({ projectName: "p" });
      const req = new Request(`http://localhost/api/colaborate/sessions/${session.id}`, {
        method: "GET",
      });
      const res = await handler.GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(session.id);
    });

    it("returns 404 when not found", async () => {
      const req = new Request("http://localhost/api/colaborate/sessions/nope", { method: "GET" });
      const res = await handler.GET(req);
      expect(res.status).toBe(404);
    });
  });
});
