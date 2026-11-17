// Turns the slab list from layout.ts into one static triangle mesh.
//
// A slab is a rounded rectangle extruded along its normal, with a quarter-round
// bevel on both rims. Per vertex we keep enough to shade it without textures:
//   position  world position
//   normal    world normal
//   local     position in the slab's own frame (x, y in the outline plane)
//   part      material, id, half width, half height
//   face      local normal · extrusion axis (1 on the front cap, -1 on the back)

import { cross, type Slab, type V3 } from "./layout";

export const FLOATS_PER_VERTEX = 14;
const CORNER_STEPS = 8;
const BEVEL_STEPS = 3;

/** Outline of a rounded rectangle, counter-clockwise, with outward normals. */
function outline(w: number, h: number, r: number) {
  const pts: { x: number; y: number; nx: number; ny: number }[] = [];
  const hw = w / 2 - r, hh = h / 2 - r;
  const corners: [number, number, number][] = [
    [hw, hh, 0], [-hw, hh, Math.PI / 2], [-hw, -hh, Math.PI], [hw, -hh, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= CORNER_STEPS; k++) {
      const a = a0 + (k / CORNER_STEPS) * (Math.PI / 2);
      const nx = Math.cos(a), ny = Math.sin(a);
      pts.push({ x: cx + nx * r, y: cy + ny * r, nx, ny });
    }
  }
  return pts;
}

export function buildMesh(slabs: Slab[]) {
  const verts: number[] = [];
  const indices: number[] = [];

  for (const s of slabs) {
    const n = cross(s.x, s.y);
    const r = Math.min(s.r, s.w / 2, s.h / 2);
    const b = Math.min(s.bevel, r, s.d / 2);
    const ring = outline(s.w, s.h, r);
    const N = ring.length;
    const base = verts.length / FLOATS_PER_VERTEX;

    const push = (lx: number, ly: number, lz: number, nx: number, ny: number, nz: number) => {
      const world = (a: number, b2: number, c: number, o: V3 | null): V3 => [
        (o?.[0] ?? 0) + s.x[0] * a + s.y[0] * b2 + n[0] * c,
        (o?.[1] ?? 0) + s.x[1] * a + s.y[1] * b2 + n[1] * c,
        (o?.[2] ?? 0) + s.x[2] * a + s.y[2] * b2 + n[2] * c,
      ];
      const p = world(lx, ly, lz, s.c);
      const wn = world(nx, ny, nz, null);
      verts.push(p[0], p[1], p[2], wn[0], wn[1], wn[2], lx, ly, lz, s.mat, s.id, s.w / 2, s.h / 2, nz);
    };

    // rings from the front cap rim, around the bevel, down the side, to the back cap rim
    const rings: { inset: number; z: number; side: number; nz: number }[] = [];
    for (let j = 0; j <= BEVEL_STEPS; j++) {
      const phi = (j / BEVEL_STEPS) * (Math.PI / 2);
      rings.push({ inset: b * (1 - Math.sin(phi)), z: s.d / 2 - b * (1 - Math.cos(phi)), side: Math.sin(phi), nz: Math.cos(phi) });
    }
    for (let j = BEVEL_STEPS; j >= 0; j--) {
      const phi = (j / BEVEL_STEPS) * (Math.PI / 2);
      rings.push({ inset: b * (1 - Math.sin(phi)), z: -(s.d / 2 - b * (1 - Math.cos(phi))), side: Math.sin(phi), nz: -Math.cos(phi) });
    }
    for (const ringDef of rings) {
      for (const o of ring) {
        push(o.x - o.nx * ringDef.inset, o.y - o.ny * ringDef.inset, ringDef.z, o.nx * ringDef.side, o.ny * ringDef.side, ringDef.nz);
      }
    }
    for (let j = 0; j < rings.length - 1; j++) {
      for (let k = 0; k < N; k++) {
        const a = base + j * N + k, a2 = base + j * N + ((k + 1) % N);
        const c = a + N, c2 = a2 + N;
        indices.push(a, a2, c, a2, c2, c);
      }
    }
    // caps: a fan from the centre to the first / last ring
    const front = verts.length / FLOATS_PER_VERTEX;
    push(0, 0, s.d / 2, 0, 0, 1);
    const back = front + 1;
    push(0, 0, -s.d / 2, 0, 0, -1);
    const last = base + (rings.length - 1) * N;
    for (let k = 0; k < N; k++) {
      indices.push(front, base + k, base + ((k + 1) % N));
      indices.push(back, last + ((k + 1) % N), last + k);
    }
  }

  return { vertices: new Float32Array(verts), indices: new Uint32Array(indices) };
}
