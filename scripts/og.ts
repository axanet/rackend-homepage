// Generates public/og.png (SVG rasterised with macOS `sips`) from the hero
// scene. Run with `mise run og`.
import { $ } from "bun";
import { tmpdir } from "node:os";
import { join } from "node:path";
import opentype from "opentype.js";
import { renderDiagram } from "../src/visual/diagram";

const W = 1200, H = 630;
const C = { bg: "#0a0b0d", fg: "#ededef", muted: "#a0a3ab", subtle: "#6f727b", accent: "#3ddc97" };

// the scene, drawn in the right-hand ~60% of the card
const SCENE_W = 760;
const scene = renderDiagram(
  {
    platform: "#101114",
    platformSide: "#22252b",
    cabinet: "#1c1f25",
    unit: "#262a32",
    device: "#262a32",
    screen: "#0a0b0d",
    line: "#3a3f48",
    accent: C.accent,
    resp: C.fg,
    event: "#a78bfa",
  },
  { width: SCENE_W, height: H, offset: [0, 10] },
);

const sans = `'Helvetica Neue', Helvetica, Arial, sans-serif`;
// sips can't load web fonts, so the headline is drawn as outlines from the original OTF
const display = opentype.loadSync(new URL("../src/assets/fonts/redaction/Redaction20-Regular.otf", import.meta.url).pathname);
const mono = `Menlo, 'SF Mono', monospace`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="70%" cy="50%" r="50%"><stop offset="0" stop-color="${C.accent}" stop-opacity=".09"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g transform="translate(${W - SCENE_W + 10} 0)">${scene}</g>

  <g transform="translate(72 84)">
    <rect x="4" y="4.5" width="24" height="6.5" rx="2" fill="${C.fg}"/>
    <rect x="4" y="12.75" width="24" height="6.5" rx="2" fill="${C.fg}" opacity=".72"/>
    <rect x="4" y="21" width="24" height="6.5" rx="2" fill="${C.fg}" opacity=".44"/>
    <circle cx="23.5" cy="7.75" r="1.7" fill="${C.accent}"/>
    <text x="44" y="24" font-family="${mono}" font-size="26" font-weight="600" fill="${C.fg}" letter-spacing="-0.5">rackend</text>
  </g>
  ${["Your whole", "backend in", "one binary."]
    .map((l, i) => `<path d="${display.getPath(l, 72, 290 + i * 74, 72, { kerning: true }).toPathData(2)}" fill="${C.fg}"/>`)
    .join("")}
  <text x="72" y="500" font-family="${sans}" font-size="23" fill="${C.muted}">Database, auth, files and realtime.</text>
  <text x="72" y="532" font-family="${sans}" font-size="23" fill="${C.muted}">Self-hosted. Open source. SQLite.</text>
  <text x="72" y="586" font-family="${mono}" font-size="16" fill="${C.subtle}">github.com/axanet/rackend</text>
</svg>
`;

const svgPath = join(tmpdir(), "rackend-og.svg");
const pngPath = new URL("../public/og.png", import.meta.url).pathname;
await Bun.write(svgPath, svg);
await $`sips -s format png ${svgPath} --out ${pngPath}`.quiet();
console.log(`wrote ${pngPath}`);
