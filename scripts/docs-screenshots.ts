// Takes the admin UI screenshots for the documentation from a rackend image.
// Run with `mise run docs:screenshots <image> <out-dir>` or directly:
//
//   bun scripts/docs-screenshots.ts ghcr.io/axanet/rackend:0.0.1 src/assets/screenshots/0.0
//
// Starts the image with Docker (fresh volume, free localhost port), seeds
// fictional demo data through the REST API, drives the admin UI with the
// local Google Chrome (playwright-core) and writes <name>-light.png and
// <name>-dark.png into <out-dir>. Containers and volumes are removed at the
// end, also on failure or Ctrl-C.
//
// Takes about 6 minutes: rackend samples the dashboard series once a minute,
// so the dashboard is taken last, when every chart has DASHBOARD_POINTS
// points (default 6). Needs Docker and Google Chrome.
import { createHash, randomBytes } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright-core";

type Theme = "light" | "dark";
const THEMES: Theme[] = ["light", "dark"];
const VIEWPORT = { width: 1280, height: 800 };
const ADMIN = { email: "admin@example.com", password: "field-notes-demo-admin-password" };
const USER_PASSWORD = "field-notes-demo-user-password";
// The issuer of the sign-in guide. Longer URLs make the add-provider dialog
// overflow in rackend 0.0.1 (its redirect URI does not wrap).
const PUBLIC_URL = "https://id.example.com";
const APP_URL = "https://fieldnotes.example.com";
const BRAND = "#2f7d5b";
const DASHBOARD_POINTS = Number(process.env.DASHBOARD_POINTS ?? 6);

const [image, outDir] = process.argv.slice(2);
if (!image || !outDir) {
  console.error("usage: bun scripts/docs-screenshots.ts <image> <out-dir>");
  process.exit(2);
}

// ---- Demo data (fictional people, example.com domains) ---------------------

const PEOPLE = [
  ["Juniper Hale", "juniper"],
  ["Rowan Ellery", "rowan"],
  ["Marisol Quint", "marisol"],
  ["Tobias Fenwick", "tobias"],
  ["Ines Calder", "ines"],
  ["Wren Abernathy", "wren"],
] as const;

// [title, author index, tags, published, body]
const POSTS: [string, number, string[], boolean, string][] = [
  ["First frost on the north ridge", 0, ["weather", "trails"], true, "Thin ice on the puddles above the second switchback at 7:10. Bring gloves for the morning loop."],
  ["Counting swifts at dusk", 1, ["birds", "field-notes"], true, "About 140 swifts circled the old chimney before dropping in at 18:42. Counted twice, kept the lower number."],
  ["Moss identification cheat sheet", 2, ["plants"], true, "Five common mosses of the stone walls and the hand lens features that tell them apart."],
  ["Trail 7 is muddy again", 3, ["trails"], true, "The low section by the creek crossing is ankle deep after last night's rain. The upper loop is fine."],
  ["Spring migration log, week 3", 1, ["birds"], true, "First willow warbler of the year by the reed beds, two days earlier than last spring."],
  ["Lichens of the old orchard wall", 4, ["plants", "field-notes"], true, "Seven species on the south face, three on the north. Photos and sketches attached to the shared folder."],
  ["Rain gauge readings for October", 5, ["weather"], true, "31 mm in total, most of it on the 14th. The gauge by the gate needs a new funnel."],
  ["Draft: owl pellet notes", 0, ["birds", "field-notes"], false, "Vole skulls in four of six pellets. Need a second opinion on the shrew jaw."],
];

