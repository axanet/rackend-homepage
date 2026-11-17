# ADR 0001: Astro (static) for the homepage, vgpu for the hero visual

- Status: accepted
- Date: 2026-11-17

## Context

The homepage is a static marketing page that must work without JavaScript, ship
no trackers, and later grow `/docs`, `/changelog` and `/blog`. Tooling must be
bun + mise, like the main repository. The brief left Astro vs. SvelteKit
(`adapter-static`) open. The hero should visualise rackend's model (clients
sending requests to one server rack and getting responses) using vgpu (WebGPU).

## Decision

- **Astro, `output: "static"`**, run through bun (`bun --bun astro …`). No
  server runtime of any kind.
- Interactivity is plain `<script>` progressive enhancement: theme toggle, copy
  buttons, the access-log ticker, and the WebGPU scene. No UI framework is
  shipped; vgpu is framework-agnostic, so Svelte islands were not needed.
- **vgpu** renders the hero scene. Shaders live in `src/visual/*.wgsl` and are
  prepared at build time by `@vgpu/wgsl/loader-vite`, so the browser never
  loads a WGSL parser.
- The scene module is **dynamically imported only when `navigator.gpu`
  exists**. Everyone else (no WebGPU, no JS) gets an SVG diagram rendered at
  build time from the same scene description (`src/visual/layout.ts`), so the
  baseline is complete content, not a blank box.
- `prefers-reduced-motion`: the live scene renders a single still frame.
- Code samples use Astro's built-in Shiki with dual light/dark themes driven
  by CSS `light-dark()`.
- Fonts (Geist, Geist Mono) are self-hosted via Fontsource, with no third-party
  requests.

## Consequences

- Astro's content collections and Starlight are available for `/docs`,
  `/changelog` and `/blog` later without changing stacks.
- The admin UI (SvelteKit) and the site don't share components. Acceptable for a
  single page; revisit if the site grows interactive surfaces.
- The scene's models are generated in code (`src/visual/mesh.ts`: rounded,
  bevelled slabs) rather than imported from a 3D tool, so they stay themeable
  and tiny. The trace paths and request schedule exist twice, in
  `src/visual/layout.ts` and `src/visual/common.wgsl`, and must change together.
- WebGPU availability varies by browser; the SVG fallback is the supported
  baseline and must stay presentable.
