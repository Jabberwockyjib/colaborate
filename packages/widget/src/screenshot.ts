/**
 * Capture a screenshot of the current viewport as a PNG data URL.
 *
 * Returns `null` on any error (html2canvas throws, tainted canvas, etc.) — fails open so
 * the feedback submit path never breaks when capture fails.
 *
 * @param ignoreSelectors CSS selectors for elements to exclude from the capture (typically
 *   the widget's own DOM nodes so they don't appear in their own screenshots).
 */
export async function captureViewportScreenshot(ignoreSelectors: string[]): Promise<string | null> {
  try {
    const mod = await import("html2canvas");
    const html2canvas = mod.default;
    const canvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      ignoreElements: (el: Element) => {
        for (const sel of ignoreSelectors) {
          if (el.matches(sel)) return true;
        }
        return false;
      },
    });
    return canvas.toDataURL("image/png");
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[colaborate] screenshot capture failed:", err);
    }
    return null;
  }
}