// [post index, author index, body]
const COMMENTS: [number, number, string][] = [
  [0, 3, "Same on the east side, the bench was white at 7."],
  [0, 5, "My gauge read 0.4 degrees at dawn."],
  [1, 0, "Lovely count. Were any of them house martins?"],
  [1, 1, "None that I could tell, all swifts tonight."],
  [2, 4, "Printed this for the Saturday walk, thank you."],
  [3, 2, "Boots, not trainers. Learned that the hard way."],
  [4, 5, "Heard one by the bridge this morning too."],
  [5, 2, "The orange one by the gate is Xanthoria, I think."],
  [6, 3, "I can bring a spare funnel on Thursday."],
  [6, 0, "Thanks for keeping these up."],
];

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${BRAND}"/><path d="M19 45c0-16 11-27 27-27 0 16-11 27-27 27z" fill="#fff"/><path d="M22 42 39 25" stroke="${BRAND}" stroke-width="3" stroke-linecap="round"/></svg>`;
const LOGO = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

// ---- Small helpers ---------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

// Seeded PRNG (mulberry32), so the request mix is the same on every run.
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function waitUntil(what: string, timeoutMs: number, check: () => Promise<boolean>, everyMs = 500) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check().catch(() => false)) return;
    await sleep(everyMs);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// ---- Docker ----------------------------------------------------------------

async function docker(...args: string[]): Promise<{ out: string; err: string }> {
  const p = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) throw new Error(`docker ${args.join(" ")} failed (${code}): ${(err || out).trim()}`);
  return { out: out.trim(), err: err.trim() };
}

interface Instance {
  name: string;
  base: string;
}

const owned = new Set<string>();

async function removeInstance(name: string) {
  if (!owned.delete(name)) return;
  await docker("rm", "-f", "-v", name).catch((e) => console.error(String(e)));
  await docker("volume", "rm", "-f", name).catch((e) => console.error(String(e)));
}

async function cleanup() {
  for (const name of [...owned]) await removeInstance(name);
}

let interrupted = false;
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    if (interrupted) return;
    interrupted = true;
    console.error(`\n${sig}: removing containers and volumes`);
    void cleanup().finally(() => process.exit(130));
  });
}

/** Runs the image on a free localhost port with a fresh named volume. */
async function startInstance(label: string, env: Record<string, string>): Promise<Instance> {
  const name = `rackend-docs-${label}-${Date.now().toString(36)}`;
  owned.add(name);
  await docker("volume", "create", name);
  const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  await docker("run", "-d", "--name", name, "-p", "127.0.0.1::8080", "-v", `${name}:/data`, ...envArgs, image!);
  const port = (await docker("port", name, "8080/tcp")).out.split("\n")[0]!.split(":").pop();
  const base = `http://127.0.0.1:${port}`;
  await waitUntil(`${name} to answer /api/health`, 60_000, async () => (await fetch(`${base}/api/health`)).ok);
  return { name, base };
}

/** The setup token from the first-start log line ("Open http://…/_/setup?token=…"). */
async function setupToken(name: string): Promise<string> {
  let token = "";
  await waitUntil("the setup link in the log", 30_000, async () => {
    const { out, err } = await docker("logs", name);
    token = /\/_\/setup\?token=([A-Za-z0-9._~-]+)/.exec(`${out}\n${err}`)?.[1] ?? "";
    return token !== "";
  });
  return token;
}

// ---- REST API --------------------------------------------------------------

// Response bodies are used loosely; the API shapes are checked by the run.
type Json = any;

