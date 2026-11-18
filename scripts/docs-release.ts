// Updates the docs for a rackend release. Run with `mise run docs:release <version>`.
//
//   patch (0.0.2 after 0.0.1): the latest docs now name 0.0.2. Nothing moves.
//   minor (0.1.0 after 0.0.x): the latest docs are archived under docs/0.0/,
//     next/ becomes the latest docs, and next/ keeps going for main.
//
// Afterwards: take the screenshots of a new minor version
// (`mise run docs:screenshots ghcr.io/axanet/rackend:<version> src/assets/screenshots/<x.y>`),
// review the diff and commit.
import { cp, readdir, readFile, rename, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { VERSIONS, type DocsVersion } from "../src/docs/versions";

const release = process.argv[2] ?? "";
if (!/^\d+\.\d+\.\d+$/.test(release)) {
  console.error("usage: bun scripts/docs-release.ts <x.y.z>   (pre-releases do not change the docs)");
  process.exit(2);
}
const minor = release.split(".").slice(0, 2).join(".");
const root = new URL("..", import.meta.url).pathname;
const docs = join(root, "src/content/docs/docs");
const latest = VERSIONS.find((v) => v.status === "latest")!;
const next = VERSIONS.find((v) => v.status === "next")!;
const versionDirs = new Set(VERSIONS.map((v) => v.dir).filter(Boolean));

let versions: DocsVersion[];
if (minor === latest.id) {
  versions = VERSIONS.map((v) => (v === latest ? { ...v, release } : v));
  console.log(`docs ${minor}: now ${release}`);
} else {
  if (VERSIONS.some((v) => v.id === minor)) throw new Error(`docs ${minor} exist already`);
  // 1. Archive the latest docs under their version.
  const archive = join(docs, latest.id);
  await mkdir(archive);
  for (const entry of await readdir(docs)) {
    if (versionDirs.has(entry) || entry === latest.id) continue;
    await rename(join(docs, entry), join(archive, entry));
  }
  // 2. next/ becomes the latest docs (next/ stays as it is).
  for (const entry of await readdir(join(docs, next.dir))) {
    await cp(join(docs, next.dir, entry), join(docs, entry), { recursive: true });
  }
  // 3. The pinned image tag in the latest and next docs moves to the new minor version.
  for (const dir of [docs, join(docs, next.dir)]) await retag(dir, latest.id, minor);
  versions = [
    { id: minor, dir: "", status: "latest", release },
    next,
    { ...latest, dir: latest.id, status: "archived" },
    ...VERSIONS.filter((v) => v.status === "archived"),
  ];
  console.log(`docs ${latest.id} archived under /docs/${latest.id}/, next is now ${minor} (${release})`);
  console.log(`screenshots: mise run docs:screenshots ghcr.io/axanet/rackend:${release} src/assets/screenshots/${minor}`);
}

// Rewrite the VERSIONS list in src/docs/versions.ts.
const file = join(root, "src/docs/versions.ts");
const source = await readFile(file, "utf8");
const list = versions
  .map((v) => `  { ${Object.entries(v).map(([k, val]) => `${k}: ${JSON.stringify(val)}`).join(", ")} },`)
  .join("\n");
await writeFile(file, source.replace(/(export const VERSIONS: DocsVersion\[\] = \[\n)[\s\S]*?(\n\];)/, `$1${list}$2`));

async function retag(dir: string, from: string, to: string) {
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) continue;
    const path = join(entry.parentPath, entry.name);
    if (dir === docs && [...versionDirs, latest.id].some((d) => path.startsWith(join(docs, d) + "/"))) continue;
    const text = await readFile(path, "utf8");
    const pinned = new RegExp(`(ghcr\\.io/axanet/rackend:)${from.replace(".", "\\.")}(?![.\\d])`, "g");
    const updated = text.replace(pinned, `$1${to}`);
    if (updated !== text) await writeFile(path, updated);
  }
}
