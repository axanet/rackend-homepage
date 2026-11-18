// Single source of truth for site-wide facts. Change values here, not in components.

// Latest rackend release; update it after each release. The hero links its
// release notes and the run command pins its x.y image tag, as the docs do.
const RELEASE = "0.0.1";
const IMAGE = "ghcr.io/axanet/rackend";

export const SITE = {
  name: "rackend",
  // TODO: final production domain. Used for canonical URLs, sitemap and Open Graph.
  url: "https://rackend.axanet.ch",
  title: "rackend: your backend in one binary",
  description:
    "Open-source, self-hosted backend in a single Rust binary: database, REST API with access rules, auth with OIDC, file storage and realtime. Backed by SQLite.",
  pitch: "Your whole backend in one binary.",
  owner: "axanet GmbH",
  repo: "https://github.com/axanet/rackend",
  image: IMAGE,
  release: RELEASE,
  runCommand: `docker run -p 8080:8080 -v rackend_data:/data ${IMAGE}:${RELEASE.split(".").slice(0, 2).join(".")}`,
  // Optional status badge in the hero, next to the release, e.g. "Pre-alpha". `null` hides it.
  status: "In development",
} as const;

export const LINKS = {
  docs: `${SITE.repo}/blob/main/docs/guide/README.md`,
  changelog: `${SITE.repo}/blob/main/CHANGELOG.md`,
  blog: "/blog",
  github: SITE.repo,
  releases: `${SITE.repo}/releases`,
  release: `${SITE.repo}/releases/tag/${SITE.release}`,
  license: `${SITE.repo}/blob/main/LICENSE`,
  security: `${SITE.repo}/security/policy`,
  pocketbase: "https://pocketbase.io",
} as const;

// Top navigation. Pages that don't exist yet are marked `soon` and render
// without a link, so the nav can grow without a redesign.
export const NAV: { label: string; href: string; soon?: boolean }[] = [
  { label: "Features", href: "/#features" },
  { label: "Data safety", href: "/#data" },
  { label: "Quickstart", href: "/#quickstart" },
  { label: "Docs", href: LINKS.docs },
  { label: "Changelog", href: LINKS.changelog },
];
