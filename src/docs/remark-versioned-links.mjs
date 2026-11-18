// Docs pages link to each other with latest-release paths (`/docs/guides/rules/`).
// In a versioned folder (next/, 0.0/, ...) those links are rewritten to stay in
// that version, so a page reads the same in every version.
import { visit } from "unist-util-visit";

/** @param {{ dirs: string[] }} options version folders under src/content/docs/docs */
export default function remarkVersionedLinks({ dirs }) {
  return (tree, file) => {
    const path = (file.path ?? file.history?.[0] ?? "").replaceAll("\\", "/");
    const match = path.match(/\/src\/content\/docs\/docs\/([^/]+)\//);
    const dir = match && dirs.includes(match[1]) ? match[1] : null;
    if (!dir) return;
    const rewrite = (url) => {
      if (typeof url !== "string" || !url.startsWith("/docs")) return url;
      const rest = url.slice("/docs".length);
      if (rest && !rest.startsWith("/") && !rest.startsWith("#")) return url;
      const first = rest.split(/[/#]/)[1] ?? "";
      if (dirs.includes(first)) return url; // already points into a version
      return `/docs/${dir}${rest.startsWith("/") ? rest : `/${rest}`}`;
    };
    visit(tree, (node) => {
      if ((node.type === "link" || node.type === "definition") && node.url) node.url = rewrite(node.url);
      if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.attributes) {
        for (const a of node.attributes) if (a.name === "href" && typeof a.value === "string") a.value = rewrite(a.value);
      }
    });
  };
}
