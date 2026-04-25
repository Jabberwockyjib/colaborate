import { describe, expect, it, vi } from "vitest";
import { InProcessEventBus, type TriageEventBus, type TriageEvents } from "../src/event-bus.js";

describe("InProcessEventBus", () => {
  it("subscribers receive emitted events", () => {
    const bus: TriageEventBus = new InProcessEventBus();
    const handler = vi.fn();
    bus.on("session.submitted", handler);
    bus.emit("session.submitted", { sessionId: "s1" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("multiple subscribers all fire on emit", () => {
    const bus = new InProcessEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("session.submitted", a);
    bus.on("session.submitted", b);
    bus.emit("session.submitted", { sessionId: "s1" });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("off removes a specific handler", () => {
    const bus = new InProcessEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("session.submitted", a);
    bus.on("session.submitted", b);
    bus.off("session.submitted", a);
    bus.emit("session.submitted", { sessionId: "s1" });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it("emit with no subscribers is a no-op (no throw)", () => {
    const bus = new InProcessEventBus();
    expect(() => bus.emit("session.submitted", { sessionId: "s1" })).not.toThrow();
  });

  it("handler exceptions do not block other handlers (caught + logged)", () => {
    const bus = new InProcessEventBus();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = vi.fn(() => {
      throw new Error("handler boom");
    });
    const b = vi.fn();
    bus.on("session.submitted", a);
    bus.on("session.submitted", b);
    bus.emit("session.submitted", { sessionId: "s1" });
    expect(b).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("TriageEvents type exposes session.submitted with sessionId", () => {
    const ev: TriageEvents["session.submitted"] = { sessionId: "x" };
    expect(ev.sessionId).toBe("x");
  });
});
