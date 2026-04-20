// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createT } from "../../src/i18n/index.js";
import { SessionToggle } from "../../src/session-toggle.js";
import { buildThemeColors } from "../../src/styles/theme.js";

describe("SessionToggle", () => {
  const colors = buildThemeColors(undefined, "light");
  const t = createT("en");

  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("renders a button with data-session-toggle", () => {
    const toggle = new SessionToggle(colors, t, false, () => {});
    document.body.appendChild(toggle.element);
    const btn = document.querySelector("[data-session-toggle]");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("aria-pressed")).toBe("false");
  });

  it("reflects initial state via aria-pressed", () => {
    const toggle = new SessionToggle(colors, t, true, () => {});
    document.body.appendChild(toggle.element);
    const btn = document.querySelector("[data-session-toggle]") as HTMLButtonElement;
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("fires onChange with the new state on click", () => {
    const onChange = vi.fn();
    const toggle = new SessionToggle(colors, t, false, onChange);
    document.body.appendChild(toggle.element);
    const btn = document.querySelector("[data-session-toggle]") as HTMLButtonElement;
    btn.click();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("setActive updates aria-pressed without firing onChange", () => {
    const onChange = vi.fn();
    const toggle = new SessionToggle(colors, t, false, onChange);
    document.body.appendChild(toggle.element);
    toggle.setActive(true);
    const btn = document.querySelector("[data-session-toggle]") as HTMLButtonElement;
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses the translated label", () => {
    const toggle = new SessionToggle(colors, t, false, () => {});
    document.body.appendChild(toggle.element);
    const btn = document.querySelector("[data-session-toggle]") as HTMLButtonElement;
    expect(btn.textContent).toContain("Session");
    expect(btn.getAttribute("aria-label")).toBe("Toggle session mode");
  });
});
