import { describe, expect, test } from "bun:test";
import {
  buildPrecacheList,
  isWorkOfflineReady,
  normalizeBase,
  withBase,
} from "../src/offline.ts";

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
      ["index.html", "assets/app.js", "assets/app.js.map", "sw.js", "icons/icon-192.png"],
      "/galgame/",
    );
    expect(list).toContain("/galgame/index.html");
    expect(list).toContain("/galgame/manifest.webmanifest");
    expect(list).toContain("/galgame/assets/app.js");
    expect(list).toContain("/galgame/icons/icon-192.png");
    expect(list.some((url) => url.endsWith("sw.js"))).toBe(false);
    expect(list.some((url) => url.endsWith(".map"))).toBe(false);
  });

  test("offlineReady flag", () => {
    expect(isWorkOfflineReady({ offlineReady: true })).toBe(true);
    expect(isWorkOfflineReady({})).toBe(false);
  });
});
