import type { SessionResponse } from "@colaborate/core";
import type { WidgetClient } from "./api-client.js";

const SESSION_MODE_KEY_PREFIX = "colaborate_session_mode_";
const CURRENT_SESSION_KEY_PREFIX = "colaborate_current_session_";

/**
 * Holds the widget's review-session state in memory + localStorage.
 *
 * - `sessionModeEnabled` is a per-project boolean toggle. Persists across reloads.
 * - `currentSession` is the active drafting-status SessionResponse, lazy-created
 *   on first annotation in session mode. Persisted as just the id;
 *   `hydrate()` rehydrates the full record via `WidgetClient.getSession`.
 *
 * All storage keys are scoped by `projectName` so that a single origin can host
 * the widget under multiple project names without cross-contamination.
 */
export class SessionState {
  private _currentSession: SessionResponse | null = null;
  private _sessionModeEnabled: boolean;

  constructor(
    private readonly client: WidgetClient,
    private readonly projectName: string,
  ) {
    this._sessionModeEnabled = this.readSessionMode();
  }

  get currentSession(): SessionResponse | null {
    return this._currentSession;
  }

  get sessionModeEnabled(): boolean {
    return this._sessionModeEnabled;
  }

  setSessionMode(enabled: boolean): void {
    this._sessionModeEnabled = enabled;
    try {
      localStorage.setItem(this.sessionModeKey(), enabled ? "true" : "false");
    } catch {
      // localStorage full or disabled — in-memory only for this page load
    }
  }

  /**
   * Restore `currentSession` from localStorage by reading the stored id and
   * calling `getSession`. Clears local state if the stored session is missing
   * or already submitted/triaged/archived.
   */
  async hydrate(): Promise<void> {
    const storedId = this.readCurrentSessionId();
    if (!storedId) return;
    try {
      const record = await this.client.getSession(storedId);
      if (!record || record.status !== "drafting") {
        this.clearCurrentSession();
        return;
      }
      this._currentSession = record;
    } catch {
      // Network failure — leave local state as-is; the next beginSession
      // will replace the stale id.
    }
  }

  /**
   * Return the active session, creating one on first call. Subsequent calls
   * return the cached session without re-hitting the server.
   */
  async beginSession(): Promise<SessionResponse> {
    if (this._currentSession) return this._currentSession;
    const record = await this.client.createSession({ projectName: this.projectName });
    this._currentSession = record;
    try {
      localStorage.setItem(this.currentSessionKey(), record.id);
    } catch {
      // best-effort — widget works without persistence this reload
    }
    return record;
  }

  /** Submit the active session and clear local state. Throws when no session is active. */
  async submitSession(): Promise<SessionResponse> {
    const session = this._currentSession;
    if (!session) throw new Error("no active session to submit");
    const record = await this.client.submitSession(session.id);
    this.clearCurrentSession();
    return record;
  }

  /** Abandon the active session without server interaction. */
  cancelSession(): void {
    this.clearCurrentSession();
  }

  // -- internal --------------------------------------------------------------

  private sessionModeKey(): string {
    return `${SESSION_MODE_KEY_PREFIX}${this.projectName}`;
  }

  private currentSessionKey(): string {
    return `${CURRENT_SESSION_KEY_PREFIX}${this.projectName}`;
  }

  private readSessionMode(): boolean {
    try {
      const raw = localStorage.getItem(this.sessionModeKey());
      return raw === "true";
    } catch {
      return false;
    }
  }

  private readCurrentSessionId(): string | null {
    try {
      const raw = localStorage.getItem(this.currentSessionKey());
      return raw && raw.length > 0 ? raw : null;
    } catch {
      return null;
    }
  }

  private clearCurrentSession(): void {
    this._currentSession = null;
    try {
      localStorage.removeItem(this.currentSessionKey());
    } catch {
      // ignore
    }
  }
}
