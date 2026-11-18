// Single source of truth for site-wide facts. Change values here, not in components.

import { LATEST } from "../docs/versions";

// The latest rackend release comes from the docs versions (src/docs/versions.ts,
// updated by `mise run docs:release`). The hero links its release notes and the
// run command pins its x.y image tag, as the docs do.
const RELEASE = LATEST.release!;
const IMAGE = "ghcr.io/axanet/rackend";

export const SITE = {
  name: "rackend",
  // Canonical URLs, sitemap, Open Graph, and the error links rackend sends
  // (https://rackend.axanet.ch/docs/reference/errors/#<code>): keep it stable.
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
  docs: "/docs/",
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
