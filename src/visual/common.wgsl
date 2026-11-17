// Shared data + helpers for the hero scene. Pure module (no bindings).
// The trace layout and the request schedule mirror layout.ts. Change both.

export struct Scene {
  viewProj: mat4x4f,
  platform: vec4f,
  platformSide: vec4f,
  cabinet: vec4f,
  unit: vec4f,
  device: vec4f,
  screen: vec4f,
  line: vec4f,
  accent: vec4f,   // request
  resp: vec4f,     // response
  event: vec4f,    // realtime event
  params: vec4f,   // x = time (s), y = 1 in dark mode
}

// ------------------------------------------------------------ traces ------

const PORT_Z: f32 = 0.7;
const ELBOW: f32 = 0.35;

export fn clientXZ(i: i32) -> vec2f {
  if (i == 0) { return vec2f(-3.0, 2.3); }
  if (i == 1) { return vec2f(0.0, 3.9); }
  return vec2f(3.1, 1.9);
}

fn portX(i: i32) -> f32 {
  if (i == 0) { return -0.42; }
  if (i == 1) { return 0.0; }
  return 0.42;
}

export struct Trace {
  dist: f32,    // distance from p to the trace centre line
  s: f32,       // arc length (from the client) of the nearest point
  len: f32,     // total length
}

fn segment(p: vec2f, a: vec2f, b: vec2f) -> vec2f {
  let ab = b - a;
  let l = length(ab);
  let t = clamp(dot(p - a, ab) / (l * l), 0.0, 1.0);
  return vec2f(length(p - (a + ab * t)), t * l);
}

// Client → (run along X) → rounded elbow → (run along -Z) → rack port.
export fn trace(i: i32, p: vec2f) -> Trace {
  let c = clientXZ(i);
  let px = portX(i);
  var out: Trace;
  if (abs(c.x - px) < 0.001) {
    let seg = segment(p, c, vec2f(px, PORT_Z));
    out.dist = seg.x;
    out.s = seg.y;
    out.len = c.y - PORT_Z;
    return out;
  }
  let dir = sign(px - c.x);
  let t1 = vec2f(px - dir * ELBOW, c.y);
  let t2 = vec2f(px, c.y - ELBOW);
  let centre = vec2f(t1.x, t2.y);
  let len1 = abs(t1.x - c.x);
  let arcLen = ELBOW * 1.5707963;
  let len2 = t2.y - PORT_Z;

  let a = segment(p, c, t1);
  out.dist = a.x;
  out.s = a.y;

  let v = p - centre;
  if (v.x * dir >= 0.0 && v.y >= 0.0) {
    let d = abs(length(v) - ELBOW);
    if (d < out.dist) {
      out.dist = d;
      out.s = len1 + atan2(v.x * dir, v.y) * ELBOW;
    }
  }
  let b = segment(p, t2, vec2f(px, PORT_Z));
  if (b.x < out.dist) {
    out.dist = b.x;
    out.s = len1 + arcLen + b.y;
  }
  out.len = len1 + arcLen + len2;
  return out;
}

// ---------------------------------------------------------- schedule ------
// One request per cycle. The sender rotates through the clients; every
// fourth cycle is a write whose change is also pushed to the other clients.

const CYCLE: f32 = 4.6;
const TAIL: f32 = 1.15;

export struct Beat {
  cycle: f32,
  phase: f32,       // 0..1 within the cycle
  sender: i32,
  broadcast: bool,
}

export fn beat(time: f32) -> Beat {
  var b: Beat;
  let c = time / CYCLE;
  b.cycle = floor(c);
  b.phase = fract(c);
  let n = i32(b.cycle);
  b.sender = n % 3;
  b.broadcast = (n % 4) == 3;
  return b;
}

fn ease(x: f32) -> f32 {
  let t = clamp(x, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// A flat "comet": solid rounded head, opacity falling off along the tail.
// `behind` = distance behind the head along the trace, `dist` = distance
// from the centre line, `width` = half width.
fn comet(behind: f32, dist: f32, width: f32, aa: f32) -> f32 {
  if (behind < 0.0) {
    // rounded cap in front of the head
    let d = length(vec2f(behind, dist));
    return 1.0 - smoothstep(width - aa, width + aa, d);
  }
  let body = 1.0 - smoothstep(width - aa, width + aa, dist);
  let fade = pow(clamp(1.0 - behind / TAIL, 0.0, 1.0), 1.4);
  return body * fade;
}

// Opacity of the request travelling client → rack on trace `i`.
export fn requestPulse(b: Beat, i: i32, tr: Trace, width: f32, aa: f32) -> f32 {
  if (i != b.sender) { return 0.0; }
  let u = ease((b.phase - 0.03) / 0.3);
  if (u <= 0.0 || u >= 1.0) { return 0.0; }
  let head = u * (tr.len + TAIL);
  return comet(head - tr.s, tr.dist, width, aa);
}

// Opacity of what travels rack → client on trace `i`: the response for the
// sender, or a realtime event for everyone else on a broadcast cycle.
export fn returnPulse(b: Beat, i: i32, tr: Trace, width: f32, aa: f32) -> f32 {
  if (i != b.sender && !b.broadcast) { return 0.0; }
  let u = ease((b.phase - 0.46) / 0.3);
  if (u <= 0.0 || u >= 1.0) { return 0.0; }
  let head = tr.len - u * (tr.len + TAIL);
  return comet(tr.s - head, tr.dist, width, aa);
}

// 0..1 while the rack is handling the request.
export fn processing(b: Beat) -> f32 {
  return smoothstep(0.28, 0.33, b.phase) * (1.0 - smoothstep(0.46, 0.54, b.phase));
}

export fn activeUnit(b: Beat) -> f32 {
  return floor(fract(sin(b.cycle * 91.7 + 3.1) * 43758.5453) * 6.0);
}

// 0..1 after something arrives at client `i`, fading out before the cycle ends.
export fn arrival(b: Beat, i: i32) -> f32 {
  if (i != b.sender && !b.broadcast) { return 0.0; }
  return smoothstep(0.68, 0.74, b.phase) * (1.0 - smoothstep(0.86, 0.99, b.phase));
}