async function request(base: string, method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; data: Json }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data: Json = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function must(base: string, method: string, path: string, body?: unknown, token?: string): Promise<Json> {
  const r = await request(base, method, path, body, token);
  if (r.status >= 400) throw new Error(`${method} ${path}: HTTP ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}

async function signIn(base: string, path: string, email: string, password: string): Promise<{ token: string; id: string }> {
  const d = await must(base, "POST", path, { email, password });
  return { token: d.access_token as string, id: d.record.id as string };
}

interface Seed {
  users: { id: string; token: string }[];
  posts: { id: string; published: boolean }[];
  clientId: string;
}

async function seed(base: string): Promise<Seed> {
  const admin = (await signIn(base, "/api/superusers/auth-with-password", ADMIN.email, ADMIN.password)).token;
  const call = (method: string, path: string, body?: unknown) => must(base, method, path, body, admin);

  // Cookie requests from the UI must come from the public URL or a CORS
  // origin (CSRF check), so the local address is added as an origin.
  await call("PATCH", "/api/settings", {
    app: { name: "Field Notes", public_url: PUBLIC_URL, primary_color: BRAND, logo: LOGO },
    security: { app_redirect_uris: [`${APP_URL}/auth/done`], cors_origins: [base], rate_limits: { global_ip_per_min: 6000 } },
    backups: { schedule: "0 3 * * *", keep: 14, include_storage: true },
  });

  const usersCollection = await call("GET", "/api/collections/users");
  for (const [name, handle] of PEOPLE) {
    await call("POST", "/api/collections/users/records", { email: `${handle}@example.com`, password: USER_PASSWORD, name });
  }

  const posts = await call("POST", "/api/collections", {
    name: "posts",
    fields: [
      { name: "title", type: "text", required: true, max: 200 },
      { name: "body", type: "text", max: 10000 },
      { name: "published", type: "bool" },
      { name: "tags", type: "select", values: ["field-notes", "birds", "plants", "weather", "trails"], max_select: 3 },
      { name: "author", type: "relation", collection_id: usersCollection.id, max_select: 1 },
    ],
    indexes: [{ name: "idx_posts_published", fields: ["published"], unique: false }],
    rules: {
      list: "published = true || author = @request.auth.id",
      view: "published = true || author = @request.auth.id",
      create: '@request.auth.id != ""',
      update: "author = @request.auth.id",
      delete: "author = @request.auth.id",
    },
    options: { audit_records: true },
  });
  await call("POST", "/api/collections", {
    name: "comments",
    fields: [
      { name: "post", type: "relation", collection_id: posts.id, required: true, on_delete: "cascade" },
      { name: "author", type: "relation", collection_id: usersCollection.id },
      { name: "body", type: "text", required: true, max: 2000 },
    ],
    rules: {
      list: "post.published = true",
      view: "post.published = true",
      create: '@request.auth.id != ""',
      update: "author = @request.auth.id",
      delete: "author = @request.auth.id",
    },
    options: { audit_records: true },
  });

  const client = await call("POST", "/api/oauth-clients", {
    name: "Field Notes web",
    kind: "public",
    collection: "users",
    redirect_uris: [`${APP_URL}/callback`],
    post_logout_redirect_uris: [`${APP_URL}/`],
    first_party: true,
    dev: false,
    require_pkce: true,
    id_token_alg: "RS256",
    scopes: ["openid", "profile", "email", "offline_access"],
    enabled: true,
  });
  await call("PATCH", "/api/oauth-clients/default", { dev: true, redirect_uris: ["http://localhost:5173/callback"] });

  await call("POST", "/api/auth-providers", {
    name: "workspace",
    kind: "oidc",
    preset: null,
    issuer: "https://sso.example.com",
    client_id: "field-notes",
    client_secret: "demo-client-secret",
    scopes: "openid email profile",
    collection: "users",
    auto_link_verified_email: false,
    enabled: true,
  });

  await call("POST", "/api/channels", {
    name: "Rooms",
    pattern: "room:*",
    join_rule: '@request.auth.id != ""',
    publish_rule: "",
    presence: true,
    options: { max_members: 1000, rate_per_s: 20, echo: false, max_payload: 16384 },
  });

  // Backup names have a one-second resolution.
  await call("POST", "/api/backups");
  await sleep(1500);
  await call("POST", "/api/backups");

  // Set after creating the users, so none of the seeding tries to send mail.
  await call("PATCH", "/api/settings", {
    smtp: {
      host: "smtp.example.com",
      port: 587,
      tls: "starttls",
      username: "postmaster@fieldnotes.example.com",
      password: "demo-smtp-password",
      from_name: "Field Notes",
      from_address: "hello@fieldnotes.example.com",
    },
  });

  // User activity last, so it leads the audit trail: sign-ins, two failed
  // ones, and records written by their authors.
  const users: Seed["users"] = [];
  for (const [, handle] of PEOPLE) {
    const s = await signIn(base, "/api/collections/users/auth-with-password", `${handle}@example.com`, USER_PASSWORD);
    users.push({ id: s.id, token: s.token });
  }
  const created: Seed["posts"] = [];
  for (const [i, [title, a, tags, published, body]] of POSTS.entries()) {
    const u = users[a]!;
    const r = await must(base, "POST", "/api/collections/posts/records", { title, body, published, tags, author: u.id }, u.token);
    created.push({ id: r.id as string, published });
    if (i === 3) {
      for (let n = 0; n < 2; n++) {
        await request(base, "POST", "/api/collections/users/auth-with-password", { email: "rowan@example.com", password: "not the password" });
      }
    }
  }
  for (const [p, a, body] of COMMENTS) {
    const u = users[a]!;
    await must(base, "POST", "/api/collections/comments/records", { post: created[p]!.id, author: u.id, body }, u.token);
  }

  return { users, posts: created, clientId: client.id as string };
}

// ---- Traffic and realtime --------------------------------------------------

/** One request of the demo mix: reads, and with `errorShare` a 404 or 403. */
async function oneRequest(base: string, s: Seed, rand: () => number, errorShare: number) {
  const user = s.users[Math.floor(rand() * s.users.length)]!;
  const published = s.posts.filter((p) => p.published);
  const post = published[Math.floor(rand() * published.length)]!;
  const missing = `01a1e000-0000-7000-8000-${Math.floor(rand() * 1e12).toString().padStart(12, "0")}`;
  const failing = rand() < errorShare;
  const pick = rand();
  const [method, path, body, token]: [string, string, unknown?, string?] = failing
    ? pick < 0.45 ? ["GET", `/api/collections/posts/records/${missing}`]
      : pick < 0.65 ? ["GET", "/api/collections/photos/records"]
      : pick < 0.85 ? ["POST", "/api/collections/posts/records", { title: "Hello" }]
      : ["GET", "/api/logs", undefined, user.token]
    : pick < 0.5 ? ["GET", "/api/collections/posts/records?sort=-created&per_page=20"]
      : pick < 0.7 ? ["GET", `/api/collections/posts/records/${post.id}`]
      : pick < 0.83 ? ["GET", `/api/collections/comments/records?${new URLSearchParams({ filter: `post = '${post.id}'`, sort: "created" })}`]
      : pick < 0.94 ? ["GET", "/api/collections/posts/records?sort=-created", undefined, user.token]
      : ["GET", `/api/collections/users/records/${user.id}`, undefined, user.token];
  await request(base, method, path, body, token);
}

function startTraffic(base: string, s: Seed) {
  const rand = prng(7);
  let stopped = false;
  let sent = 0;
  // Calmer once the dashboard is next: its error rate covers the last minute.
  let errorShare = 0.08;
  const loop = (async () => {
    let rate = 1;
    let next = 0;
    while (!stopped) {
      // A new pace every 30 s gives the requests chart some shape.
      if (Date.now() >= next) {
        rate = 0.8 + rand() * 2.4;
        next = Date.now() + 30_000;
      }
      await oneRequest(base, s, rand, errorShare).catch(() => {});
      sent++;
      await sleep((1000 / rate) * (0.5 + rand()));
    }
  })();
  return {
    /** `n` requests, four at a time. */
    burst: async (n: number, share = errorShare) => {
      const r = prng(11 + n);
      for (let i = 0; i < n; i += 4) {
        await Promise.all([0, 1, 2, 3].map(() => oneRequest(base, s, r, share).catch(() => {})));
        sent += 4;
      }
    },
    calm: () => {
      errorShare = 0.02;
    },
    sent: () => sent,
    stop: async () => {
      stopped = true;
      await loop;
    },
  };
}

type Traffic = ReturnType<typeof startTraffic>;

/** A user's WebSocket that joined a channel; it stays until closed. */
function joinChannel(base: string, token: string, channel: string, meta: unknown): Promise<WebSocket> {
  const ws = new WebSocket(`${base.replace(/^http/, "ws")}/api/ws`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`joining ${channel} timed out`)), 10_000);
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: "auth", id: 1, token }));
      ws.send(JSON.stringify({ t: "join", id: 2, channel, meta }));
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.t === "err") reject(new Error(`${channel}: ${m.code} ${m.message}`));
      if (m.t === "ack" && m.id === 2) {
        clearTimeout(timer);
        resolve(ws);
      }
    };
    ws.onerror = () => reject(new Error(`WebSocket to ${channel} failed`));
  });
}

async function joinChannels(base: string, s: Seed): Promise<WebSocket[]> {
  const plan: [number, string, unknown][] = [
    [0, "room:north-ridge", { status: "online" }],
    [1, "room:north-ridge", { status: "typing" }],
    [3, "room:north-ridge", { status: "online" }],
    [4, "room:orchard", { status: "away" }],
  ];
  const sockets: WebSocket[] = [];
  for (const [u, channel, meta] of plan) sockets.push(await joinChannel(base, s.users[u]!.token, channel, meta));
  let n = 0;
  for (const ws of sockets) {
    const channel = plan[sockets.indexOf(ws)]![1];
    for (let i = 0; i < 3; i++) ws.send(JSON.stringify({ t: "pub", id: 100 + n++, channel, event: "note", data: { text: `checkpoint ${i + 1}` } }));
  }
  const ping = setInterval(() => sockets.forEach((ws) => ws.readyState === WebSocket.OPEN && ws.send('{"t":"ping"}')), 20_000);
  for (const ws of sockets) ws.addEventListener("close", () => clearInterval(ping), { once: true });
  return sockets;
}

// ---- Browser ---------------------------------------------------------------

const written: string[] = [];

async function newContext(browser: Browser, theme: Theme): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: theme,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
  });
  // The admin UI reads the theme from localStorage before the first paint.
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* hosted pages follow the color scheme instead */
    }
  }, theme);
  return ctx;
}

async function adminPage(browser: Browser, theme: Theme, base: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await newContext(browser, theme);
  const page = await ctx.newPage();
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${base}/_/login`);
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/_\/dashboard/);
  return { ctx, page };
}

