import { setText } from "./dom-utils.js";
import type { TFunction } from "./i18n/index.js";
import type { ThemeColors } from "./styles/theme.js";

/**
 * Session-mode toggle pill — glass chip shown in the annotator toolbar.
 *
 * Pressed state: accent fill + white text. Idle: glass background + muted text.
 * Per CLAUDE.md jsdom gotchas, individual style properties are set via
 * `element.style.prop = "value"` so jsdom parses them correctly in unit tests.
 */
export class SessionToggle {
  readonly element: HTMLButtonElement;
  private active: boolean;

  constructor(
    private readonly colors: ThemeColors,
    t: TFunction,
    initialActive: boolean,
    private readonly onChange: (enabled: boolean) => void,
  ) {
    this.active = initialActive;
    this.element = document.createElement("button");
    this.element.type = "button";
    this.element.dataset.sessionToggle = "true";
    this.element.setAttribute("aria-label", t("session.toggleAriaLabel"));
    setText(this.element, t("session.toggle"));

    this.element.style.height = "34px";
    this.element.style.padding = "0 14px";
    this.element.style.borderRadius = "9999px";
    this.element.style.border = `1px solid ${colors.border}`;
    this.element.style.fontFamily = '"Inter",system-ui,-apple-system,sans-serif';
    this.element.style.fontSize = "13px";
    this.element.style.fontWeight = "500";
    this.element.style.cursor = "pointer";
    this.element.style.transition = "all 0.2s ease";

    this.applyVisualState();

    this.element.addEventListener("click", () => {
      this.active = !this.active;
      this.applyVisualState();
      this.onChange(this.active);
    });
  }

  /** Update active state without firing `onChange`. Use when state is driven externally. */
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.applyVisualState();
  }

  private applyVisualState(): void {
    this.element.setAttribute("aria-pressed", this.active ? "true" : "false");
    if (this.active) {
      this.element.style.background = this.colors.accent;
      this.element.style.color = "#fff";
      this.element.style.borderColor = this.colors.accent;
    } else {
      this.element.style.background = this.colors.glassBg;
      this.element.style.color = this.colors.textTertiary;
      this.element.style.borderColor = this.colors.border;
    }
  }
}
