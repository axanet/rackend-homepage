# rackend homepage — content brief

> For the web design agent. This document defines **what** the homepage must say and contain.
> **How** it looks — layout, section order (beyond what's marked as required), visual style, colors, typography, imagery, animation, component choices — is **your call**.
> Source of truth for technical facts: `SPEC.md`. If this brief and the spec disagree, the spec wins.
>
> **Owner:** axanet GmbH (project/organization name: axanet) · Repository: https://github.com/axanet/rackend · Docker image: `ghcr.io/axanet/rackend`

---

## 1. What rackend is (for your understanding)

rackend is an open-source, self-hosted **backend-as-a-service**: one binary (or one Docker container) gives you a database with an admin UI, a REST API with access rules, authentication, file storage and realtime. It is written in Rust, uses SQLite, and is inspired by PocketBase.

It is for developers building CRUD-style web and mobile apps, internal tools and prototypes who want to own their backend without running a fleet of services.

**One-sentence pitch (draft, may be refined):**
> Your whole backend in one binary — database, auth, files and realtime, self-hosted in a minute.

**Name:** always lowercase `rackend`, also at the start of a sentence.

---

## 2. Audience

Primary:
- Indie developers and small teams who build web/mobile apps and want a backend they control.
- Self-hosters and homelab people (Docker, Coolify, Unraid, a VPS).
- Developers who know PocketBase / Supabase / Firebase / Appwrite and are evaluating alternatives.

They are technical. They distrust marketing fluff and are won over by: concrete details, a working quickstart, honest limitations, and good docs.

---

## 3. Goals of the page

A visitor should, within ~30 seconds, understand:
1. **What it is**: a self-hosted backend in a single binary.
2. **What they get**: collections + REST API + rules, auth (incl. OIDC provider), files with thumbnails, realtime, observability.
3. **How easy it is**: one command, no config.
4. **Why trust it with data**: upgrade safety, audit trail, SQLite, open source.
5. **What to do next**: run it (quickstart), read the docs, star/follow on the repo.

Primary call to action: **Get started** (quickstart / docs).
Secondary: **View on GitHub** → https://github.com/axanet/rackend

---

## 4. Tone of voice

- Direct, technical, calm, slightly dry. Short sentences. No hype words ("revolutionary", "blazingly fast", "next-gen", "AI-powered").
- Show, don't claim: prefer a code snippet or a concrete number over an adjective.
- Honest about status and limits (see §7).
- English only for now.

---

## 5. Required content

The blocks below are the content that must exist on the page. Grouping, order (except where noted), and presentation are up to you.

### 5.1 Hero (must be first)
- Name + one-line pitch (§1).
- One supporting sentence, e.g. "Collections, REST API, auth, file storage and realtime — in a single Rust binary backed by SQLite. Self-hosted, open source, zero config."
- Primary CTA (Get started) + secondary CTA (GitHub).
- The run command, copyable:
  ```sh
  docker run -p 8080:8080 -v rackend_data:/data ghcr.io/axanet/rackend
  ```
- A visible project status label (e.g. "Pre-alpha — in development"); see §7.

### 5.2 Quickstart
Three steps, each very short:
1. Run it (Docker command above, or download the binary and run `./rackend serve`).
2. Open the setup link printed in the logs and create the admin account.
3. Create a collection in the admin UI and call the API:
   ```sh
   curl http://localhost:8080/api/collections/posts/records
   ```
Optionally, a fourth step or note: generate a typed client for any language from the instance's OpenAPI document:
```sh
rackend openapi export > openapi.json
# then use any OpenAPI generator, e.g. openapi-generator, oapi-codegen, progenitor
```
*(Keep examples minimal; they must match `SPEC.md`.)*

### 5.3 Features
Each feature needs a short title and 1–3 sentences. Use the facts listed; wording is yours.

| Feature | Key facts to convey |
|---|---|
| **Collections & REST API** | Define tables at runtime in the admin UI; get a full REST API with filtering, sorting, pagination, relation expansion and batch transactions. Real SQLite columns, not JSON blobs. |
| **Access rules** | One expression per operation (list/view/create/update/delete), e.g. `owner = @request.auth.id`. Compiled to safe, parameterized SQL. Rules are checked live in the admin UI as you type. Locked by default. *(Good candidate for a code/visual example.)* |
| **Authentication** | Email + password, passkeys, one-time codes and magic links, plus login with any OIDC provider (Google, Microsoft, GitHub, Authentik, Pocket ID, Keycloak, …) — just paste the issuer URL. |
| **Built-in OIDC provider** | rackend is an OpenID Connect provider itself: your apps log in through it with any standard OIDC library. Hosted, themeable login page. *(Strong differentiator — give it visibility.)* |
| **File storage** | Local disk by default, or any S3-compatible store (AWS S3, MinIO, Garage, RustFS). Access controlled by the same rules as records. |
| **Images & thumbnails** | EXIF/GPS metadata stripped on upload, orientation fixed, thumbnails generated on demand as WebP. |
| **Realtime** | Subscribe to record changes over SSE or WebSocket — every event is checked against access rules per subscriber. Ephemeral channels for presence and typing indicators. |
| **Collaborative editing** | Yjs-compatible collaborative documents out of the box — works with Tiptap, BlockNote, CodeMirror. |
| **Observability** | Audit trail of every change (who, what, when, before/after), request logs, app + host/container metrics, a built-in dashboard, Prometheus and OpenTelemetry export. |
| **OpenAPI for every instance** | rackend generates an OpenAPI document from your live schema — typed per collection — so you can generate a client for any language with the tools you already use. |
| **Standard errors** | Every API error is an RFC 9457 problem details object with a stable machine-readable code — predictable to handle in any client. |
| **Admin UI** | Embedded in the binary: schema editor, records browser, auth & provider setup, dashboard, settings. |

Group these however you like (e.g. "Data", "Auth", "Files", "Realtime", "Operations"). You may also choose to highlight 3–4 and list the rest compactly.

### 5.4 "Built to keep your data" (must exist, own section or prominent block)
This is a core value of the project and should not be buried. Facts:
- Upgrades **never** lose data: automatic backup before every schema migration, integrity checks, refuses to start rather than risk your data (e.g. on accidental downgrade).
- Every released version's database is tested in CI to upgrade cleanly to the latest version.
- Deleted fields and collections go to a trash for 30 days first.
- Single SQLite file + storage folder → backups are a file copy; built-in scheduled backups.
- Prevents two instances from writing to the same data directory.

### 5.5 Single binary / ops simplicity
- One static binary or one small Docker image (amd64 + arm64). No Postgres, Redis or queue to run.
- Configured at runtime in the admin UI; environment variables only for bootstrapping.
- Runs on a €5 VPS, a Raspberry Pi-class device, a homelab box. *(Don't state concrete performance numbers until measured; see §7.)*

### 5.6 Architecture teaser (optional but nice)
A small, simple illustration or list: HTTP API → core → SQLite / file storage, with auth, realtime, audit around it. Hexagonal core, so gRPC/MCP adapters are possible later. Keep it light — this is not docs.

### 5.7 Comparison (optional)
If included, it must be **fair and factual**, credit PocketBase as the inspiration, and avoid claims about competitors that might be outdated. Prefer a "how rackend differs" framing over a checkmark table:
- vs. PocketBase: same single-binary spirit; rackend adds a built-in OIDC provider, collaborative editing, audit trail and metrics; written in Rust.
- vs. Supabase / Appwrite: no multi-service stack to operate; SQLite instead of Postgres; aimed at single-app, single-server deployments.
- Honest trade-off: single instance, no horizontal scaling; no custom server-side code (hooks) in v1.

### 5.8 Footer
Links: Docs, GitHub (https://github.com/axanet/rackend), Changelog/Releases, License (TBD), Security policy / contact. Copyright line: `© <year> axanet GmbH`. Small "inspired by PocketBase" credit is welcome.

---

## 6. Pages (scope)

- **Now:** the homepage only (single page).
- **Later, plan room for:** `/docs` (likely a separate docs tool), `/changelog`, `/blog` (release notes). Navigation should be able to grow to include these without redesign.

---

## 7. Honesty rules (must follow)

- The project is **pre-alpha**. The page must show this clearly. Features are described as what rackend *does* by v1; a "Roadmap" or status note may clarify what's already usable. Do not imply production readiness.
- **No invented numbers**: no benchmarks, star counts, download counts, user counts or performance claims unless provided later from real measurements.
- **No fake social proof**: no invented testimonials, user logos or "trusted by" sections.
- **No competitor claims** beyond §5.7.
- Code snippets must match the spec or be clearly labelled illustrative.

---

## 8. Technical requirements for the site

- Static site, fast, works without JavaScript for all content (JS only for progressive enhancement: copy buttons, theme toggle, small interactions).
- Light and dark mode.
- Accessible: semantic HTML, keyboard navigable, sufficient contrast, alt text.
- Responsive down to small phones; code blocks scroll horizontally rather than wrapping awkwardly.
- No third-party trackers or cookie banners. If analytics are added later, they will be self-hosted and cookieless.
- Basic SEO: title, description, Open Graph/Twitter card image, canonical URL, sitemap.
- Tooling constraints: built with **bun** (never npm/yarn/pnpm), tasks via **mise**, consistent with the main repo. Framework choice (Astro vs. SvelteKit static) is open; see the note at the end.

### Meta (drafts)
- Title: `rackend — your backend in one binary`
- Description: `Open-source, self-hosted backend in a single Rust binary: database, REST API with access rules, auth with OIDC, file storage and realtime. Backed by SQLite.`
- Keywords to naturally cover: self-hosted backend, backend as a service, PocketBase alternative, Rust, SQLite, OIDC provider, realtime, open source.

---

## 9. Assets

Available / to be created:
- Logo / wordmark: **does not exist yet** — you may propose one (simple, works at favicon size, works in light and dark mode).
- Favicon + OG image: to be created.
- Admin UI screenshots: **not available yet**. Use placeholders that are obviously placeholders, or avoid screenshots for now (e.g. code, diagrams, abstract visuals).
- No stock photos of people.

---

## 10. Out of scope for the design agent

- Writing the docs content.
- Pricing (there is none; rackend is free and open source — license TBD).
- Newsletter/signup flows.

---

## Note on framework (for whoever builds the site)

Both options are fine for a static marketing page:
- **Astro**: purpose-built for content sites, ships zero JS by default, can still use Svelte components as interactive islands where needed. Easy later extension with Starlight for `/docs`.
- **SvelteKit with `adapter-static`** (fully prerendered): same stack as the rackend admin UI, so shared components and knowledge.
The decision belongs to the implementer; record it in an ADR.
