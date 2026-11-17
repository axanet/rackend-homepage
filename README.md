# rackend homepage

Static homepage for [rackend](https://github.com/axanet/rackend). Built with
Astro and bun; the hero visual is rendered with [vgpu](https://vgpu.sh) (WebGPU)
and falls back to a build-time SVG.

## Prerequisites

[mise](https://mise.jdx.dev/) is used for run scripts and tooling versions.

## Develop

```sh
mise install
mise run dev       # http://localhost:4321
mise run build     # static output in dist/
mise run preview
mise run og        # regenerate public/og.png (macOS)
```

## Container

The image serves the built site with unprivileged nginx on port 8080. It has
no server-side code; `/healthz` answers for health checks.

```sh
mise run docker:build   # rackend-homepage:dev
mise run docker:run     # http://localhost:8080
```

CI builds the image for `linux/amd64` and `linux/arm64` on every push and pull
request, and publishes `ghcr.io/axanet/rackend-homepage:latest` (plus a
`sha-…` tag) from `main`.

## Layout

```
src/config/site.ts        site-wide facts: URLs, pitch, run command, nav, optional status badge
src/layouts/Base.astro    <head>, SEO/OG tags, no-flash theme script
src/styles/global.css     design tokens (light-dark()), base styles, utilities
src/components/           page sections (Hero, Quickstart, Features, DataSafety, OneBinary, Comparison, Footer)
src/visual/               hero scene: vgpu driver (scene.ts), WGSL shaders, SVG fallback (HostScene.astro)
scripts/og.ts             Open Graph image generator
docker/                   nginx config for the container image
```

## Fonts and licenses

All fonts are self-hosted and licensed under the SIL Open Font License 1.1.

| Font | Use | Source | License |
|---|---|---|---|
| [Redaction 20 (MCKL)](https://redaction.us/) | display headings (`h1`, `h2`) | `src/assets/fonts/redaction/`, unmodified web fonts from MCKL's release | `src/assets/fonts/redaction/OFL.txt` |
| Geist, Geist Mono (Vercel) | UI text, code, labels | `@fontsource-variable/geist*` | in the package |

The OFL requires the copyright notice and license to travel with every copy of
the fonts. The site therefore serves verbatim copies in `public/licenses/`, and
the footer credits the fonts with links to them. When adding or updating a
font, add its license there too. Do not modify the font files, and do not edit
the license texts.

## Open items

- Docs and changelog routes (nav shows them as inactive until they exist).

## Contributing

Issues are welcome; pull requests from outside the axanet organization are
closed automatically. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[SECURITY.md](SECURITY.md).

## License

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). The bundled
fonts are not covered by it; they keep their own license (SIL OFL 1.1, see
above).
