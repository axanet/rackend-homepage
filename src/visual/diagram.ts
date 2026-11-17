// Static SVG rendering of the hero scene, generated from the same slab list
// and camera as the WebGPU version. Used as the no-JS / no-WebGPU fallback and
// for the Open Graph image.

import { CLIENTS, MAT, SLABS, cross, makeProjector, tracePoints, type Slab, type V3 } from "./layout";

export interface DiagramPalette {
  platform: string;
  platformSide: string;
  cabinet: string;
  unit: string;
  device: string;
  screen: string;
  line: string;
  accent: string;
  resp: string;
  event: string;
}

export interface DiagramOptions {
  width: number;
  height: number;
  /** world units visible left/right of the camera target (matches scene.ts) */
  halfWidth?: number;
  yaw?: number;
  pitch?: number;
  /** shift of the camera target on screen, in px */
  offset?: [number, number];
}

const TARGET: V3 = [0, 0.75, 1.35];
const f = (n: number) => n.toFixed(1);

function outline(w: number, h: number, r: number, steps = 6): [number, number][] {
  const pts: [number, number][] = [];
  const hw = w / 2 - r, hh = h / 2 - r;
  const corners: [number, number, number][] = [[hw, hh, 0], [-hw, hh, 0.5], [-hw, -hh, 1], [hw, -hh, 1.5]];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= steps; k++) {
      const a = (a0 + (k / steps) * 0.5) * Math.PI;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

function hull(points: V3[]): V3[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: V3, a: V3, b: V3) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (src: V3[]) => {
    const out: V3[] = [];
    for (const q of src) {
      while (out.length >= 2 && turn(out[out.length - 2]!, out[out.length - 1]!, q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half(p.reverse())];
}

export function renderDiagram(pal: DiagramPalette, opts: DiagramOptions): string {
  const { width, height, halfWidth = 5.25, yaw = 0.5, pitch = 0.5, offset = [0, 0] } = opts;
  const scale = width / 2 / halfWidth;
  const raw = makeProjector({ yaw, pitch, scale, cx: 0, cy: 0 });
  const t = raw.project(TARGET);
  const { project, view } = makeProjector({ yaw, pitch, scale, cx: width / 2 - t[0] + offset[0], cy: height / 2 - t[1] + offset[1] });

  const path = (pts: V3[]) => `M${pts.map((p) => `${f(p[0])},${f(p[1])}`).join("L")}Z`;

  /** A rounded rect drawn on one of a slab's caps, in the slab's local frame. */
  const onCap = (s: Slab, sign: 1 | -1, w: number, h: number, r: number, at: [number, number] = [0, 0]) => {
    const n = cross(s.x, s.y);
    const z = sign * (s.d / 2);
    return outline(w, h, Math.min(r, w / 2, h / 2)).map(([lx, ly]) => {
      const x = lx + at[0], y = ly + at[1];
      return project([
        s.c[0] + s.x[0] * x + s.y[0] * y + n[0] * z,
        s.c[1] + s.x[1] * x + s.y[1] * y + n[1] * z,
        s.c[2] + s.x[2] * x + s.y[2] * y + n[2] * z,
      ]);
    });
  };

  const colour = (s: Slab) =>
    s.mat === MAT.platform ? pal.platform : s.mat === MAT.cabinet ? pal.cabinet : s.mat === MAT.unit ? pal.unit : pal.device;

  const drawSlab = (s: Slab): string => {
    const n = cross(s.x, s.y);
    const facing = n[0] * view[0] + n[1] * view[1] + n[2] * view[2] > 0 ? 1 : -1;
    const near = onCap(s, facing, s.w, s.h, s.r);
    const far = onCap(s, -facing as 1 | -1, s.w, s.h, s.r);
    const silhouette = path(hull([...near, ...far]));
    const base = colour(s);
    let out =
      s.mat === MAT.platform
        ? `<path d="${silhouette}" fill="${pal.platformSide}"/>`
        : `<path d="${silhouette}" fill="${base}"/><path d="${silhouette}" fill="#000" opacity=".14"/>`;
    out += `<path d="${path(near)}" fill="${base}"/>`;

    if (facing === 1 && s.mat === MAT.unit) {
      const hw = s.w / 2;
      for (let k = 0; k < 3; k++) out += `<path d="${path(onCap(s, 1, 0.12, 0.1, 0.025, [-hw + 0.15 + k * 0.17, 0]))}" fill="${pal.line}" opacity=".75"/>`;
      out += `<path d="${path(onCap(s, 1, 0.044, 0.044, 0.022, [hw - 0.27, 0]))}" fill="${pal.line}"/>`;
      out += `<path d="${path(onCap(s, 1, 0.068, 0.068, 0.034, [hw - 0.14, 0]))}" fill="${s.id === 3 ? pal.accent : pal.line}"/>`;
    }
    if (facing === 1 && s.mat === MAT.screen) {
      const iw = s.w - 0.09, ih = s.h - 0.09;
      out += `<path d="${path(onCap(s, 1, iw, ih, 0.06))}" fill="${pal.screen}"/>`;
      const left = -iw / 2 + 0.07, top = ih / 2 - 0.09, rowH = Math.min(0.05, (ih / 2) * 0.11);
      const row = (w: number, y: number, fill: string, opacity = 1) =>
        `<path d="${path(onCap(s, 1, w, rowH * 2, rowH, [left + w / 2, y]))}" fill="${fill}" opacity="${opacity}"/>`;
      out += row((iw / 2) * 0.56, top, pal.line);
      const gap = Math.min((ih - 0.3) / 3, 0.17);
      for (let r = 0; r < 3; r++) {
        const w = (iw / 2) * (0.86 - r * 0.16) * 2 - 0.14;
        out += row(w, top - 0.16 - r * gap, r === 0 && s.id === 2 ? pal.accent : pal.line, r === 0 && s.id === 2 ? 1 : 0.55);
      }
    }
    return out;
  };

  // traces, with a request heading in and a response heading out
  const traces = [0, 1, 2].map((i) => tracePoints(i, 16));
  const along = (pts: V3[], s: number): V3 => {
    let left = s;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k]!, b = pts[k + 1]!;
      const l = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (left <= l || k === pts.length - 2) {
        const u = Math.min(Math.max(left / l, 0), 1);
        return [a[0] + (b[0] - a[0]) * u, 0, a[2] + (b[2] - a[2]) * u];
      }
      left -= l;
    }
    return pts[pts.length - 1]!;
  };
  // one stroke with a gradient along it: solid at the head, transparent at the tail
  const comet = (i: number, head: number, dir: 1 | -1, col: string) => {
    const pts = traces[i]!, steps = 20, tail = 1.15;
    const line = Array.from({ length: steps + 1 }, (_, k) => project(along(pts, head - (dir * tail * (steps - k)) / steps)));
    const a = line[0]!, h = line[steps]!;
    const id = `comet-${i}`;
    return (
      `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(h[0])}" y2="${f(h[1])}">` +
      `<stop offset="0" stop-color="${col}" stop-opacity="0"/><stop offset="1" stop-color="${col}"/></linearGradient></defs>` +
      `<polyline points="${line.map((p) => `${f(p[0])},${f(p[1])}`).join(" ")}" fill="none" stroke="url(#${id})" stroke-width="${f(scale * 0.11)}" stroke-linecap="round" stroke-linejoin="round"/>`
    );
  };

  const [platform, ...rest] = SLABS;
  const sorted = rest
    .map((s) => ({ s, depth: project(s.c)[2] }))
    .sort((a, b) => a.depth - b.depth)
    .map(({ s }) => drawSlab(s));

  // soft contact shadows
  const shadow = (x: number, z: number, rx: number, rz: number, opacity: number) => {
    const c = project([x, 0, z]);
    return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(rx * scale)}" ry="${f(rz * scale * Math.sin(pitch))}" fill="#000" opacity="${opacity}"/>`;
  };

  return [
    drawSlab(platform!),
    shadow(-0.08, -0.1, 1.15, 1.05, 0.08),
    ...CLIENTS.map(([x, z]) => shadow(x - 0.05, z - 0.08, 0.6, 0.5, 0.06)),
    ...traces.map((pts) => `<polyline points="${pts.map((p) => project(p)).map((p) => `${f(p[0])},${f(p[1])}`).join(" ")}" fill="none" stroke="${pal.line}" stroke-width="${f(scale * 0.044)}" stroke-linecap="round" stroke-linejoin="round"/>`),
    comet(0, 3.1, 1, pal.accent),
    comet(2, 1.3, -1, pal.resp),
    ...sorted,
  ].join("");
}
