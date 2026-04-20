import type { Geometry } from "@colaborate/core";
import { getStroke } from "perfect-freehand";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Render a geometry highlight overlay for the given annotation.
 *
 * The returned element is absolutely positioned in **document** coordinates
 * (i.e. includes window.scrollX/scrollY). Caller appends it to a container
 * that itself sits at (0,0) in document coords (e.g. `#colaborate-markers`).
 *
 * - Rectangle / textbox → `<div>` with a border (matches pre-1c behaviour).
 * - Circle / arrow / line / freehand → `<svg>` sized to the anchor's bounding box.
 *
 * Non-rectangle SVGs use the top-left of the anchor as the SVG's origin,
 * so coordinates inside the SVG are `(rel*anchorSize)` (no scroll offset).
 */
export function renderShapeHighlight(
  geometry: Geometry,
  anchorBounds: DOMRect,
  color: string,
): HTMLElement | SVGSVGElement {
  const { left, top, width, height } = anchorBounds;
  const docLeft = left + window.scrollX;
  const docTop = top + window.scrollY;

  switch (geometry.shape) {
    case "rectangle":
      return rectDiv(
        docLeft + geometry.x * width,
        docTop + geometry.y * height,
        geometry.w * width,
        geometry.h * height,
        color,
      );

    case "textbox":
      return textboxDiv(
        docLeft + geometry.x * width,
        docTop + geometry.y * height,
        geometry.w * width,
        geometry.h * height,
        geometry.text,
        geometry.fontSize,
        color,
      );

    case "circle":
      return circleSvg(docLeft, docTop, width, height, geometry, color);

    case "arrow":
      return arrowSvg(docLeft, docTop, width, height, geometry, color);

    case "line":
      return lineSvg(docLeft, docTop, width, height, geometry, color);

    case "freehand":
      return freehandSvg(docLeft, docTop, width, height, geometry, color);
  }
}

// ---------------------------------------------------------------------------
// Rectangle / textbox → div
// ---------------------------------------------------------------------------

function rectDiv(left: number, top: number, w: number, h: number, color: string): HTMLDivElement {
  const div = document.createElement("div");
  const s = div.style;
  s.position = "absolute";
  s.left = `${left}px`;
  s.top = `${top}px`;
  s.width = `${w}px`;
  s.height = `${h}px`;
  s.border = `2px solid ${color}`;
  s.background = `${color}0c`;
  s.borderRadius = "8px";
  s.pointerEvents = "none";
  s.zIndex = "-1";
  s.boxShadow = `0 0 16px ${color}20`;
  return div;
}

function textboxDiv(
  left: number,
  top: number,
  w: number,
  h: number,
  text: string,
  fontSize: number,
  color: string,
): HTMLDivElement {
  const div = rectDiv(left, top, w, h, color);
  div.style.background = `${color}1a`;
  const span = document.createElement("span");
  span.textContent = text;
  const ss = span.style;
  ss.position = "absolute";
  ss.inset = "0";
  ss.padding = "6px 10px";
  ss.display = "flex";
  ss.alignItems = "center";
  ss.fontFamily = '"Inter",system-ui,-apple-system,sans-serif';
  ss.fontSize = `${fontSize}px`;
  ss.color = color;
  ss.whiteSpace = "pre-wrap";
  ss.wordBreak = "break-word";
  div.appendChild(span);
  return div;
}

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function svg(docLeft: number, docTop: number, w: number, h: number): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, "svg");
  el.setAttribute("width", String(w));
  el.setAttribute("height", String(h));
  el.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const es = el.style;
  es.position = "absolute";
  es.left = `${docLeft}px`;
  es.top = `${docTop}px`;
  es.pointerEvents = "none";
  es.zIndex = "-1";
  es.overflow = "visible";
  return el;
}

function circleSvg(
  docLeft: number,
  docTop: number,
  w: number,
  h: number,
  g: Extract<Geometry, { shape: "circle" }>,
  color: string,
): SVGSVGElement {
  const s = svg(docLeft, docTop, w, h);
  const ell = document.createElementNS(SVG_NS, "ellipse");
  ell.setAttribute("cx", String(g.cx * w));
  ell.setAttribute("cy", String(g.cy * h));
  ell.setAttribute("rx", String(g.rx * w));
  ell.setAttribute("ry", String(g.ry * h));
  ell.setAttribute("fill", `${color}14`);
  ell.setAttribute("stroke", color);
  ell.setAttribute("stroke-width", "2");
  s.appendChild(ell);
  return s;
}

function lineSvg(
  docLeft: number,
  docTop: number,
  w: number,
  h: number,
  g: Extract<Geometry, { shape: "line" }>,
  color: string,
): SVGSVGElement {
  const s = svg(docLeft, docTop, w, h);
  s.appendChild(makeLine(g.x1 * w, g.y1 * h, g.x2 * w, g.y2 * h, color));
  return s;
}

function arrowSvg(
  docLeft: number,
  docTop: number,
  w: number,
  h: number,
  g: Extract<Geometry, { shape: "arrow" }>,
  color: string,
): SVGSVGElement {
  const s = svg(docLeft, docTop, w, h);
  const x1 = g.x1 * w,
    y1 = g.y1 * h,
    x2 = g.x2 * w,
    y2 = g.y2 * h;
  s.appendChild(makeLine(x1, y1, x2, y2, color));
  s.appendChild(makeArrowhead(x1, y1, x2, y2, g.headSize, color));
  return s;
}

function freehandSvg(
  docLeft: number,
  docTop: number,
  w: number,
  h: number,
  g: Extract<Geometry, { shape: "freehand" }>,
  color: string,
): SVGSVGElement {
  const s = svg(docLeft, docTop, w, h);
  const abs: Array<[number, number]> = g.points.map(([x, y]) => [x * w, y * h]);
  const outline = getStroke(abs, { size: g.strokeWidth, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", outlineToSvgPath(outline));
  path.setAttribute("fill", color);
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", "1");
  s.appendChild(path);
  return s;
}

function makeLine(x1: number, y1: number, x2: number, y2: number, color: string): SVGLineElement {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-linecap", "round");
  return line;
}

function makeArrowhead(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  headSize: number,
  color: string,
): SVGPolygonElement {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const a1 = angle + Math.PI - Math.PI / 7;
  const a2 = angle + Math.PI + Math.PI / 7;
  const p1x = x2 + Math.cos(a1) * headSize;
  const p1y = y2 + Math.sin(a1) * headSize;
  const p2x = x2 + Math.cos(a2) * headSize;
  const p2y = y2 + Math.sin(a2) * headSize;
  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points", `${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}`);
  poly.setAttribute("fill", color);
  return poly;
}

function outlineToSvgPath(outline: number[][]): string {
  if (outline.length === 0) return "";
  if (outline.length === 1) {
    const p = outline[0];
    if (!p) return "";
    return `M ${p[0]} ${p[1]} Z`;
  }
  const first = outline[0];
  if (!first) return "";
  let d = `M ${first[0]} ${first[1]}`;
  for (let i = 1; i < outline.length; i++) {
    const p = outline[i];
    if (!p) continue;
    d += ` L ${p[0]} ${p[1]}`;
  }
  d += " Z";
  return d;
}
