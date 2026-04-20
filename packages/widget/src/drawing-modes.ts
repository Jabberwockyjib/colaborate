import type { Geometry, Shape } from "@colaborate/core";
import { getStroke } from "perfect-freehand";
import type { ThemeColors } from "./styles/theme.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Minimum drag extent (px) before a shape is accepted on finish. */
const MIN_EXTENT = 10;

/** Minimum points for a freehand stroke to be accepted. */
const FREEHAND_MIN_POINTS = 2;

/**
 * Per-shape drawing behaviour.
 *
 * `overlay` — the full-viewport annotator overlay div (fixed-positioned, client coords).
 * `svgLayer` — a single `<svg>` appended to `overlay`; SVG-backed modes draw into it.
 *
 * Flow: annotator calls `start(x, y)` on mousedown, `move(x, y)` on mousemove,
 * then `finish(x, y, anchorBounds)` on mouseup. `finish` returns `null` if the
 * shape is too small to accept (e.g. rectangle < 10px); otherwise it returns
 * the serialized `Geometry` plus the `DOMRect` client-bounds used for anchoring.
 */
export interface DrawingMode {
  readonly shape: Shape;
  start(clientX: number, clientY: number): void;
  move(clientX: number, clientY: number): void;
  finish(clientX: number, clientY: number, anchorBounds: DOMRect): { geometry: Geometry; bounds: DOMRect } | null;
  cancel(): void;
}

/** Factory — builds the right mode for the chosen shape. */
export function createDrawingMode(
  shape: Shape,
  overlay: HTMLElement,
  svgLayer: SVGSVGElement,
  colors: ThemeColors,
): DrawingMode {
  switch (shape) {
    case "rectangle":
      return new RectangleMode(overlay, colors);
    case "circle":
      return new CircleMode(svgLayer, colors);
    case "arrow":
      return new ArrowMode(svgLayer, colors);
    case "line":
      return new LineMode(svgLayer, colors);
    case "textbox":
      return new TextboxMode(overlay, colors);
    case "freehand":
      return new FreehandMode(svgLayer, colors);
  }
}

// ---------------------------------------------------------------------------
// Rectangle (div with a border)
// ---------------------------------------------------------------------------

class RectangleMode implements DrawingMode {
  readonly shape: Shape = "rectangle";
  private el: HTMLDivElement | null = null;
  private startX = 0;
  private startY = 0;

  constructor(
    private readonly overlay: HTMLElement,
    private readonly colors: ThemeColors,
  ) {}

  start(x: number, y: number): void {
    this.startX = x;
    this.startY = y;
    this.el?.remove();
    this.el = document.createElement("div");
    this.el.style.position = "fixed";
    this.el.style.border = `2px solid ${this.colors.accent}`;
    this.el.style.background = `${this.colors.accent}12`;
    this.el.style.pointerEvents = "none";
    this.el.style.borderRadius = "8px";
    this.el.style.boxShadow = `0 0 16px ${this.colors.accentGlow}`;
    this.overlay.appendChild(this.el);
  }

  move(x: number, y: number): void {
    if (!this.el) return;
    const left = Math.min(x, this.startX);
    const top = Math.min(y, this.startY);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.el.style.width = `${Math.abs(x - this.startX)}px`;
    this.el.style.height = `${Math.abs(y - this.startY)}px`;
  }

  finish(x: number, y: number, anchor: DOMRect): { geometry: Geometry; bounds: DOMRect } | null {
    const left = Math.min(x, this.startX);
    const top = Math.min(y, this.startY);
    const w = Math.abs(x - this.startX);
    const h = Math.abs(y - this.startY);
    this.el?.remove();
    this.el = null;
    if (w < MIN_EXTENT || h < MIN_EXTENT) return null;
    const bounds = new DOMRect(left, top, w, h);
    const geometry: Geometry = {
      shape: "rectangle",
      x: (left - anchor.left) / anchor.width,
      y: (top - anchor.top) / anchor.height,
      w: w / anchor.width,
      h: h / anchor.height,
    };
    return { geometry, bounds };
  }

  cancel(): void {
    this.el?.remove();
    this.el = null;
  }
}

// ---------------------------------------------------------------------------
// Textbox — same drag as rectangle, but geometry carries text + fontSize.
// Annotator fills geometry.text from the popup's message after finish.
// ---------------------------------------------------------------------------

class TextboxMode implements DrawingMode {
  readonly shape: Shape = "textbox";
  private el: HTMLDivElement | null = null;
  private startX = 0;
  private startY = 0;

  constructor(
    private readonly overlay: HTMLElement,
    private readonly colors: ThemeColors,
  ) {}

  start(x: number, y: number): void {
    this.startX = x;
    this.startY = y;
    this.el?.remove();
    this.el = document.createElement("div");
    this.el.style.position = "fixed";
    this.el.style.border = `2px dashed ${this.colors.accent}`;
    this.el.style.background = `${this.colors.accent}12`;
    this.el.style.pointerEvents = "none";
    this.el.style.borderRadius = "4px";
    this.overlay.appendChild(this.el);
  }

