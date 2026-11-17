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

## Fonts and licenses

All fonts are self-hosted and licensed under the SIL Open Font License 1.1.

| Font | Use | Source | License |
|---|---|---|---|
| Redaction 20 (MCKL) | display headings (`h1`, `h2`) | `src/assets/fonts/redaction/`, unmodified web fonts from MCKL's release | `src/assets/fonts/redaction/OFL.txt` |
| Geist, Geist Mono (Vercel) | UI text, code, labels | `@fontsource-variable/geist*` | in the package |

The OFL requires the copyright notice and license to travel with every copy of
the fonts. The site therefore serves verbatim copies in `public/licenses/`, and
the footer credits the fonts with links to them. When adding or updating a
font, add its license there too. Do not modify the font files, and do not edit
the license texts (they are exempt from the no-em-dash rule).

## Open items

- Final domain (`SITE.url` in `src/config/site.ts`, `public/robots.txt`).
- License link target, security policy, docs/changelog routes (nav shows them as
  inactive until they exist).
- Hero status badge: set `SITE.status` (e.g. `"Pre-alpha"`) to show one.
