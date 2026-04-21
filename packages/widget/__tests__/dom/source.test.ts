// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readDebugSource } from "../../src/dom/source.js";

function attachFiber(el: HTMLElement, fiber: unknown): string {
  const key = "__reactFiber$test";
  (el as unknown as Record<string, unknown>)[key] = fiber;
  return key;
}

describe("readDebugSource", () => {
  it("returns null on an element with no React fiber property", () => {
    const el = document.createElement("div");
    expect(readDebugSource(el)).toBeNull();
  });

  it("extracts _debugSource from the element's own fiber", () => {
    const el = document.createElement("div");
    attachFiber(el, {
      _debugSource: {
        fileName: "/abs/path/app/Checkout.tsx",
        lineNumber: 42,
        columnNumber: 7,
      },
    });
    expect(readDebugSource(el)).toEqual({
      file: "/abs/path/app/Checkout.tsx",
      line: 42,
      column: 7,
    });
  });

  it("climbs the fiber return chain to find the first populated _debugSource", () => {
    const el = document.createElement("div");
    const parentFiber = {
      _debugSource: {
        fileName: "/abs/path/app/Page.tsx",
        lineNumber: 10,
        columnNumber: 3,
      },
    };
    const ownFiber = { _debugSource: null, return: parentFiber };
    attachFiber(el, ownFiber);
    expect(readDebugSource(el)).toEqual({
      file: "/abs/path/app/Page.tsx",
      line: 10,
      column: 3,
    });
  });

  it("returns null when fibers exist but no _debugSource is populated in the chain", () => {
    const el = document.createElement("div");
    const ownFiber = { _debugSource: null, return: { _debugSource: null, return: null } };
    attachFiber(el, ownFiber);
    expect(readDebugSource(el)).toBeNull();
  });

  it("returns null when the fiber chain has malformed _debugSource (missing fields)", () => {
    const el = document.createElement("div");
    attachFiber(el, { _debugSource: { fileName: null, lineNumber: 1, columnNumber: 0 } });
    expect(readDebugSource(el)).toBeNull();
  });

  it("ignores non-fiber-prefixed properties", () => {
    const el = document.createElement("div");
    (el as unknown as Record<string, unknown>).__notAFiber$ = {
      _debugSource: { fileName: "/a.tsx", lineNumber: 1, columnNumber: 0 },
    };
    expect(readDebugSource(el)).toBeNull();
  });
});
