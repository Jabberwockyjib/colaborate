/**
 * Event bus for triage events. The default in-process implementation is fine for
 * single-deploy v0; a polling/webhook/queue implementation can drop in later
 * without changing `TriageWorker` or the HTTP route.
 */

/** Event payload map. Add events here; the bus is type-checked against this map. */
export interface TriageEvents {
  "session.submitted": { sessionId: string };
}

export type TriageEventName = keyof TriageEvents;

export type TriageEventHandler<E extends TriageEventName> = (payload: TriageEvents[E]) => void;

export interface TriageEventBus {
  on<E extends TriageEventName>(event: E, handler: TriageEventHandler<E>): void;
  off<E extends TriageEventName>(event: E, handler: TriageEventHandler<E>): void;
  emit<E extends TriageEventName>(event: E, payload: TriageEvents[E]): void;
}

/**
 * In-process EventEmitter-style bus. Synchronous emit — handlers run in the
 * caller's stack, exceptions are caught + logged so one bad handler can't
 * stop another.
 */
export class InProcessEventBus implements TriageEventBus {
  // biome-ignore lint/suspicious/noExplicitAny: handler set is heterogeneous by event name
  private handlers: Map<TriageEventName, Set<(payload: any) => void>> = new Map();

  on<E extends TriageEventName>(event: E, handler: TriageEventHandler<E>): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (p: unknown) => void);
  }

  off<E extends TriageEventName>(event: E, handler: TriageEventHandler<E>): void {
    this.handlers.get(event)?.delete(handler as (p: unknown) => void);
  }

  emit<E extends TriageEventName>(event: E, payload: TriageEvents[E]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[colaborate/triage] handler for '${event}' threw:`, err);
      }
    }
  }
}
