import type { ColaborateStore, SessionStatus } from "@colaborate/core";
import { formatValidationErrors, sessionCreateBodySchema, sessionListQuerySchema } from "./validation.js";

/**
 * Session HTTP route matcher.
 *
 * Returns a `SessionRoute` descriptor when the request URL matches one of the
 * 4 session routes. Paths:
 *   POST   /api/colaborate/sessions                   → create
 *   POST   /api/colaborate/sessions/:id/submit        → submit
 *   GET    /api/colaborate/sessions                   → list
 *   GET    /api/colaborate/sessions/:id               → get one
 */
export type SessionRoute =
  | { kind: "create" }
  | { kind: "submit"; id: string }
  | { kind: "list" }
  | { kind: "get"; id: string };

export function matchSessionRoute(pathname: string, method: string): SessionRoute | null {
  if (!pathname.includes("/api/colaborate/sessions")) return null;
  // Strip any prefix before "/api/colaborate/sessions"
  const rest = pathname.slice(pathname.indexOf("/api/colaborate/sessions") + "/api/colaborate/sessions".length);

  if (rest === "" || rest === "/") {
    if (method === "POST") return { kind: "create" };
    if (method === "GET") return { kind: "list" };
    return null;
  }

  // /:id or /:id/submit
  const segments = rest.split("/").filter(Boolean);
  if (segments.length === 1 && segments[0]) {
    const id = segments[0];
    if (method === "GET") return { kind: "get", id };
    return null;
  }
  if (segments.length === 2 && segments[0] && segments[1] === "submit") {
    if (method === "POST") return { kind: "submit", id: segments[0] };
    return null;
  }
  return null;
}

export async function handleCreateSession(request: Request, store: ColaborateStore): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = sessionCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: formatValidationErrors(parsed.error) }, { status: 400 });
  }

  const record = await store.createSession(parsed.data);
  return Response.json(record, { status: 201 });
}

export async function handleSubmitSession(store: ColaborateStore, id: string): Promise<Response> {
  try {
    const record = await store.submitSession(id);
    return Response.json(record, { status: 200 });
  } catch (error) {
    if (isStoreNotFoundLike(error)) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
    throw error;
  }
}

export async function handleGetSession(store: ColaborateStore, id: string): Promise<Response> {
  const record = await store.getSession(id);
  if (!record) return Response.json({ error: "Session not found" }, { status: 404 });
  return Response.json(record, { status: 200 });
}

export async function handleListSessions(request: Request, store: ColaborateStore): Promise<Response> {
  const url = new URL(request.url);
  const raw: Record<string, unknown> = {};
  const projectName = url.searchParams.get("projectName");
  if (projectName !== null) raw.projectName = projectName;
  const status = url.searchParams.get("status");
  if (status !== null) raw.status = status;

  const parsed = sessionListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ errors: formatValidationErrors(parsed.error) }, { status: 400 });
  }

  const records = await store.listSessions(parsed.data.projectName, parsed.data.status as SessionStatus | undefined);
  return Response.json(records, { status: 200 });
}

function isStoreNotFoundLike(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: string }).code;
  return code === "STORE_NOT_FOUND" || code === "P2025";
}
