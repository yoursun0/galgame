import { describe, expect, test } from "bun:test";
import { isThumbnailDataUrl, visualKey } from "../src/thumbnail.ts";
import type { PlayState } from "../src/types.ts";

// Puppy #67
describe("save slot thumbnails", () => {
  test("isThumbnailDataUrl accepts jpeg/webp data URLs and rejects junk", () => {
    const jpeg =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==";
    const webp = "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";
    expect(isThumbnailDataUrl(jpeg)).toBe(true);
    expect(isThumbnailDataUrl(webp)).toBe(true);
    expect(isThumbnailDataUrl("data:image/jpeg;base64,")).toBe(false);
    expect(isThumbnailDataUrl("https://example.com/x.jpg")).toBe(false);
    expect(isThumbnailDataUrl(null)).toBe(false);
    expect(isThumbnailDataUrl(undefined)).toBe(false);
  });

  test("visualKey changes when bg/actors/cg change", () => {
    const base: PlayState = {
      sceneId: "open1",
      index: 0,
      vars: {},
      background: "bg-bus",
      actors: [{ id: "lingchen", expr: "01-shrug", position: "near" }],
      cg: null,
      audio: { bgm: null, se: null, ambience: null },
      line: null,
      choices: null,
      ending: null,
      waiting: false,
    };
    const a = visualKey(base);
    const b = visualKey({ ...base, background: "bg-wall" });
    const c = visualKey({
      ...base,
      actors: [{ id: "lingchen", expr: "02-blush", position: "near" }],
    });
    const d = visualKey({ ...base, cg: "cg-wall-wind" });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    expect(visualKey(base)).toBe(a);
  });
});