/** The input, textarea or select of the label whose text starts with `text`. */
const field = (scope: Page | Locator, text: string) =>
  scope.locator("label").filter({ hasText: new RegExp(`^\\s*${text}`) }).locator("input, textarea, select").first();

async function waitForValue(page: Page, value: string) {
  await page.waitForFunction((v) => [...document.querySelectorAll("input, textarea")].some((i) => (i as HTMLInputElement).value === v), value);
}

async function noChecking(page: Page) {
  await page.waitForFunction(() => !document.body.innerText.includes("Checking…"));
}

interface ShotOptions {
  /** Clip to the union of these elements plus `margin`. */
  clip?: Locator[];
  margin?: number;
  /** The whole page instead of the viewport. */
  tall?: boolean;
}

/**
 * Makes the viewport as tall as the page and any open dialog. Used instead of
 * fullPage captures, which misplace modal dialogs.
 */
async function growViewport(page: Page) {
  const height = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, ...[...document.querySelectorAll("dialog[open]")].map((d) => d.scrollHeight + 120)),
  );
  await page.setViewportSize({ width: VIEWPORT.width, height: Math.ceil(height) });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

async function shot(page: Page, name: string, theme: Theme, o: ShotOptions = {}) {
  // No focus rings or hover states, fonts loaded.
  await page.evaluate(async () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    await document.fonts.ready;
  });
  await page.mouse.move(1, 1);
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() =>
    Math.max(0, ...[...document.querySelectorAll("dialog[open]")].map((d) => d.scrollWidth - d.clientWidth)),
  );
  if (overflow > 1) console.warn(`  warning: ${name}-${theme}: the dialog content overflows by ${overflow}px`);
  const path = join(outDir!, `${name}-${theme}.png`);
  try {
    if (o.clip) {
      const measure = async () => {
        const boxes: { x: number; y: number; width: number; height: number }[] = [];
        for (const l of o.clip!) {
          const b = await l.boundingBox();
          if (!b) throw new Error(`${name}: element to clip to is not visible`);
          boxes.push(b);
        }
        const m = o.margin ?? 16;
        const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - m);
        const y = Math.min(...boxes.map((b) => b.y)) - m;
        const right = Math.min(VIEWPORT.width, Math.max(...boxes.map((b) => b.x + b.width)) + m);
        const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + m;
        return { x, y, width: right - x, height: bottom - y };
      };
      await o.clip[0]!.scrollIntoViewIfNeeded();
      let clip = await measure();
      if (clip.y < 0 || clip.y + clip.height > (page.viewportSize()?.height ?? VIEWPORT.height)) {
        await growViewport(page);
        clip = await measure();
        clip = { ...clip, y: Math.max(0, clip.y) };
      }
      await page.screenshot({ path, clip, animations: "disabled" });
    } else {
      if (o.tall) await growViewport(page);
      await page.screenshot({ path, animations: "disabled" });
    }
  } finally {
    await page.setViewportSize(VIEWPORT);
  }
  written.push(path);
  log(`  ${name}-${theme}.png`);
}

