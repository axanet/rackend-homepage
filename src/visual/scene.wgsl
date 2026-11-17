// One draw for the whole scene: every solid is a rounded slab (see mesh.ts),
// shaded matte. Traces, pulses and contact shadows are painted flat onto the
// platform's top face. No glow, no additive blending.
import {
  Scene, Trace, Beat, clientXZ, trace, beat,
  requestPulse, returnPulse, processing, activeUnit, arrival,
} from "./common.wgsl";

@group(0) @binding(0) var<uniform> scene: Scene;

struct Out {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) local: vec3f,
  @location(3) @interpolate(flat) part: vec4f,
  @location(4) face: f32,
}

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) local: vec3f,
  @location(3) part: vec4f,
  @location(4) face: f32,
) -> Out {
  var out: Out;
  out.clip = scene.viewProj * vec4f(position, 1.0);
  out.world = position;
  out.normal = normal;
  out.local = local;
  out.part = part;
  out.face = face;
  return out;
}

// --- 2D helpers --------------------------------------------------------------

fn sdRoundRect(p: vec2f, half: vec2f, r: f32) -> f32 {
  let q = abs(p) - half + r;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// anti-aliased fill of a signed distance
// `aa` is the size of a pixel in the same units as the distance; it is
// measured once at the top of the fragment shader (derivatives need uniform
// control flow).
fn fill(d: f32, aa: f32) -> f32 {
  return 1.0 - smoothstep(-aa, aa, d);
}

fn over(dst: vec3f, src: vec3f, a: f32) -> vec3f {
  return mix(dst, src, clamp(a, 0.0, 1.0));
}

// Soft, matte shading: a wrapped key light and a little sky fill.
fn shade(n: vec3f, dark: f32) -> f32 {
  let nn = normalize(n);
  let key = dot(nn, normalize(vec3f(0.35, 0.9, 0.5))) * 0.5 + 0.5;
  let lo = mix(0.86, 0.66, dark);
  let hi = mix(1.0, 1.12, dark);
  return mix(lo, hi, key * key);
}

// --- materials ---------------------------------------------------------------

fn platformTop(p: vec2f, b: Beat, aa: f32) -> vec3f {
  let dark = scene.params.y;
  var col = scene.platform.rgb;

  // contact shadows: rack footprint and the three devices
  let rack = sdRoundRect(p - vec2f(-0.08, -0.1), vec2f(0.78, 0.68), 0.2);
  var shadow = 1.0 - smoothstep(-0.05, 0.55, rack);
  for (var i = 0; i < 3; i++) {
    let d = length((p - clientXZ(i) - vec2f(-0.05, -0.08)) * vec2f(1.0, 1.25));
    shadow = max(shadow, (1.0 - smoothstep(0.15, 0.75, d)) * 0.7);
  }
  col *= 1.0 - shadow * mix(0.07, 0.35, dark);

  // a hairline just inside the rim, like the page's card borders
  let rim = sdRoundRect(p - vec2f(0.0, 1.55), vec2f(4.25, 3.15), 0.65);
  col = over(col, scene.line.rgb, (1.0 - smoothstep(0.0, aa * 1.5, abs(rim + 0.06) - 0.012)) * 0.7);

  for (var i = 0; i < 3; i++) {
    let tr = trace(i, p);

    // the trace itself, and a pad where it meets the client
    col = over(col, scene.line.rgb, 1.0 - smoothstep(0.022 - aa, 0.022 + aa, tr.dist));

    // request out, then response (or realtime event) back
    let req = requestPulse(b, i, tr, 0.055, aa);
    col = over(col, scene.accent.rgb, req);
    let ret = returnPulse(b, i, tr, 0.055, aa);
    let retCol = select(scene.event.rgb, scene.resp.rgb, i == b.sender);
    col = over(col, retCol, ret);
  }
  return col;
}

fn rackUnit(uv: vec2f, half: vec2f, id: f32, b: Beat, aa: f32) -> vec3f {
  let on = processing(b) * step(abs(id - activeUnit(b)), 0.5);
  var col = over(scene.unit.rgb, scene.accent.rgb, on * 0.1);

  // drive bays on the left
  for (var k = 0; k < 3; k++) {
    let c = vec2f(-half.x + 0.15 + f32(k) * 0.17, 0.0);
    col = over(col, scene.line.rgb, fill(sdRoundRect(uv - c, vec2f(0.06, 0.05), 0.025), aa) * 0.75);
  }
  // status lights on the right
  let small = length(uv - vec2f(half.x - 0.27, 0.0)) - 0.022;
  col = over(col, scene.line.rgb, fill(small, aa));
  let led = length(uv - vec2f(half.x - 0.14, 0.0)) - 0.034;
  col = over(col, mix(scene.line.rgb, scene.accent.rgb, max(on, 0.0)), fill(led, aa));
  return col;
}

fn display(uv: vec2f, half: vec2f, id: i32, b: Beat, aa: f32) -> vec3f {
  var col = scene.device.rgb;
  let inner = half - 0.045;
  let glass = fill(sdRoundRect(uv, inner, 0.06), aa);
  var ui = scene.screen.rgb;

  // a tiny skeleton UI: title pill and three rows
  let left = -inner.x + 0.07;
  let rowH = min(0.05, inner.y * 0.11);
  let top = inner.y - 0.09;
  let title = sdRoundRect(uv - vec2f(left + inner.x * 0.28, top), vec2f(inner.x * 0.28, rowH * 0.8), rowH * 0.8);
  ui = over(ui, scene.line.rgb, fill(title, aa));

  let got = arrival(b, id);
  let tint = select(scene.event.rgb, scene.accent.rgb, id == b.sender);
  let gap = (inner.y * 2.0 - 0.3) / 3.0;
  for (var r = 0; r < 3; r++) {
    let w = inner.x * (0.86 - f32(r) * 0.16) - 0.07;
    let c = vec2f(left + w, top - 0.16 - f32(r) * min(gap, 0.17));
    let row = fill(sdRoundRect(uv - c, vec2f(w, rowH), rowH), aa);
    // the newest row lights up when data arrives
    let rowCol = mix(scene.line.rgb, tint, select(0.0, got, r == 0));
    ui = over(ui, rowCol, row * mix(0.55, 1.0, select(0.0, got, r == 0)));
  }
  return over(col, ui, glass);
}

@fragment fn fs_main(in: Out) -> @location(0) vec4f {
  let dark = scene.params.y;
  let b = beat(scene.params.x);
  let mat = i32(in.part.x + 0.5);
  let cap = in.face > 0.95;
  let half = in.part.zw;
  var col: vec3f;
  var lit = shade(in.normal, dark);
  let aaWorld = max(length(fwidth(in.world.xz)) * 0.7, 0.0005);
  let aaLocal = max(length(fwidth(in.local.xy)) * 0.7, 0.0005);

  if (mat == 0) {
    if (cap) {
      col = platformTop(in.world.xz, b, aaWorld);
      lit = 1.0;
    } else {
      col = scene.platformSide.rgb;
    }
  } else if (mat == 1) {
    col = scene.cabinet.rgb;
  } else if (mat == 2) {
    col = scene.unit.rgb;
    if (cap) { col = rackUnit(in.local.xy, half, in.part.y, b, aaLocal); }
  } else if (mat == 3) {
    col = scene.device.rgb;
  } else {
    col = scene.device.rgb;
    if (cap) { col = display(in.local.xy, half, i32(in.part.y + 0.5), b, aaLocal); }
  }

  return vec4f(col * lit, 1.0);
}
