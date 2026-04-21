// @vitest-environment jsdom
import type { AnnotationPayload, FeedbackPayload } from "@colaborate/core";
import { describe, expect, it } from "vitest";
import type { AnnotationComplete } from "../src/annotator.js";

function buildPayload(complete: AnnotationComplete): FeedbackPayload {
  const { annotation, type, message } = complete;
  return {
    projectName: "p",
    type,
    message,
    url: "https://example.com/",
    viewport: "1280x720",
    userAgent: "ua",
    authorName: "a",
    authorEmail: "a@example.com",
    annotations: [annotation as AnnotationPayload],
    clientId: "c",
    ...(complete.source
      ? { sourceFile: complete.source.file, sourceLine: complete.source.line, sourceColumn: complete.source.column }
      : {}),
  };
}

describe("FeedbackPayload builder parity with annotator's AnnotationComplete.source", () => {
  const annotation = {
    anchor: {
      cssSelector: "main > h1",
      xpath: "/html/body/main/h1",
      textSnippet: "Hi",
      elementTag: "H1",
      textPrefix: "",
      textSuffix: "",
      fingerprint: "1:0:x",
      neighborText: "",
    },
    shape: "rectangle" as const,
    geometry: { shape: "rectangle" as const, x: 0, y: 0, w: 1, h: 1 },
    scrollX: 0,
    scrollY: 0,
    viewportW: 1280,
    viewportH: 720,
    devicePixelRatio: 1,
  };

  it("spreads sourceFile/Line/Column when source is present", () => {
    const payload = buildPayload({
      annotation,
      type: "bug",
      message: "m",
      sessionMode: false,
      source: { file: "/abs/app/Checkout.tsx", line: 42, column: 7 },
    });
    expect(payload.sourceFile).toBe("/abs/app/Checkout.tsx");
    expect(payload.sourceLine).toBe(42);
    expect(payload.sourceColumn).toBe(7);
  });

  it("omits the three fields when source is absent", () => {
    const payload = buildPayload({
      annotation,
      type: "bug",
      message: "m",
      sessionMode: false,
    });
    expect(payload.sourceFile).toBeUndefined();
    expect(payload.sourceLine).toBeUndefined();
    expect(payload.sourceColumn).toBeUndefined();
  });
});
