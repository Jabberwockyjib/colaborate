import type { Shape } from "@colaborate/core";
import { SHAPES } from "@colaborate/core";
import type { TFunction } from "./i18n/index.js";
import type { Translations } from "./i18n/types.js";
import {
  ICON_SHAPE_ARROW,
  ICON_SHAPE_CIRCLE,
  ICON_SHAPE_FREEHAND,
  ICON_SHAPE_LINE,
  ICON_SHAPE_RECTANGLE,
  ICON_SHAPE_TEXTBOX,
} from "./icons.js";
import type { ThemeColors } from "./styles/theme.js";

const SHAPE_ICONS: Record<Shape, string> = {
  rectangle: ICON_SHAPE_RECTANGLE,
  circle: ICON_SHAPE_CIRCLE,
  arrow: ICON_SHAPE_ARROW,
  line: ICON_SHAPE_LINE,
  textbox: ICON_SHAPE_TEXTBOX,
  freehand: ICON_SHAPE_FREEHAND,
};

const SHAPE_KEY: Record<Shape, string> = {
  rectangle: "R",
  circle: "C",
  arrow: "A",
  line: "L",
  textbox: "T",
  freehand: "F",
};

const SHAPE_LABEL_KEYS: Record<Shape, keyof Translations> = {
  rectangle: "shape.rectangle",
  circle: "shape.circle",
  arrow: "shape.arrow",
  line: "shape.line",
  textbox: "shape.textbox",
  freehand: "shape.freehand",
};

/**
 * 6-button shape picker for the annotator toolbar. Glassmorphism pill-row
 * matching the existing cancel-button style. Fires the `onChange` callback
 * when the user clicks a button. Use `setActive(shape)` to sync from an
 * external source (keyboard shortcut) without firing the callback.
 */
export class ShapePicker {
  readonly element: HTMLElement;
  private buttons = new Map<Shape, HTMLButtonElement>();
  private active: Shape;

  constructor(
    private readonly colors: ThemeColors,
    t: TFunction,
    initial: Shape,
    private readonly onChange: (shape: Shape) => void,
  ) {
    this.active = initial;
    const row = document.createElement("div");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", t("picker.aria"));
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "4px";
    row.style.padding = "3px";
    row.style.borderRadius = "9999px";
    row.style.background = colors.glassBg;
    row.style.border = `1px solid ${colors.glassBorderSubtle}`;

    for (const shape of SHAPES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.shape = shape;
      if (shape === initial) btn.dataset.active = "true";
      btn.setAttribute("aria-label", `${t(SHAPE_LABEL_KEYS[shape])} (${SHAPE_KEY[shape]})`);
      btn.innerHTML = SHAPE_ICONS[shape];
      this.applyButtonStyle(btn, shape === initial);
      btn.addEventListener("click", () => this.handleClick(shape));
      this.buttons.set(shape, btn);
      row.appendChild(btn);
    }

    this.element = row;
  }

  /** Update active state without firing the callback (used by keyboard shortcut). */
  setActive(shape: Shape): void {
    if (shape === this.active) return;
    this.active = shape;
    for (const [s, btn] of this.buttons) {
      if (s === shape) {
        btn.dataset.active = "true";
      } else {
        delete btn.dataset.active;
      }
      this.applyButtonStyle(btn, s === shape);
    }
  }

  private handleClick(shape: Shape): void {
    if (shape === this.active) return;
    this.setActive(shape);
    this.onChange(shape);
  }

  private applyButtonStyle(btn: HTMLButtonElement, isActive: boolean): void {
    const bg = isActive ? this.colors.accent : "transparent";
    const fg = isActive ? "#fff" : this.colors.textTertiary;
    const border = isActive ? this.colors.accent : "transparent";
    btn.style.height = "28px";
    btn.style.width = "32px";
    btn.style.padding = "0";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.borderRadius = "9999px";
    btn.style.border = `1px solid ${border}`;
    btn.style.background = bg;
    btn.style.color = fg;
    btn.style.cursor = "pointer";
    btn.style.transition = "background 0.15s ease, color 0.15s ease, border-color 0.15s ease";
  }
}