async function adminShots(page: Page, theme: Theme, base: string, s: Seed, traffic: Traffic) {
  const go = (path: string) => page.goto(`${base}/_${path}`);

  await go("/collections");
  await page.getByRole("heading", { name: "Pick a collection" }).waitFor();
  await shot(page, "collections", theme);

  await go("/collections/posts");
  await page.locator("table tbody tr").nth(s.posts.length - 1).waitFor();
  await page.locator(".chip", { hasText: `${s.posts.length} records` }).waitFor();
  await page.locator(".live.on").waitFor({ timeout: 10_000 }).catch(() => {});
  await shot(page, "records", theme);

  // An invalid rule (a date compared with a boolean), checked live, not saved.
  await go("/collections/posts/schema");
  const update = page.locator("#rule-update");
  await update.waitFor();
  await noChecking(page);
  await update.fill("author = @request.auth.id && created > true");
  await page.locator("#rule-update-error .error-text").waitFor();
  await noChecking(page);
  await shot(page, "collection-rules", theme, { clip: [page.locator("section.card", { has: page.locator("#rule-list") })] });

  await go("/api");
  await page.getByText("OpenAPI document").waitFor();
  await page.locator("select").selectOption("posts");
  await page.getByText("/api/collections/posts/records").first().waitFor();
  await shot(page, "api", theme);

  await go("/settings/general");
  await waitForValue(page, PUBLIC_URL);
  await shot(page, "settings-general", theme);

  // Shows the S3 form without saving it.
  await go("/settings");
  await page.locator(".stats").waitFor();
  await page.locator("label.kind-option", { hasText: "S3-compatible" }).click();
  const s3 = page.locator("section.card", { hasText: "S3 connection" });
  await s3.waitFor();
  await field(s3, "Endpoint").fill("https://s3.example.com");
  await field(s3, "Region").fill("eu-central-1");
  await field(s3, "Bucket").fill("field-notes-uploads");
  await field(s3, "Key prefix").fill("production");
  await field(s3, "Access key id").fill("FNDEMOACCESSKEY01");
  await field(s3, "Secret access key").fill("demo-secret-access-key");
  // Cards are 16px apart: a smaller margin keeps the next one out.
  await shot(page, "settings-storage", theme, { clip: [page.locator("nav.tabs"), s3], margin: 12 });

  await go("/settings/email");
  await waitForValue(page, "smtp.example.com");
  await shot(page, "settings-email", theme, {
    clip: [page.locator("nav.tabs"), page.locator("section.card", { hasText: "Templates" })],
    margin: 24,
  });

  await go("/settings/providers");
  await page.locator("strong.mono", { hasText: "workspace" }).waitFor();
  await shot(page, "settings-providers", theme);
  await page.locator("button.preset", { hasText: "Other" }).click();
  const provider = page.locator("dialog[open]");
  await provider.waitFor();
  await field(provider, "Name").fill("partners");
  await field(provider, "Issuer URL").fill("https://login.partners.example.com");
  await field(provider, "Client id").fill("field-notes");
  await field(provider, "Client secret").fill("demo-client-secret");
  await shot(page, "settings-providers-dialog", theme, { clip: [provider], margin: 24 });
  await provider.getByRole("button", { name: "Cancel" }).click();

  await go("/settings/apps");
  await page.locator("ul.list li", { hasText: "Field Notes web" }).waitFor();
  await page.locator("table tbody tr td.mono").first().waitFor();
  await shot(page, "settings-apps", theme);
  // The add dialog, filled in for a server app and not saved.
  await page.getByRole("button", { name: "Add app" }).click();
  const app = page.locator("dialog[open]");
  await app.waitFor();
  await field(app, "Name").fill("Field Notes admin");
  await app.locator("label.inline", { hasText: "Server app" }).click();
  await field(app, "Redirect URIs").fill("https://admin.fieldnotes.example.com/auth/callback");
  await field(app, "After sign-out").fill("https://admin.fieldnotes.example.com/");
  await shot(page, "settings-apps-dialog", theme, { clip: [app], margin: 24 });
  await app.getByRole("button", { name: "Cancel" }).click();

  await go("/settings/backups");
  await page.locator("ul.list li").nth(1).waitFor();
  await shot(page, "settings-backups", theme);

  await go("/channels");
  await page.locator("td.mono", { hasText: "room:*" }).waitFor();
  await page.locator(".instance").nth(1).waitFor();
  await shot(page, "channels", theme);

  // App requests on top of the admin UI's own, flushed to the log (every 1 s).
  await traffic.burst(16, 0.3);
  await sleep(1500);
  await go("/logs");
  await page.locator("tbody tr").nth(20).waitFor();
  await shot(page, "logs", theme);

  await go("/audit");
  await page.locator("ol.timeline > li").nth(5).waitFor();
  await shot(page, "audit", theme);
}

