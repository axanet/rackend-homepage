// Starlight route middleware: one sidebar per docs version, pagination within
// that version, a banner on unreleased and archived versions, and search over
// the latest release only.
import { getCollection } from "astro:content";
import { defineRouteMiddleware, type StarlightRouteData } from "@astrojs/starlight/route-data";
import { LATEST, pathInVersion, versionBase, versionOf, versionPrefix } from "./versions";

type Entry = StarlightRouteData["sidebar"][number];
type Link = Extract<Entry, { type: "link" }>;

const links = (entries: Entry[]): Link[] =>
  entries.flatMap((e) => (e.type === "link" ? [e] : links(e.entries)));

export const onRequest = defineRouteMiddleware(async (context) => {
  const route = context.locals.starlightRoute;
  const version = versionOf(route.id);

  // The sidebar config has one top-level group per version, labelled with its id.
  const group = route.sidebar.find((e) => e.type === "group" && e.label === version.id);
  if (group?.type === "group") route.sidebar = group.entries;

  const flat = links(route.sidebar);
  const i = flat.findIndex((l) => l.isCurrent);
  if (i !== -1) {
    route.pagination = {
      prev: route.entry.data.prev === false ? undefined : flat[i - 1],
      next: route.entry.data.next === false ? undefined : flat[i + 1],
    };
  }
  route.siteTitleHref = versionBase(version);

  if (version.status !== "latest") {
    // Link the same page in the latest release when it has one.
    const here = pathInVersion(route.id);
    const id = here ? `${versionPrefix(LATEST)}/${here}` : versionPrefix(LATEST);
    const exists = (await getCollection("docs")).some((e) => e.id === id);
    const latest = `<a href="${exists ? `/${id}/` : versionBase(LATEST)}">the latest release (${LATEST.release})</a>`;
    route.entry.data.banner = {
      content:
        version.status === "next"
          ? `These docs describe rackend's main branch, which is not released yet. For the version you run, read ${latest}.`
          : `These docs are for rackend ${version.id}. Read ${latest} for the current version.`,
    };
    // Search covers the latest release; other versions stay out of the index and of search engines.
    route.entry.data.pagefind = false;
    route.head.push({ tag: "meta", attrs: { name: "robots", content: "noindex" }, content: "" });
  }
});
