# rackend homepage

Static homepage for [rackend](https://github.com/axanet/rackend). Built with
Astro and bun; the hero visual is rendered with [vgpu](https://vgpu.sh) (WebGPU)
and falls back to a build-time SVG.

Content brief: [`HOMEPAGE_BRIEF.md`](HOMEPAGE_BRIEF.md). Stack decision:
[`docs/adr/0001-astro-static-site.md`](docs/adr/0001-astro-static-site.md).

## Develop

```sh
mise install
mise run dev       # http://localhost:4321
mise run build     # static output in dist/
mise run preview
mise run og        # regenerate public/og.png (macOS)
```

## Layout

```
src/config/site.ts        site-wide facts: URLs, pitch, run command, nav, optional status badge
src/layouts/Base.astro    <head>, SEO/OG tags, no-flash theme script
src/styles/global.css     design tokens (light-dark()), base styles, utilities
src/components/           page sections (Hero, Quickstart, Features, DataSafety, OneBinary, Comparison, Footer)
src/visual/               hero scene: vgpu driver (scene.ts), WGSL shaders, SVG fallback (HostScene.astro)
scripts/og.ts             Open Graph image generator
```

## Open items

- Final domain (`SITE.url` in `src/config/site.ts`, `public/robots.txt`).
- License link target, security policy, docs/changelog routes (nav shows them as
  inactive until they exist).
- Hero status badge: set `SITE.status` (e.g. `"Pre-alpha"`) to show one.
