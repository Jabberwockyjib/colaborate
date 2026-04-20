// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createT } from "../../src/i18n/index.js";
import { ShapePicker } from "../../src/shape-picker.js";
import { buildThemeColors } from "../../src/styles/theme.js";

const colors = buildThemeColors();
const t = createT("en");

afterEach(() => {
  document.body.replaceChildren();
});

describe("ShapePicker", () => {
  it("renders 6 buttons — one per shape — with data-shape attributes", () => {
    const picker = new ShapePicker(colors, t, "rectangle", vi.fn());
    document.body.appendChild(picker.element);

    const buttons = picker.element.querySelectorAll<HTMLButtonElement>("button[data-shape]");
    expect(buttons.length).toBe(6);
    const shapes = Array.from(buttons).map((b) => b.dataset.shape);
    expect(shapes.sort()).toEqual(["arrow", "circle", "freehand", "line", "rectangle", "textbox"]);
  });

  it('marks the initial shape with data-active="true"', () => {
    const picker = new ShapePicker(colors, t, "circle", vi.fn());
    const active = picker.element.querySelector<HTMLButtonElement>('button[data-shape="circle"]');
    expect(active?.dataset.active).toBe("true");
  });

  it("clicking a shape button fires the callback with that shape and flips data-active", () => {
    const cb = vi.fn();
    const picker = new ShapePicker(colors, t, "rectangle", cb);
    const arrowBtn = picker.element.querySelector<HTMLButtonElement>('button[data-shape="arrow"]')!;
    arrowBtn.click();
    expect(cb).toHaveBeenCalledWith("arrow");

    // Now arrow should be active; rectangle should not
    expect(arrowBtn.dataset.active).toBe("true");
    const rectBtn = picker.element.querySelector<HTMLButtonElement>('button[data-shape="rectangle"]')!;
    expect(rectBtn.dataset.active).not.toBe("true");
  });

  it("setActive(shape) updates the active flag without calling the callback", () => {
    const cb = vi.fn();
    const picker = new ShapePicker(colors, t, "rectangle", cb);
    picker.setActive("line");
    const lineBtn = picker.element.querySelector<HTMLButtonElement>('button[data-shape="line"]')!;
    expect(lineBtn.dataset.active).toBe("true");
    expect(cb).not.toHaveBeenCalled();
  });

  it("each button has an aria-label naming the shape", () => {
    const picker = new ShapePicker(colors, t, "rectangle", vi.fn());
    for (const shape of ["rectangle", "circle", "arrow", "line", "textbox", "freehand"] as const) {
      const btn = picker.element.querySelector<HTMLButtonElement>(`button[data-shape="${shape}"]`)!;
      const aria = btn.getAttribute("aria-label") ?? "";
      expect(aria.length).toBeGreaterThan(0);
    }
  });
});