  move(x: number, y: number): void {
    if (!this.el) return;
    const left = Math.min(x, this.startX);
    const top = Math.min(y, this.startY);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.el.style.width = `${Math.abs(x - this.startX)}px`;
    this.el.style.height = `${Math.abs(y - this.startY)}px`;
  }

  finish(x: number, y: number, anchor: DOMRect): { geometry: Geometry; bounds: DOMRect } | null {
    const left = Math.min(x, this.startX);
    const top = Math.min(y, this.startY);
    const w = Math.abs(x - this.startX);
    const h = Math.abs(y - this.startY);
    this.el?.remove();
    this.el = null;
    if (w < MIN_EXTENT || h < MIN_EXTENT) return null;
    const bounds = new DOMRect(left, top, w, h);
    const geometry: Geometry = {
      shape: "textbox",
      x: (left - anchor.left) / anchor.width,
      y: (top - anchor.top) / anchor.height,
      w: w / anchor.width,
      h: h / anchor.height,
      text: "",
      fontSize: 14,
    };
    return { geometry, bounds };
  }

  cancel(): void {
    this.el?.remove();
    this.el = null;
  }
}

// ---------------------------------------------------------------------------
// SVG-backed modes — draw into the shared svgLayer
// ---------------------------------------------------------------------------

abstract class SvgMode implements DrawingMode {
  abstract readonly shape: Shape;
  protected startX = 0;
  protected startY = 0;
  protected svgNode: SVGElement | null = null;

  constructor(
    protected readonly svgLayer: SVGSVGElement,
    protected readonly colors: ThemeColors,
  ) {
    // Size the layer to the viewport so internal coords align with client coords.
    svgLayer.style.position = "fixed";
    svgLayer.style.inset = "0";
    svgLayer.style.pointerEvents = "none";
    svgLayer.style.overflow = "visible";
    svgLayer.setAttribute("width", String(window.innerWidth));
    svgLayer.setAttribute("height", String(window.innerHeight));
    svgLayer.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
  }

  start(x: number, y: number): void {
    this.startX = x;
    this.startY = y;
    this.clearNode();
    this.svgNode = this.createNode(x, y);
    this.svgLayer.appendChild(this.svgNode);
  }

  move(x: number, y: number): void {
    if (!this.svgNode) return;
    this.updateNode(this.svgNode, x, y);
  }

  abstract finish(x: number, y: number, anchor: DOMRect): { geometry: Geometry; bounds: DOMRect } | null;

  cancel(): void {
    this.clearNode();
  }

  protected clearNode(): void {
    this.svgNode?.remove();
    this.svgNode = null;
  }

  protected abstract createNode(x: number, y: number): SVGElement;
  protected abstract updateNode(node: SVGElement, x: number, y: number): void;
}

class CircleMode extends SvgMode {
  readonly shape: Shape = "circle";

  protected createNode(x: number, y: number): SVGElement {
    const ell = document.createElementNS(SVG_NS, "ellipse");
    ell.setAttribute("cx", String(x));
    ell.setAttribute("cy", String(y));
    ell.setAttribute("rx", "0");
    ell.setAttribute("ry", "0");
    ell.setAttribute("stroke", this.colors.accent);
    ell.setAttribute("stroke-width", "2");
    ell.setAttribute("fill", `${this.colors.accent}14`);
    return ell;
  }

  protected updateNode(node: SVGElement, x: number, y: number): void {
    // Center is the midpoint between start and current drag point; radii are half the drag distance.
    const cx = (this.startX + x) / 2;
    const cy = (this.startY + y) / 2;
    const rx = Math.abs(x - this.startX) / 2;
    const ry = Math.abs(y - this.startY) / 2;
    node.setAttribute("cx", String(cx));
    node.setAttribute("cy", String(cy));
    node.setAttribute("rx", String(rx));
    node.setAttribute("ry", String(ry));
  }

  finish(x: number, y: number, anchor: DOMRect): { geometry: Geometry; bounds: DOMRect } | null {
    // Center is the midpoint; radii are half the drag distance.
    const cx = (this.startX + x) / 2;
    const cy = (this.startY + y) / 2;
    const rx = Math.abs(x - this.startX) / 2;
    const ry = Math.abs(y - this.startY) / 2;
    this.clearNode();
    if (rx * 2 < MIN_EXTENT || ry * 2 < MIN_EXTENT) return null;
    const bounds = new DOMRect(cx - rx, cy - ry, rx * 2, ry * 2);
    const geometry: Geometry = {
      shape: "circle",
      cx: (cx - anchor.left) / anchor.width,
      cy: (cy - anchor.top) / anchor.height,
      rx: rx / anchor.width,
      ry: ry / anchor.height,
    };
    return { geometry, bounds };
  }
}

