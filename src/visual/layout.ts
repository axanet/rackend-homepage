// The hero scene, described once: a server rack on a platform, three client
// devices, and the traces that carry requests between them.
//
// Everything is built from one primitive, the "slab": a rounded rectangle
// extruded along its normal with a small bevel. The WebGPU mesh (mesh.ts) and
// the static SVG fallback (diagram.ts) are both generated from this list.
//
// The trace paths and the request schedule are mirrored in common.wgsl.
// Change them together.

export type V3 = [number, number, number];

export const MAT = { platform: 0, cabinet: 1, unit: 2, device: 3, screen: 4 } as const;

export interface Slab {
  /** centre */
  c: V3;
  /** unit axes of the rounded-rect plane; the slab extrudes along x × y */
  x: V3;
  y: V3;
  /** size along x, y and the extrusion */
  w: number;
  h: number;
  d: number;
  /** corner radius of the outline, and bevel of the extrusion edges */
  r: number;
  bevel: number;
  mat: number;
  /** unit index for rack units, client index for screens */
  id: number;
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const UP: V3 = [0, 1, 0];
const X: V3 = [1, 0, 0];
const BACK: V3 = [0, 0, -1];

export const RACK = { w: 1.5, depth: 1.3, h: 2.7, units: 6 };
export const PLATFORM = { c: [0, -0.09, 1.55] as V3, w: 8.6, depth: 6.4, r: 0.7 };

/** Where each client stands on the platform (x, z). Mirrored in common.wgsl. */
export const CLIENTS: [number, number][] = [
  [-3.0, 2.3], // laptop
  [0.0, 3.9], // phone
  [3.1, 1.9], // monitor
];
/** x of the rack port each client's trace runs into. */
export const PORTS = [-0.42, 0, 0.42];
export const PORT_Z = 0.7;
export const ELBOW = 0.35;

// Devices are turned towards the viewer.
const FACING = 0.45;
const F: V3 = [Math.sin(FACING), 0, Math.cos(FACING)];
const R: V3 = [Math.cos(FACING), 0, -Math.sin(FACING)];
const tilted = (t: number): V3 => add(mul(UP, Math.cos(t)), mul(F, -Math.sin(t)));
const ground = (i: number): V3 => [CLIENTS[i]![0], 0, CLIENTS[i]![1]];

function buildSlabs(): Slab[] {
  const s: Slab[] = [];

  s.push({ c: PLATFORM.c, x: X, y: BACK, w: PLATFORM.w, h: PLATFORM.depth, d: 0.18, r: PLATFORM.r, bevel: 0.05, mat: MAT.platform, id: 0 });

  // rack: cabinet + units on its front
  s.push({ c: [0, RACK.h / 2, 0], x: X, y: BACK, w: RACK.w, h: RACK.depth, d: RACK.h, r: 0.17, bevel: 0.08, mat: MAT.cabinet, id: 0 });
  for (let i = 0; i < RACK.units; i++) {
    s.push({ c: [0, 0.36 + i * 0.4, RACK.depth / 2 + 0.015], x: X, y: UP, w: 1.2, h: 0.31, d: 0.1, r: 0.075, bevel: 0.025, mat: MAT.unit, id: i });
  }

  // laptop
  {
    const p = ground(0), t = 0.3, y = tilted(t);
    s.push({ c: add(p, [0, 0.035, 0]), x: R, y: mul(F, -1), w: 1.1, h: 0.74, d: 0.07, r: 0.1, bevel: 0.025, mat: MAT.device, id: 0 });
    const hinge = add(add(p, mul(F, -0.35)), [0, 0.07, 0]);
    s.push({ c: add(hinge, mul(y, 0.37)), x: R, y, w: 1.1, h: 0.74, d: 0.05, r: 0.1, bevel: 0.02, mat: MAT.screen, id: 0 });
  }
  // phone on a small dock
  {
    const p = ground(1), t = 0.26, y = tilted(t);
    s.push({ c: add(p, [0, 0.04, 0]), x: R, y: mul(F, -1), w: 0.56, h: 0.4, d: 0.08, r: 0.13, bevel: 0.03, mat: MAT.device, id: 1 });
    s.push({ c: add(add(p, [0, 0.07, 0]), mul(y, 0.45)), x: R, y, w: 0.46, h: 0.9, d: 0.06, r: 0.11, bevel: 0.022, mat: MAT.screen, id: 1 });
  }
  // monitor
  {
    const p = ground(2), y = tilted(0.08);
    s.push({ c: add(p, [0, 0.035, 0]), x: R, y: mul(F, -1), w: 0.66, h: 0.44, d: 0.07, r: 0.14, bevel: 0.025, mat: MAT.device, id: 2 });
    s.push({ c: add(add(p, [0, 0.32, 0]), mul(F, -0.06)), x: R, y: UP, w: 0.15, h: 0.56, d: 0.07, r: 0.03, bevel: 0.02, mat: MAT.device, id: 2 });
    s.push({ c: add(p, [0, 1.02, 0]), x: R, y, w: 1.5, h: 0.94, d: 0.07, r: 0.1, bevel: 0.025, mat: MAT.screen, id: 2 });
  }
  return s;
}

export const SLABS = buildSlabs();

/** Trace of client `i` as a polyline on the platform (y = 0), elbow rounded. */
export function tracePoints(i: number, arcSteps = 8): V3[] {
  const [cx, cz] = CLIENTS[i]!;
  const px = PORTS[i]!;
  if (Math.abs(cx - px) < 1e-3) return [[cx, 0, cz], [px, 0, PORT_Z]];
  const dir = Math.sign(px - cx);
  const pts: V3[] = [[cx, 0, cz]];
  // arc centre: one elbow radius back along the run, one down towards the rack
  const ax = px - dir * ELBOW, az = cz - ELBOW;
  for (let k = 0; k <= arcSteps; k++) {
    const a = (k / arcSteps) * (Math.PI / 2);
    pts.push([ax + dir * Math.sin(a) * ELBOW, 0, az + Math.cos(a) * ELBOW]);
  }
  pts.push([px, 0, PORT_Z]);
  return pts;
}

// --- request schedule (mirrored in common.wgsl) ------------------------------

export const CYCLE_SECONDS = 4.6;
/** Phase (0..1) of a cycle at which the request reaches the rack. */
export const ARRIVAL_PHASE = 0.32;
export const sender = (cycle: number) => cycle % 3;
/** Every fourth cycle is a write that is also pushed to the other clients. */
export const isBroadcast = (cycle: number) => cycle % 4 === 3;

// --- orthographic projection for the SVG fallback ----------------------------

/** Yaw around +Y, then pitch down. Returns [x, y, depth]; larger depth = closer. */
export function makeProjector(o: { yaw: number; pitch: number; scale: number; cx: number; cy: number }) {
  const cyw = Math.cos(o.yaw), syw = Math.sin(o.yaw), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
  const project = (p: V3): V3 => {
    const x = p[0] * cyw - p[2] * syw;
    const z = p[0] * syw + p[2] * cyw;
    return [o.cx + x * o.scale, o.cy - p[1] * o.scale * cp + z * o.scale * sp, z * cp + p[1] * sp];
  };
  const view: V3 = [syw * cp, sp, cyw * cp];
  return { project, view };
}
