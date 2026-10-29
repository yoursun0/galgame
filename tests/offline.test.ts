import { describe, expect, test } from "bun:test";
import {
  buildPrecacheList,
  isWorkOfflineReady,
  normalizeBase,
  withBase,
} from "../src/offline.ts";
import {
  defaultShellCacheName,
  resolveBuildId,
  resolveCacheName,
  swSource,
} from "../src/pwa-plugin.ts";

describe("offline helpers", () => {
  test("normalizeBase keeps root and adds trailing slash", () => {
    expect(normalizeBase("/")).toBe("/");
    expect(normalizeBase("/galgame")).toBe("/galgame/");
    expect(normalizeBase("/galgame/")).toBe("/galgame/");
  });

  test("withBase joins without double slashes", () => {
    expect(withBase("/", "index.html")).toBe("/index.html");
    expect(withBase("/galgame/", "assets/a.js")).toBe("/galgame/assets/a.js");
    expect(withBase("/galgame", "/sw.js")).toBe("/galgame/sw.js");
  });

  test("buildPrecacheList includes shell docs and skips sw/maps", () => {
    const list = buildPrecacheList(
      [
        "index.html",
        "assets/app.js",
        "assets/app.js.map",
        "sw.js",
        "icons/icon-192.png",
        "intro/frontpage_open_30s_web.mp4",
        "intro/frontpage_open_30s_web.webm",
      ],
      "/galgame/",
    );
    expect(list).toContain("/galgame/index.html");
    expect(list).toContain("/galgame/manifest.webmanifest");
    expect(list).toContain("/galgame/assets/app.js");
    expect(list).toContain("/galgame/icons/icon-192.png");
    expect(list.some((url) => url.endsWith("sw.js"))).toBe(false);
    expect(list.some((url) => url.endsWith(".map"))).toBe(false);
    expect(list.some((url) => url.includes("/intro/"))).toBe(false);
  });

  test("offlineReady flag", () => {
    expect(isWorkOfflineReady({ offlineReady: true })).toBe(true);
    expect(isWorkOfflineReady({})).toBe(false);
  });
});

describe("PWA cache name and generated SW", () => {
  test("default cache name is galgame-shell-${buildId}", () => {
    expect(defaultShellCacheName("abc1234")).toBe("galgame-shell-abc1234");
    const id = resolveBuildId();
    expect(id.length).toBeGreaterThan(0);
    expect(resolveCacheName()).toBe(`galgame-shell-${id}`);
    expect(resolveCacheName()).not.toBe("galgame-shell-v1");
  });

  test("optional cacheName override is kept", () => {
    expect(resolveCacheName("galgame-shell-test")).toBe("galgame-shell-test");
  });

  test("generated SW is network-first for navigate and handles SKIP_WAITING", () => {
    const src = swSource("galgame-shell-deadbee", ["/index.html"], "/");
    expect(src).toContain('const CACHE = "galgame-shell-deadbee"');
    expect(src).toContain('req.mode === "navigate"');
    expect(src).toContain('path.endsWith("index.html")');
    expect(src).toContain('event.data.type === "SKIP_WAITING"');
    expect(src).toContain("self.skipWaiting()");
    expect(src).toContain("self.clients.claim()");
  });
});
