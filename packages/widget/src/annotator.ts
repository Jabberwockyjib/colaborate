import type { AnnotationPayload, FeedbackType, Geometry, Shape } from "@colaborate/core";
import { findAnchorElement, generateAnchor } from "./dom/anchor.js";
import { readDebugSource } from "./dom/source.js";
import { el, setText } from "./dom-utils.js";
import { createDrawingMode, type DrawingMode } from "./drawing-modes.js";
import type { EventBus, WidgetEvents } from "./events.js";
import type { TFunction } from "./i18n/index.js";
import { Popup } from "./popup.js";
import { SessionToggle } from "./session-toggle.js";
import { ShapePicker } from "./shape-picker.js";
import { getShapeFromKey } from "./shortcuts.js";
import type { ThemeColors } from "./styles/theme.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * True when the keydown target is an element that accepts text input.
 * Guards shape shortcuts from eating characters in the popup textarea,
 * contenteditable surfaces, or any future input the widget adds.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export interface AnnotationComplete {
  annotation: AnnotationPayload;
  type: FeedbackType;
  message: string;
  /** Whether session mode was active at the moment of submission. Launcher routes accordingly. */
  sessionMode: boolean;
  /** Populated in dev builds via React fiber `_debugSource`; undefined otherwise. */
  source?: { file: string; line: number; column: number };
}

/**
 * Annotation mode: full-page overlay with 6-shape drawing.
 *
 * Glassmorphism design:
 * - Frosted glass toolbar at top (instruction + shape picker + cancel)
 * - Subtle tinted overlay
 * - Per-mode preview (div or SVG) rendered inside the overlay
 *
 * Drawing is delegated to per-shape DrawingMode classes. The annotator
 * orchestrates activation/deactivation, picker + shortcut plumbing, and
 * the handoff from drag-complete to popup to `annotation:complete`.
 */
export class Annotator {
  private overlay: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;
  private svgLayer: SVGSVGElement | null = null;
  private shapePicker: ShapePicker | null = null;
  private sessionToggle: SessionToggle | null = null;
  private sessionMode = false;
  private currentMode: DrawingMode | null = null;
  private currentShape: Shape = "rectangle";
  private isDrawing = false;
  private isActive = false;
  private popup: Popup;
  private savedOverflow = "";
  private preActiveFocusElement: Element | null = null;
  private rafId: number | null = null;
  private pendingMoveEvent: MouseEvent | Touch | null = null;

  constructor(
    private readonly colors: ThemeColors,
    private readonly bus: EventBus<WidgetEvents>,
    private readonly t: TFunction,
  ) {
    this.popup = new Popup(colors, t);

    this.bus.on("annotation:start", () => this.activate());
  }

