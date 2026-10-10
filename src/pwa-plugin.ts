import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";
import { buildPrecacheList, normalizeBase } from "./offline.ts";

function listFiles(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, root));
    else out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

function swSource(cacheName: string, precache: string[], base: string): string {
  const b = normalizeBase(base);
  const fallback = b === "/" ? "/index.html" : `${b}index.html`;
  return `/* galgame service worker — generated at build; do not edit */
const CACHE = ${JSON.stringify(cacheName)};
const PRECACHE = ${JSON.stringify(precache)};
const FALLBACK = ${JSON.stringify(fallback)};
const SCOPE = ${JSON.stringify(b)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((resp) => {
          if (resp.ok && (req.mode === "navigate" || url.pathname.startsWith(SCOPE))) {
            const copy = resp.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
          }
          return resp;
        })
        .catch(() => caches.match(FALLBACK).then((page) => page || Response.error()));
    }),
  );
});
`;
}

export function galgamePwa(options: { base: string; cacheName?: string }): Plugin {
  const base = normalizeBase(options.base);
  const cacheName = options.cacheName ?? "galgame-shell-v1";
  let outDir = "dist";

  return {
    name: "galgame-pwa",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml(html) {
      const manifestHref = withHref(base, "manifest.webmanifest");
      const iconHref = withHref(base, "icons/icon-192.png");
      const inject = [
        `    <link rel="manifest" href="${manifestHref}" />`,
        `    <meta name="theme-color" content="#1a1a22" />`,
        `    <link rel="apple-touch-icon" href="${iconHref}" />`,
      ].join("\n");
      return html.includes("</head>")
        ? html.replace("</head>", `${inject}\n  </head>`)
        : `${html}\n${inject}\n`;
    },
    closeBundle() {
      const dist = join(process.cwd(), outDir);
      try {
        statSync(dist);
      } catch {
        return;
      }
      const files = listFiles(dist);
      const precache = buildPrecacheList(files, base);
      writeFileSync(join(dist, "sw.js"), swSource(cacheName, precache, base));
      const iconBase = base === "/" ? "/" : base;
      const manifest = {
        name: "galgame",
        short_name: "galgame",
        description: "Visual novel player — offline when work assets are cached",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#1a1a22",
        theme_color: "#1a1a22",
        lang: "zh-Hant",
        icons: [
          { src: `${iconBase}icons/icon-192.png`, sizes: "192x192", type: "image/png" },
          { src: `${iconBase}icons/icon-512.png`, sizes: "512x512", type: "image/png" },
        ],
      };
      writeFileSync(join(dist, "manifest.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`);
      const iconsDir = join(dist, "icons");
      mkdirSync(iconsDir, { recursive: true });
      for (const name of ["icon-192.png", "icon-512.png"]) {
        try {
          writeFileSync(join(iconsDir, name), readFileSync(join(process.cwd(), "public", "icons", name)));
        } catch {
          /* public/ already copied by Vite */
        }
      }
      writeFileSync(
        join(dist, "precache.json"),
        `${JSON.stringify({ base, cacheName, count: precache.length, urls: precache }, null, 2)}\n`,
      );
    },
  };
}

function withHref(base: string, rel: string): string {
  return base === "/" ? `/${rel}` : `${base}${rel}`;
}
