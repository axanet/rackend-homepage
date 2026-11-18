// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import { unified } from "@astrojs/markdown-remark";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";
import { SITE } from "./src/config/site.ts";
import { VERSIONS, versionPrefix } from "./src/docs/versions.ts";
import remarkVersionedLinks from "./src/docs/remark-versioned-links.mjs";

// One sidebar per docs version; src/docs/middleware.ts shows the one of the
// current page. Groups follow the folders of each version.
const sidebar = VERSIONS.map((v) => {
  const p = versionPrefix(v);
  return {
    label: v.id,
    items: [
      { label: "Start", items: [{ slug: p, label: "Introduction" }, { slug: `${p}/getting-started` }] },
      { label: "Guides", items: [{ autogenerate: { directory: `${p}/guides` } }] },
      { label: "Run rackend", items: [{ autogenerate: { directory: `${p}/run` } }] },
      { label: "Reference", items: [{ autogenerate: { directory: `${p}/reference` } }] },
    ],
  };
});

export default defineConfig({
  site: SITE.url,
  output: "static",
  trailingSlash: "ignore",
  integrations: [
    starlight({
      title: "rackend docs",
      description: SITE.description,
      favicon: "/favicon.svg",
      disable404Route: true,
      social: [{ icon: "github", label: "GitHub", href: SITE.repo }],
      editLink: { baseUrl: "https://github.com/axanet/rackend-homepage/edit/main/" },
      customCss: ["./src/styles/docs.css"],
      sidebar,
      routeMiddleware: "./src/docs/middleware.ts",
      components: {
        SiteTitle: "./src/components/docs/SiteTitle.astro",
        ThemeProvider: "./src/components/docs/ThemeProvider.astro",
        ThemeSelect: "./src/components/docs/ThemeSelect.astro",
      },
      expressiveCode: {
        themes: ["github-dark-dimmed", "github-light"],
        styleOverrides: { borderRadius: "10px", codeFontFamily: "var(--sl-font-mono)", uiFontFamily: "var(--sl-font)" },
      },
    }),
    // Unreleased docs stay out of search engines (they are noindex too).
    sitemap({ filter: (page) => !page.includes("/docs/next/") }),
  ],
  vite: {
    plugins: [wgslVitePlugin({ minify: true })],
  },
  markdown: {
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark-dimmed" },
    },
    processor: unified({
      remarkPlugins: [[remarkVersionedLinks, { dirs: VERSIONS.filter((v) => v.dir).map((v) => v.dir) }]],
    }),
  },
});
