/**
 * Local offline acceptance for issue #9 (no deploy).
 * Builds with BASE_PATH, asserts sw.js / manifest / precache, serves index under base.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const basePath = process.env.BASE_PATH ?? "/galgame/";
const want = basePath === "/" ? "/" : basePath.endsWith("/") ? basePath : `${basePath}/`;
const dist = join(root, "dist");

function run(cmd: string, args: string[], env: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function fail(msg: string): never {
  console.error(`verify-offline FAIL: ${msg}`);
  process.exit(1);
}

const buildCode = await run("bunx", ["vite", "build"], { BASE_PATH: want });
if (buildCode !== 0) fail("vite build failed");

for (const name of ["index.html", "sw.js", "manifest.webmanifest", "precache.json"]) {
  if (!existsSync(join(dist, name))) fail(`missing ${name} in dist`);
}

const precache = JSON.parse(readFileSync(join(dist, "precache.json"), "utf8")) as {
  base: string;
  urls: string[];
  count: number;
};
if (precache.base !== want) fail(`precache base ${precache.base} != ${want}`);
if (precache.count < 10) fail(`precache too small: ${precache.count}`);
if (!precache.urls.some((u) => u.endsWith("index.html"))) fail("precache missing index.html");

const sw = readFileSync(join(dist, "sw.js"), "utf8");
if (!sw.includes("PRECACHE") || !sw.includes("galgame-shell")) fail("sw.js missing precache");

const manifest = JSON.parse(readFileSync(join(dist, "manifest.webmanifest"), "utf8")) as {
  scope: string;
};
if (manifest.scope !== want) fail(`manifest scope ${manifest.scope} != ${want}`);

const port = 4179;
const strip = want === "/" ? "" : want.replace(/\/$/, "");
const server = Bun.serve({
  port,
  async fetch(req) {
    let path = new URL(req.url).pathname;
    if (strip && path.startsWith(strip)) path = path.slice(strip.length) || "/";
    if (path === "/") path = "/index.html";
    const file = Bun.file(join(dist, path.replace(/^\//, "")));
    if (await file.exists()) return new Response(file);
    return new Response("missing", { status: 404 });
  },
});

const pageUrl = want === "/" ? `http://127.0.0.1:${port}/index.html` : `http://127.0.0.1:${port}${want}index.html`;
const res = await fetch(pageUrl);
if (!res.ok) {
  server.stop();
  fail(`GET ${pageUrl} -> ${res.status}`);
}
const html = await res.text();
if (!html.includes("manifest.webmanifest")) {
  server.stop();
  fail("built index.html missing manifest link");
}
const swRes = await fetch(
  want === "/" ? `http://127.0.0.1:${port}/sw.js` : `http://127.0.0.1:${port}${want}sw.js`,
);
if (!swRes.ok) {
  server.stop();
  fail(`sw.js fetch failed ${swRes.status}`);
}
server.stop();

console.log(
  JSON.stringify(
    {
      ok: true,
      base: want,
      precacheCount: precache.count,
      scope: manifest.scope,
      manualBrowserSteps: [
        `BASE_PATH=${want} bun run build`,
        `bunx vite preview --base ${want}`,
        "Open URL?work=mystery-fixture, play once so SW installs",
        "DevTools → Application → Service Workers / Network offline",
        "Hard reload; 晚班鑰匙 should still play",
      ],
    },
    null,
    2,
  ),
);
