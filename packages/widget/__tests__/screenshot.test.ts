// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureViewportScreenshot } from "../src/screenshot.js";

// Mock html2canvas — jsdom can't actually rasterize, and the widget module lazy-imports it
vi.mock("html2canvas", () => ({
  default: vi.fn(async () => {
    // Mock canvas-like object with a toDataURL method
    return { toDataURL: () => "data:image/png;base64,MOCK" };
  }),
}));

describe("captureViewportScreenshot", () => {
  beforeEach(() => {
    // Silence the expected console.warn in the failure-path test
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns a data:image/png;base64 URL on success", async () => {
    const dataUrl = await captureViewportScreenshot([]);
    expect(dataUrl).toBe("data:image/png;base64,MOCK");
  });

  it("returns null when html2canvas throws", async () => {
    const html2canvas = (await import("html2canvas")).default;
    vi.mocked(html2canvas).mockRejectedValueOnce(new Error("boom"));
    const dataUrl = await captureViewportScreenshot([]);
    expect(dataUrl).toBeNull();
  });
});
