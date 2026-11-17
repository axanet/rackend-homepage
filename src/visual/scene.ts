// Hero visual: a server rack, three clients, and one request at a time
// travelling to the rack and back. Rendered with vgpu (WebGPU).
//
// Progressive enhancement only: the static SVG in HostScene.astro is the
// baseline. This module swaps in the live scene when WebGPU is available.

import { clock, draw, frame, frameLoop, geometry, init, surface, uniforms } from "vgpu";
import type { Frame, FrameLoopHandle } from "vgpu";
import { orbitRig, orthographic, rigPose, viewMatrices } from "vgpu/scene";
import sceneShader from "./scene.wgsl";
import { ARRIVAL_PHASE, CYCLE_SECONDS, SLABS } from "./layout";
import { buildMesh, FLOATS_PER_VERTEX } from "./mesh";

type Vec4 = [number, number, number, number];

/** Fired on the scene root each time a request reaches the rack. */
export const BEAT_EVENT = "rackend:beat";

// Camera: orthographic, looking at the rack's front from slightly right.
const YAW = 0.5;
const PITCH = 0.5;
const HALF_WIDTH = 5.25; // world units visible left/right of the target

const COLOURS = ["platform", "platform-side", "cabinet", "unit", "device", "screen", "line", "accent", "resp", "event"] as const;

function hexToRgba(hex: string): Vec4 {
  const h = hex.trim().replace("#", "");
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (h.length < 6 || Number.isNaN(n)) return [0.5, 0.5, 0.5, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

function readPalette(el: HTMLElement) {
  const css = getComputedStyle(el);
  const [platform, platformSide, cabinet, unit, device, screen, line, accent, resp, event] = COLOURS.map((name) =>
    hexToRgba(css.getPropertyValue(`--scene-${name}`)),
  ) as [Vec4, Vec4, Vec4, Vec4, Vec4, Vec4, Vec4, Vec4, Vec4, Vec4];
  const dark = css.getPropertyValue("--scene-dark").trim() === "1" ? 1 : 0;
  return { colours: { platform, platformSide, cabinet, unit, device, screen, line, accent, resp, event }, dark };
}

/** Starts the scene on `canvas`. Resolves to a teardown function. */
export async function mountScene(root: HTMLElement, canvas: HTMLCanvasElement): Promise<() => void> {
  const gpu = await init({ powerPreference: "low-power", label: "rackend-hero" });
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const target = surface(gpu, canvas, {
    dpr: [1, 2],
    depth: true,
    msaa: true,
    alphaMode: "premultiplied",
    clearColor: [0, 0, 0, 0],
  });

  const palette = readPalette(root);
  const params: Vec4 = [0, palette.dark, 0, 0];
  const scene = uniforms(gpu, { viewProj: new Float32Array(16), ...palette.colours, params });

  const mesh = buildMesh(SLABS);
  const solids = draw(gpu, {
    label: "scene",
    shader: sceneShader,
    geometry: geometry(gpu, {
      label: "scene-mesh",
      buffers: [
        {
          data: mesh.vertices,
          stride: FLOATS_PER_VERTEX * 4,
          // explicit locations: shader identifiers are minified at build time
          attributes: {
            position: { format: "float32x3", location: 0 },
            normal: { format: "float32x3", location: 1 },
            local: { format: "float32x3", location: 2 },
            part: { format: "float32x4", location: 3 },
            face: { format: "float32", location: 4 },
          },
        },
      ],
      indices: mesh.indices,
    }),
    set: { scene },
  });

  // --- camera ------------------------------------------------------------
  const rig = orbitRig({ target: [0, 0.75, 1.35], yaw: YAW, pitch: PITCH, distance: 30 });
  const pose = { position: new Float32Array(3), quaternion: new Float32Array(4) };
  const projection = new Float32Array(16);
  const camera = { view: new Float32Array(16), viewProjection: new Float32Array(16) };

  target.onResize(({ width, height }) => {
    const halfHeight = HALF_WIDTH / (width / Math.max(height, 1));
    orthographic(
      { left: -HALF_WIDTH, right: HALF_WIDTH, bottom: -halfHeight, top: halfHeight, near: 0.1, far: 80 },
      projection,
    );
  });

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const onPointer = (e: PointerEvent) => {
    const r = root.getBoundingClientRect();
    pointer.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    pointer.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
  };
  if (!reduceMotion) window.addEventListener("pointermove", onPointer, { passive: true });

  let lastBeat = -1;
  const update = (time: number) => {
    // a slow sway plus a little pointer parallax; never a full orbit
    pointer.sx += (pointer.x - pointer.sx) * 0.03;
    pointer.sy += (pointer.y - pointer.sy) * 0.03;
    rig.yaw = YAW + Math.sin(time * 0.22) * 0.05 + pointer.sx * 0.07;
    rig.pitch = PITCH + pointer.sy * 0.03;
    viewMatrices(rigPose(rig, pose), projection, camera);
    params[0] = time;
    scene.set({ viewProj: camera.viewProjection, params });

    const cycle = Math.floor(time / CYCLE_SECONDS);
    if (cycle !== lastBeat && (time / CYCLE_SECONDS) % 1 >= ARRIVAL_PHASE) {
      lastBeat = cycle;
      root.dispatchEvent(new CustomEvent(BEAT_EVENT, { detail: { cycle } }));
    }
  };

  const render = (f: Frame) => f.pass({ target }, solids);

  await solids.compile(target);

  // --- loop, paused while offscreen ---------------------------------------
  const time = clock(gpu);
  let loop: FrameLoopHandle | undefined;
  const start = () => {
    if (loop || reduceMotion) return;
    loop = frameLoop(gpu, (f) => {
      update(time.time);
      render(f);
    });
  };
  const stop = () => {
    loop?.stop();
    loop = undefined;
  };

  // reduced motion: one still frame with a request mid-flight
  const still = () => {
    update(CYCLE_SECONDS * 0.2);
    frame(gpu, render);
  };
  if (reduceMotion) still();

  const io = new IntersectionObserver(([entry]) => (entry?.isIntersecting ? start() : stop()));
  io.observe(root);

  // follow theme switches
  const themeObserver = new MutationObserver(() => {
    const p = readPalette(root);
    params[1] = p.dark;
    scene.set({ ...p.colours, params });
    if (reduceMotion) still();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  root.dataset.scene = "live";

  return () => {
    stop();
    io.disconnect();
    themeObserver.disconnect();
    window.removeEventListener("pointermove", onPointer);
    gpu.dispose();
  };
}
