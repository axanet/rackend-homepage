// Generates public/og.png (SVG rasterised with macOS `sips`) from the hero
// scene. Run with `mise run og`. All text is drawn as outlines from the brand
// fonts (sips can't load web fonts), so the card matches the site and the
// README banner of the main repository.
//
//   bun scripts/og.ts [out.png] [WIDTHxHEIGHT]
//
// Defaults to public/og.png at 1200x630. The GitHub social preview of the
// main repository is the same card at 1280x640:
//   bun scripts/og.ts social-preview.png 1280x640
import { $ } from "bun";
import { tmpdir } from "node:os";
import { join } from "node:path";
import opentype from "opentype.js";
import { SITE } from "../src/config/site";
import { renderDiagram } from "../src/visual/diagram";

const out = process.argv[2] ?? new URL("../public/og.png", import.meta.url).pathname;
const [W, H] = (process.argv[3] ?? "1200x630").split("x").map(Number) as [number, number];
// the layout is drawn for 1200x630; other sizes keep it centred vertically
const dy = Math.round((H - 630) / 2);

const C = {
  bg: "#0a0b0d", fg: "#ededef", muted: "#a0a3ab", subtle: "#6f727b", accent: "#3ddc97", write: "#f5a524",
  border: "#22252b", grid: "#16181c",
};

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
  { width: SCENE_W, height: 630, offset: [0, 10] },
);

const font = (path: string) => opentype.loadSync(new URL(path, import.meta.url).pathname);
const display = font("../src/assets/fonts/redaction/Redaction20-Regular.otf");
const sans = font("../node_modules/@fontsource/geist/files/geist-latin-400-normal.woff");
const mono = font("../node_modules/@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff");
const monoSemi = font("../node_modules/@fontsource/geist-mono/files/geist-mono-latin-600-normal.woff");

/** Text as an outline; `tracking` in em, as CSS letter-spacing. */
const text = (f: opentype.Font, s: string, x: number, y: number, size: number, fill: string, tracking = 0) => {
  let d = "";
  let cx = x;
  const glyphs = f.stringToGlyphs(s);
  glyphs.forEach((g, i) => {
    d += g.getPath(cx, y, size).toPathData(2);
    cx += (g.advanceWidth! / f.unitsPerEm) * size + tracking * size;
    const next = glyphs[i + 1];
    if (next) cx += (f.getKerningValue(g, next) / f.unitsPerEm) * size;
  });
  return `<path d="${d}" fill="${fill}"/>`;
};

// status pill, as in the hero (without the release: the card outlives it)
const pill = SITE.status ?? "";
const pillSize = 15;
const pillW = mono.getAdvanceWidth(pill, pillSize) + 46;
const pillY = 150;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M56 0H0V56" fill="none" stroke="${C.grid}" stroke-width="1"/></pattern>
    <radialGradient id="fade" cx="62%" cy="40%" r="70%"><stop offset=".25" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="gridmask"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
    <radialGradient id="glow" cx="70%" cy="50%" r="50%"><stop offset="0" stop-color="${C.accent}" stop-opacity=".09"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" mask="url(#gridmask)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g transform="translate(${W - SCENE_W + 10} ${dy})">${scene}</g>

  <g transform="translate(0 ${dy})">
    <g transform="translate(72 84)">
      <rect x="4" y="4.5" width="24" height="6.5" rx="2" fill="${C.fg}"/>
      <rect x="4" y="12.75" width="24" height="6.5" rx="2" fill="${C.fg}" opacity=".72"/>
      <rect x="4" y="21" width="24" height="6.5" rx="2" fill="${C.fg}" opacity=".44"/>
      <circle cx="23.5" cy="7.75" r="1.7" fill="${C.accent}"/>
    </g>
    ${text(monoSemi, SITE.name, 116, 108, 26, C.fg, -0.03)}

    ${pill ? `<rect x="72.5" y="${pillY + 0.5}" width="${pillW}" height="30" rx="15" fill="none" stroke="${C.border}"/>
    <circle cx="${72 + 16}" cy="${pillY + 15}" r="4" fill="${C.write}"/>
    ${text(mono, pill, 72 + 29, pillY + 20.5, pillSize, C.muted)}` : ""}

    ${["Your whole", "backend in", "one binary."].map((l, i) => text(display, l, 72, 290 + i * 74, 72, C.fg)).join("\n    ")}
    ${text(sans, "Database, auth, files and realtime.", 72, 500, 23, C.muted)}
    ${text(sans, "Self-hosted. Open source. SQLite.", 72, 532, 23, C.muted)}
    ${text(mono, SITE.repo.replace(/^https:\/\//, ""), 72, 586, 16, C.subtle)}
  </g>
</svg>
`;

const svgPath = join(tmpdir(), "rackend-og.svg");
await Bun.write(svgPath, svg);
await $`sips -s format png ${svgPath} --out ${out}`.quiet();
console.log(`wrote ${out} (${W}x${H})`);
