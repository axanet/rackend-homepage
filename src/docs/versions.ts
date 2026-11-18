// The versions of the rackend documentation. Single source of truth for the
// docs URLs, sidebars, version picker and banners, and for the release the
// homepage shows. `bun scripts/docs-release.ts` updates it when rackend ships.
//
// Content lives in src/content/docs/docs/:
//   (root)   the latest release, at /docs/...      (stable URLs, linked from rackend)
//   next/    rackend's main branch, unreleased     (rackend's CI tests against it)
//   <x.y>/   older minor releases, archived
// Screenshots live in src/assets/screenshots/<id>/ (next falls back to latest).

export interface DocsVersion {
  /** Minor version (`0.0`), or `next`. Also the screenshots folder. */
  id: string;
  /** Subfolder of src/content/docs/docs and of /docs/ ("" for the latest release). */
  dir: string;
  status: "latest" | "next" | "archived";
  /** Newest release of this minor, e.g. `0.0.1`. */
  release?: string;
}

export const VERSIONS: DocsVersion[] = [
  { id: "0.0", dir: "", status: "latest", release: "0.0.1" },
  { id: "next", dir: "next", status: "next" },
];

export const LATEST = VERSIONS.find((v) => v.status === "latest")!;

/** `/docs/` or `/docs/next/`. */
export const versionBase = (v: DocsVersion) => (v.dir ? `/docs/${v.dir}/` : "/docs/");

/** Content id prefix of a version: `docs` or `docs/next`. */
export const versionPrefix = (v: DocsVersion) => (v.dir ? `docs/${v.dir}` : "docs");

/** The version a docs page belongs to, from its content id or URL path. */
export function versionOf(idOrPath: string): DocsVersion {
  const rest = idOrPath.replace(/^\/?docs\/?/, "");
  const first = rest.split("/")[0];
  return VERSIONS.find((v) => v.dir && v.dir === first) ?? LATEST;
}

/** A page's path inside its version: `guides/rules` for docs/next/guides/rules. */
export function pathInVersion(idOrPath: string): string {
  const v = versionOf(idOrPath);
  const rest = idOrPath.replace(/^\/?docs\/?/, "").replace(/\/$/, "");
  return v.dir ? rest.slice(v.dir.length).replace(/^\//, "") : rest;
}

export function versionLabel(v: DocsVersion): string {
  if (v.status === "next") return "next (unreleased)";
  return v.status === "latest" ? `${v.id} (latest)` : v.id;
}