/** rackend's hosted sign-in page, reached like an app would (code flow, PKCE). */
async function signInPageShot(browser: Browser, theme: Theme, base: string, s: Seed) {
  const ctx = await newContext(browser, theme);
  try {
    const page = await ctx.newPage();
    const verifier = randomBytes(32).toString("base64url");
    const q = new URLSearchParams({
      client_id: s.clientId,
      redirect_uri: `${APP_URL}/callback`,
      response_type: "code",
      scope: "openid profile email offline_access",
      state: randomBytes(8).toString("hex"),
      nonce: randomBytes(8).toString("hex"),
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    await page.goto(`${base}/oauth2/authorize?${q}`);
    await page.waitForURL(/\/auth\/login\?/);
    await page.locator('form[action="/auth/login"]').waitFor();
    await shot(page, "sign-in-page", theme, { clip: [page.locator("main")], margin: 48 });
  } finally {
    await ctx.close();
  }
}

/** The first-start screen of a second instance without a superuser. */
async function setupShots(browser: Browser) {
  const inst = await startInstance("setup", {});
  try {
    const token = await setupToken(inst.name);
    for (const theme of THEMES) {
      const ctx = await newContext(browser, theme);
      try {
        const page = await ctx.newPage();
        await page.goto(`${inst.base}/_/setup?token=${encodeURIComponent(token)}`);
        await page.getByRole("heading", { name: "Set up rackend" }).waitFor();
        await field(page, "Email").fill(ADMIN.email);
        await field(page, "Password").fill(ADMIN.password);
        // As seen when the container is published on port 8080.
        await field(page, "Public URL").fill("http://localhost:8080");
        await shot(page, "setup", theme, { clip: [page.locator(".top"), page.locator("section.card"), page.locator("p.fonts")], margin: 40 });
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await removeInstance(inst.name);
  }
}

async function waitForSeries(base: string) {
  // A fresh token: the seed token may be close to its 15 minutes.
  const admin = (await signIn(base, "/api/superusers/auth-with-password", ADMIN.email, ADMIN.password)).token;
  const series = "http.rps,http.p95_ms,host.cpu_percent,host.memory_used";
  let last = -1;
  await waitUntil(
    `${DASHBOARD_POINTS} points in every dashboard chart`,
    (DASHBOARD_POINTS + 4) * 60_000,
    async () => {
      const d = await must(base, "GET", `/api/metrics/series?series=${series}`, undefined, admin);
      const counts = Object.values(d.series as Record<string, unknown[]>).map((v) => v.length);
      const min = counts.length === 4 ? Math.min(...counts) : 0;
      if (min !== last) log(`dashboard: ${min} of ${DASHBOARD_POINTS} points`);
      last = min;
      return min >= DASHBOARD_POINTS;
    },
    5000,
  );
}

// ---- Main ------------------------------------------------------------------

async function main() {
  const started = Date.now();
  await mkdir(outDir!, { recursive: true });

  log(`starting ${image}`);
  const inst = await startInstance("main", {
    RACKEND_SUPERUSER_EMAIL: ADMIN.email,
    RACKEND_SUPERUSER_PASSWORD: ADMIN.password,
  });
  log(`rackend at ${inst.base}, seeding demo data`);
  const s = await seed(inst.base);
  const traffic = startTraffic(inst.base, s);
  await traffic.burst(160);
  const sockets = await joinChannels(inst.base, s);

  // Playwright would exit on signals before the volumes are removed; it
  // still closes Chrome when the process exits.
  const browser = await chromium.launch({ channel: "chrome", handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
  try {
    for (const theme of THEMES) {
      log(`admin UI, ${theme}`);
      const { ctx, page } = await adminPage(browser, theme, inst.base);
      try {
        await adminShots(page, theme, inst.base, s, traffic);
      } finally {
        await ctx.close();
      }
      await signInPageShot(browser, theme, inst.base, s);
    }

    log("first-start setup screen");
    await setupShots(browser);

    log("waiting for the dashboard series (sampled once a minute)");
    traffic.calm();
    await waitForSeries(inst.base);
    for (const theme of THEMES) {
      const { ctx, page } = await adminPage(browser, theme, inst.base);
      try {
        // In rackend 0.0.1 a chart drawn before its first measurement (series
        // loaded before the summary) keeps its 320px default and overflows its
        // card. Holding the series back lets the cards render first.
        await page.route("**/api/metrics/series*", async (route) => {
          await sleep(1000);
          await route.continue();
        });
        await page.goto(`${inst.base}/_/dashboard`);
        await page.locator(".tiles").waitFor();
        await page.locator(".chart svg").nth(3).waitFor();
        await page.locator("table tbody tr").first().waitFor();
        const overflowing = await page.evaluate(
          () => [...document.querySelectorAll(".chart")].filter((c) => c.getBoundingClientRect().right > c.parentElement!.getBoundingClientRect().right).length,
        );
        if (overflowing) console.warn(`  warning: dashboard-${theme}: ${overflowing} charts are wider than their cards`);
        await shot(page, "dashboard", theme, { tall: true });
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    for (const ws of sockets) ws.close();
    await traffic.stop();
    log(`${traffic.sent()} demo API requests sent`);
  }

  const rows = await Promise.all(written.map(async (p) => [p, (await stat(p)).size] as const));
  const width = Math.max(...rows.map(([p]) => p.length));
  console.log(`\n${"file".padEnd(width)}  ${"size".padStart(8)}`);
  for (const [p, size] of rows) console.log(`${p.padEnd(width)}  ${`${Math.round(size / 1024)} KB`.padStart(8)}`);
  const total = rows.reduce((a, [, n]) => a + n, 0);
  console.log(`${rows.length} files, ${(total / 1024 / 1024).toFixed(1)} MB, ${Math.round((Date.now() - started) / 1000)} s`);
}

try {
  await main();
} catch (e) {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exitCode = 1;
} finally {
  await cleanup();
}
