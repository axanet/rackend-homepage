// Single source of truth for site-wide facts. Change values here, not in components.

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
  image: "ghcr.io/axanet/rackend",
  runCommand: "docker run -p 8080:8080 -v rackend_data:/data ghcr.io/axanet/rackend",
  // Optional status badge in the hero, e.g. "Pre-alpha". `null` hides it.
  status: "In Development",
} as const;

export const LINKS = {
  docs: "/docs",
  changelog: "/changelog",
  blog: "/blog",
  github: SITE.repo,
  releases: `${SITE.repo}/releases`,
  // TODO: point at the real files once they exist in the main repo.
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
  { label: "Docs", href: LINKS.docs, soon: true },
  { label: "Changelog", href: LINKS.changelog, soon: true },
];