  private activate(): void {
    if (this.isActive) return;
    this.isActive = true;

    this.preActiveFocusElement = document.activeElement;

    this.savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Overlay — subtle blue tint for depth
    this.overlay = el("div", {
      style: `
        position:fixed;inset:0;
        z-index:2147483646;
        background:rgba(15, 23, 42, 0.04);
        cursor:crosshair;
      `,
    });
    this.overlay.setAttribute("aria-hidden", "true");

    // Single SVG layer shared by SVG-backed modes
    this.svgLayer = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    this.overlay.appendChild(this.svgLayer);

    // Toolbar — glassmorphism bar
    this.toolbar = el("div", {
      style: `
        position:fixed;top:0;left:0;right:0;
        z-index:2147483647;
        height:52px;
        background:${this.colors.glassBg};
        backdrop-filter:blur(24px);
        -webkit-backdrop-filter:blur(24px);
        border-bottom:1px solid ${this.colors.glassBorder};
        display:flex;align-items:center;justify-content:center;gap:16px;
        font-family:"Inter",system-ui,-apple-system,sans-serif;
        font-size:14px;color:${this.colors.text};
        box-shadow:0 4px 16px ${this.colors.shadow};
        -webkit-font-smoothing:antialiased;
      `,
    });

    const dot = el("span", {
      style: `
        width:8px;height:8px;border-radius:50%;
        background:${this.colors.accent};
        box-shadow:0 0 8px ${this.colors.accentGlow};
        animation:pulse 1.5s ease-in-out infinite;
      `,
    });

    const style = document.createElement("style");
    style.textContent = [
      "@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}",
      "@media(prefers-reduced-motion:reduce){@keyframes pulse{from,to{opacity:1}}}",
    ].join("");
    this.toolbar.appendChild(style);

    const instruction = el("span", { style: "font-weight:500;letter-spacing:-0.01em;" });
    setText(instruction, this.t("annotator.instruction"));

    // Shape picker
    this.shapePicker = new ShapePicker(this.colors, this.t, this.currentShape, (shape) => {
      this.switchShape(shape);
    });

    // Cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.style.cssText = `
      height:34px;padding:0 18px;border-radius:9999px;
      border:1px solid ${this.colors.border};
      background:${this.colors.glassBg};
      color:${this.colors.textTertiary};font-family:"Inter",system-ui,-apple-system,sans-serif;
      font-size:13px;font-weight:500;cursor:pointer;
      transition:all 0.2s ease;
    `;
    setText(cancelBtn, this.t("annotator.cancel"));
    cancelBtn.addEventListener("click", () => this.deactivate());
    cancelBtn.addEventListener("mouseenter", () => {
      cancelBtn.style.borderColor = this.colors.typeBug;
      cancelBtn.style.color = this.colors.typeBug;
      cancelBtn.style.background = this.colors.typeBugBg;
    });
    cancelBtn.addEventListener("mouseleave", () => {
      cancelBtn.style.borderColor = this.colors.border;
      cancelBtn.style.color = this.colors.textTertiary;
      cancelBtn.style.background = this.colors.glassBg;
    });

    this.toolbar.appendChild(dot);
    this.toolbar.appendChild(instruction);
    this.toolbar.appendChild(this.shapePicker.element);
    this.sessionToggle = new SessionToggle(this.colors, this.t, this.sessionMode, (enabled) => {
      this.sessionMode = enabled;
      this.bus.emit("session-mode:change", enabled);
    });
    this.toolbar.appendChild(this.sessionToggle.element);
    this.toolbar.appendChild(cancelBtn);

    // Mouse / touch / keyboard listeners
    this.overlay.addEventListener("mousedown", this.onMouseDown);
    this.overlay.addEventListener("mousemove", this.onMouseMove);
    this.overlay.addEventListener("mouseup", this.onMouseUp);
    this.overlay.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.overlay.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.overlay.addEventListener("touchend", this.onTouchEnd);
    this.overlay.addEventListener("keydown", this.onOverlayKeyDown);
    this.overlay.setAttribute("tabindex", "0");

    document.addEventListener("keydown", this.onKeyDown);

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.toolbar);

    // Build initial mode AFTER overlay + svgLayer are in the DOM.
    this.buildMode();
  }

  private buildMode(): void {
    if (!this.overlay || !this.svgLayer) return;
    this.currentMode?.cancel();
    this.currentMode = createDrawingMode(this.currentShape, this.overlay, this.svgLayer, this.colors);
  }

  private switchShape(shape: Shape): void {
    if (shape === this.currentShape) return;
    this.currentShape = shape;
    this.isDrawing = false;
    this.buildMode();
    this.shapePicker?.setActive(shape);
  }

  private deactivate(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.isDrawing = false;
    this.preActiveFocusElement = null;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingMoveEvent = null;

    document.body.style.overflow = this.savedOverflow;
    document.removeEventListener("keydown", this.onKeyDown);

    this.currentMode?.cancel();
    this.currentMode = null;
    this.shapePicker = null;
    this.sessionToggle = null;
    this.svgLayer = null;

    this.overlay?.remove();
    this.toolbar?.remove();
    this.overlay = null;
    this.toolbar = null;

    this.bus.emit("annotation:end");
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      this.deactivate();
      return;
    }
    if (!this.isActive || this.isDrawing) return;
    if (isEditableTarget(e.target)) return;
    const shape = getShapeFromKey(e.key);
    if (shape) {
      e.preventDefault();
      this.switchShape(shape);
    }
  };

  /**
   * Keyboard annotation: pressing Enter while the overlay is active selects
   * the element that was focused before activation and creates a full-bounds
   * annotation covering that element (WCAG 2.1.1 Level A).
   */
  private onOverlayKeyDown = async (e: KeyboardEvent): Promise<void> => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const target = this.preActiveFocusElement;
    if (!target || !(target instanceof HTMLElement)) return;

    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const rectBounds = new DOMRect(bounds.x, bounds.y, bounds.width, bounds.height);

    const result = await this.popup.show(rectBounds);
    if (!result) return;

    const anchor = generateAnchor(target);
    const geometry: Geometry = { shape: "rectangle", x: 0, y: 0, w: 1, h: 1 };
    const annotation: AnnotationPayload = {
      anchor,
      shape: "rectangle",
      geometry,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    };
    const source = readDebugSource(target) ?? undefined;

    this.deactivate();

    this.bus.emit("annotation:complete", {
      annotation,
      type: result.type,
      message: result.message,
      sessionMode: this.sessionMode,
      ...(source ? { source } : {}),
    });
  };

  private onMouseDown = (e: MouseEvent): void => {
    this.startDrawing(e.clientX, e.clientY);
  };

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) this.startDrawing(touch.clientX, touch.clientY);
  };

  private startDrawing(clientX: number, clientY: number): void {
    if (!this.currentMode) return;
    this.isDrawing = true;
    this.currentMode.start(clientX, clientY);
  }

  private onMouseMove = (e: MouseEvent): void => {
    this.scheduleMove(e);
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches[0]) this.scheduleMove(e.touches[0]);
  };

  private scheduleMove(source: MouseEvent | Touch): void {
    if (!this.isDrawing || !this.currentMode) return;

    this.pendingMoveEvent = source;
    if (this.rafId !== null) return;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      const evt = this.pendingMoveEvent;
      if (!evt || !this.currentMode) return;
      this.currentMode.move(evt.clientX, evt.clientY);
    });
  }

  private onTouchEnd = async (e: TouchEvent): Promise<void> => {
    const touch = e.changedTouches[0];
    if (touch) await this.finishDrawing(touch.clientX, touch.clientY);
  };

  private onMouseUp = async (e: MouseEvent): Promise<void> => {
    await this.finishDrawing(e.clientX, e.clientY);
  };

  private finishDrawing = async (clientX: number, clientY: number): Promise<void> => {
    if (!this.isDrawing || !this.currentMode || !this.overlay) return;
    this.isDrawing = false;

    // First pass: 1-px probe at cursor position to pick an initial anchor.
    // Mode.finish uses the anchor's bounds to normalize geometry.
    this.overlay.style.pointerEvents = "none";
    const probe = new DOMRect(clientX, clientY, 1, 1);
    let anchorElement = findAnchorElement(probe);
    this.overlay.style.pointerEvents = "auto";

    let anchorBounds = anchorElement.getBoundingClientRect();
    const first = this.currentMode.finish(clientX, clientY, anchorBounds);
    if (!first) {
      // Too small — rebuild a fresh mode for the next attempt.
      this.buildMode();
      return;
    }

    // Second pass: use the drawn shape's bounding box to pick the best anchor.
    // Large shapes may have been probed to too-small an element.
    this.overlay.style.pointerEvents = "none";
    anchorElement = findAnchorElement(first.bounds);
    this.overlay.style.pointerEvents = "auto";
    anchorBounds = anchorElement.getBoundingClientRect();

    // Show popup for type + message
    const result = await this.popup.show(first.bounds);
    if (!result) {
      this.buildMode();
      return;
    }

    const anchor = generateAnchor(anchorElement);
    const geometry = rebaseGeometry(first.geometry, first.bounds, anchorBounds, result.message);

    const annotation: AnnotationPayload = {
      anchor,
      shape: geometry.shape,
      geometry,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    };
    const source = readDebugSource(anchorElement) ?? undefined;

    this.deactivate();

    this.bus.emit("annotation:complete", {
      annotation,
      type: result.type,
      message: result.message,
      sessionMode: this.sessionMode,
      ...(source ? { source } : {}),
    });
  };

  /** Externally drive the toggle (e.g. on launcher startup from SessionState). */
  setSessionMode(enabled: boolean): void {
    this.sessionMode = enabled;
    this.sessionToggle?.setActive(enabled);
  }

  destroy(): void {
    this.deactivate();
    this.popup.destroy();
  }
}

/**
 * Re-project a Geometry from the original anchor's local frame into a new
 * anchor's local frame, using the shape's absolute bounding box in client
 * coordinates. Also fills in textbox.text from the popup message.
 *
 * For line/arrow, endpoint ordering is recovered from the sign of the
 * original fractional deltas (bounds alone doesn't preserve direction).
 * For freehand, re-projection is skipped — `g.points` are kept as-is because
 * the original per-point coords can't be recovered from bounds alone. In
 * practice the first-pass probe anchor and second-pass bounds anchor usually
 * match for small shapes; on larger shapes the freehand points may be slightly
 * off but this is acceptable for v0.
 */
function rebaseGeometry(g: Geometry, bounds: DOMRect, anchor: DOMRect, message: string): Geometry {
  switch (g.shape) {
    case "rectangle":
      return {
        shape: "rectangle",
        x: (bounds.left - anchor.left) / anchor.width,
        y: (bounds.top - anchor.top) / anchor.height,
        w: bounds.width / anchor.width,
        h: bounds.height / anchor.height,
      };
    case "textbox":
      return {
        shape: "textbox",
        x: (bounds.left - anchor.left) / anchor.width,
        y: (bounds.top - anchor.top) / anchor.height,
        w: bounds.width / anchor.width,
        h: bounds.height / anchor.height,
        text: message,
        fontSize: 14,
      };
    case "circle": {
      const cx = bounds.left + bounds.width / 2;
      const cy = bounds.top + bounds.height / 2;
      return {
        shape: "circle",
        cx: (cx - anchor.left) / anchor.width,
        cy: (cy - anchor.top) / anchor.height,
        rx: bounds.width / 2 / anchor.width,
        ry: bounds.height / 2 / anchor.height,
      };
    }
    case "line":
    case "arrow": {
      // Recover absolute endpoint order from the original fractional deltas.
      const x1abs = g.x1 < g.x2 ? bounds.left : bounds.right;
      const y1abs = g.y1 < g.y2 ? bounds.top : bounds.bottom;
      const x2abs = g.x1 < g.x2 ? bounds.right : bounds.left;
      const y2abs = g.y1 < g.y2 ? bounds.bottom : bounds.top;
      if (g.shape === "line") {
        return {
          shape: "line",
          x1: (x1abs - anchor.left) / anchor.width,
          y1: (y1abs - anchor.top) / anchor.height,
          x2: (x2abs - anchor.left) / anchor.width,
          y2: (y2abs - anchor.top) / anchor.height,
        };
      }
      return {
        shape: "arrow",
        x1: (x1abs - anchor.left) / anchor.width,
        y1: (y1abs - anchor.top) / anchor.height,
        x2: (x2abs - anchor.left) / anchor.width,
        y2: (y2abs - anchor.top) / anchor.height,
        headSize: g.headSize,
      };
    }
    case "freehand": {
      // TODO(phase-1d-or-later): freehand re-projection. Without the original
      // anchor, we can only fall back to the points already computed. See
      // JSDoc above. For strokes that span multiple elements, the stored
      // fractional coords may be relative to the wrong anchor on replay.
      return g;
    }
  }
}