class LineMode extends SvgMode {
  readonly shape: Shape = "line";

  protected createNode(x: number, y: number): SVGElement {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x));
    line.setAttribute("y1", String(y));
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", this.colors.accent);
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    return line;
  }

  protected updateNode(node: SVGElement, x: number, y: number): void {
    node.setAttribute("x2", String(x));
    node.setAttribute("y2", String(y));
  }

  finish(x: number, y: number, anchor: DOMRect): { geometry: Geometry; bounds: DOMRect } | null {
    this.clearNode();
    const dx = Math.abs(x - this.startX);
    const dy = Math.abs(y - this.startY);
    if (dx < MIN_EXTENT && dy < MIN_EXTENT) return null;
    const bounds = new DOMRect(Math.min(this.startX, x), Math.min(this.startY, y), dx, dy);
    const geometry: Geometry = {
      shape: "line",
      x1: (this.startX - anchor.left) / anchor.width,
      y1: (this.startY - anchor.top) / anchor.height,
      x2: (x - anchor.left) / anchor.width,
      y2: (y - anchor.top) / anchor.height,
    };
    return { geometry, bounds };
  }
}

class ArrowMode extends SvgMode {
  readonly shape: Shape = "arrow";
  private headNode: SVGPolygonElement | null = null;
  private readonly HEAD_SIZE = 12;

  protected createNode(x: number, y: number): SVGElement {
    const g = document.createElementNS(SVG_NS, "g");
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x));
    line.setAttribute("y1", String(y));
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", this.colors.accent);
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    const poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("fill", this.colors.accent);
    g.appendChild(line);
    g.appendChild(poly);
    this.headNode = poly;
    return g;
  }

  protected updateNode(node: SVGElement, x: number, y: number): void {
    const line = node.querySelector("line");
    if (!line) return;
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(y));
    this.updateHead(x, y);
  }

  private updateHead(x: number, y: number): void {
    if (!this.headNode) return;
    const angle = Math.atan2(y - this.startY, x - this.startX);
    const a1 = angle + Math.PI - Math.PI / 7;
    const a2 = angle + Math.PI + Math.PI / 7;
    this.headNode.setAttribute(
      "points",
      `${x},${y} ${x + Math.cos(a1) * this.HEAD_SIZE},${y + Math.sin(a1) * this.HEAD_SIZE} ${x + Math.cos(a2) * this.HEAD_SIZE},${y + Math.sin(a2) * this.HEAD_SIZE}`,
    );
  }

  finish(x: number, y: number, anchor: DOMRect): { geometry: Geometry; bounds: DOMRect } | null {
    this.clearNode();
    this.headNode = null;
    const dx = Math.abs(x - this.startX);
    const dy = Math.abs(y - this.startY);
    if (dx < MIN_EXTENT && dy < MIN_EXTENT) return null;
    const bounds = new DOMRect(Math.min(this.startX, x), Math.min(this.startY, y), dx, dy);
    const geometry: Geometry = {
      shape: "arrow",
      x1: (this.startX - anchor.left) / anchor.width,
      y1: (this.startY - anchor.top) / anchor.height,
      x2: (x - anchor.left) / anchor.width,
      y2: (y - anchor.top) / anchor.height,
      headSize: this.HEAD_SIZE,
    };
    return { geometry, bounds };
  }
}

class FreehandMode extends SvgMode {
  readonly shape: Shape = "freehand";
  private points: Array<[number, number]> = [];

  protected createNode(x: number, y: number): SVGElement {
    this.points = [[x, y]];
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("fill", this.colors.accent);
    path.setAttribute("stroke", this.colors.accent);
    path.setAttribute("stroke-width", "1");
    return path;
  }

  protected updateNode(node: SVGElement, x: number, y: number): void {
    this.points.push([x, y]);
    node.setAttribute("d", buildFreehandPath(this.points, 4));
  }

  finish(_x: number, _y: number, anchor: DOMRect): { geometry: Geometry; bounds: DOMRect } | null {
    const pts = this.points.slice();
    this.clearNode();
    this.points = [];
    if (pts.length < FREEHAND_MIN_POINTS) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of pts) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    const bounds = new DOMRect(minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));

    const geometry: Geometry = {
      shape: "freehand",
      points: pts.map(([px, py]) => [(px - anchor.left) / anchor.width, (py - anchor.top) / anchor.height]),
      strokeWidth: 4,
    };
    return { geometry, bounds };
  }
}

function buildFreehandPath(points: Array<[number, number]>, size: number): string {
  const outline = getStroke(points, { size, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
  if (outline.length === 0) return "";
  const first = outline[0];
  if (!first) return "";
  let d = `M ${first[0]} ${first[1]}`;
  for (let i = 1; i < outline.length; i++) {
    const p = outline[i];
    if (!p) continue;
    d += ` L ${p[0]} ${p[1]}`;
  }
  return `${d} Z`;
}
