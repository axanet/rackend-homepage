// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";
import { SITE } from "./src/config/site.ts";

export default defineConfig({
  site: SITE.url,
  output: "static",
  trailingSlash: "ignore",
  integrations: [sitemap()],
  vite: {
    plugins: [wgslVitePlugin({ minify: true })],
  },
  markdown: {
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark-dimmed" },
    },
  },
});
