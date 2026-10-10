import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { inspectAssetFile } from "../src/links.ts";

const repo = join(import.meta.dir, "..");

test("xingkong background pointer resolves inside the repo", () => {
  const link = join(repo, "works/xingkong/assets/bg/bg-beach-day.jpg");
  const found = inspectAssetFile(link, repo);
  expect(found.kind).toBe("link");
  if (found.kind !== "link") return;
  expect(found.target).toBe(realpathSync(join(repo, "bg/bg-beach-day.jpg")));
});

test("xingkong playtest sprite is a real image file", () => {
  // Gate-8 art ships playtest expressions as real PNGs under assets/sprites.
  const file = join(repo, "works/xingkong/assets/sprites/qishan/01-grin.png");
  expect(inspectAssetFile(file, repo)).toEqual({ kind: "file" });
});

test("xingkong unify sprite is a real image file", () => {
  // PR #22 ships former leftover symlink sprites as real PNGs under assets/sprites.
  const file = join(repo, "works/xingkong/assets/sprites/qishan/04-loud.png");
  expect(inspectAssetFile(file, repo)).toEqual({ kind: "file" });
});

test("a real image is not treated as a link", () => {
  const file = join(repo, "bg/bg-beach-day.jpg");
  expect(inspectAssetFile(file, repo)).toEqual({ kind: "file" });
});

describe("synthetic pointers", () => {
  test("a relative pointer inside the project resolves", () => {
    const dir = mkdtempSync(join(tmpdir(), "galgame-link-"));
    try {
      mkdirSync(join(dir, "works/xingkong/assets/bg"), { recursive: true });
      mkdirSync(join(dir, "bg"), { recursive: true });
      writeFileSync(join(dir, "bg/bg-beach-day.jpg"), "jpeg");
      writeFileSync(
        join(dir, "works/xingkong/assets/bg/bg-beach-day.jpg"),
        "../../../../bg/bg-beach-day.jpg",
      );
      const found = inspectAssetFile(join(dir, "works/xingkong/assets/bg/bg-beach-day.jpg"), dir);
      expect(found.kind).toBe("link");
      if (found.kind !== "link") return;
      expect(found.target).toBe(realpathSync(join(dir, "bg/bg-beach-day.jpg")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a pointer that leaves the project is broken", () => {
    const dir = mkdtempSync(join(tmpdir(), "galgame-link-"));
    try {
      const project = join(dir, "project");
      mkdirSync(join(project, "works/xingkong/assets/bg"), { recursive: true });
      writeFileSync(join(dir, "outside.jpg"), "secret");
      writeFileSync(
        join(project, "works/xingkong/assets/bg/evil.jpg"),
        "../../../../../../outside.jpg",
      );
      expect(
        inspectAssetFile(join(project, "works/xingkong/assets/bg/evil.jpg"), project),
      ).toEqual({ kind: "broken" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a pointer whose target is missing is broken", () => {
    const dir = mkdtempSync(join(tmpdir(), "galgame-link-"));
    try {
      mkdirSync(join(dir, "assets"), { recursive: true });
      writeFileSync(join(dir, "assets/gone.jpg"), "../missing.jpg");
      expect(inspectAssetFile(join(dir, "assets/gone.jpg"), dir)).toEqual({ kind: "broken" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
