import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkWork } from "../src/check.ts";
import { advanceGesture, chooseStep } from "../src/flow.ts";
import { initialState, reduce } from "../src/reduce.ts";
import type { Scene, Work, WorkManifest } from "../src/types.ts";

const repo = join(import.meta.dir, "..");
const worksRoot = join(repo, "works");

function listWorkIds(): string[] {
  return readdirSync(worksRoot).filter((name) => {
    try {
      return statSync(join(worksRoot, name, "work.json")).isFile();
    } catch {
      return false;
    }
  });
}

function loadWork(id: string): Work {
  const root = join(worksRoot, id);
  const manifest = JSON.parse(readFileSync(join(root, "work.json"), "utf8")) as WorkManifest;
  const scenes = manifest.scenes.map((rel) => {
    return JSON.parse(readFileSync(join(root, rel), "utf8")) as Scene;
  });
  return { manifest, scenes };
}

describe("works are data-only under works/", () => {
  test("both works exist; player discovers via glob not hard-coded story paths", () => {
    const ids = listWorkIds();
    expect(ids).toContain("mystery-fixture");
    expect(ids).toContain("xingkong");
    const main = readFileSync(join(repo, "src/main.ts"), "utf8");
    expect(main).toContain('import.meta.glob("../works/*/work.json"');
    expect(main).not.toContain("works/mystery-fixture/story/");
    expect(main).not.toContain("works/xingkong/story/");
  });

  test("check passes for every bundled work", () => {
    for (const id of listWorkIds()) {
      const result = checkWork(join(worksRoot, id));
      expect(result.ok, `${id}: ${result.errors.map((e) => e.message).join("; ")}`).toBe(true);
    }
  });

  test("mystery-fixture playable on every choice; offlineReady", () => {
    const work = loadWork("mystery-fixture");
    expect(work.manifest.id).toBe("mystery-fixture");
    expect(work.manifest.title).toBe("晚班鑰匙");
    expect(work.manifest.offlineReady).toBe(true);
    expect(work.manifest.start).toBe("corridor");

    for (const choiceIndex of [0, 1, 2]) {
      let state = initialState(work);
      let seen = new Set<string>();
      for (let i = 0; i < 20 && !state.choices && !state.ending; i++) {
        const gesture = advanceGesture(false, work, state, seen);
        if (gesture.type !== "step") break;
        state = gesture.state;
        seen = gesture.seen;
      }
      expect(state.choices?.length).toBe(3);
      const chosen = chooseStep(work, state, choiceIndex);
      expect(chosen).not.toBeNull();
      state = chosen!;
      if (choiceIndex === 0) expect(state.vars.locked).toBe(true);
      else expect(state.vars.locked).toBe(false);
      for (let i = 0; i < 24 && !state.ending; i++) {
        state = reduce(work, state, { type: "advance" });
      }
      expect(state.ending?.id).toBe("stop");
    }
  });

  test("xingkong loads as a separate work id", () => {
    const work = loadWork("xingkong");
    expect(work.manifest.id).toBe("xingkong");
    expect(work.scenes.length).toBeGreaterThan(5);
  });

  test("xingkong titleBgm points at approved Doubao theme asset", () => {
    const work = loadWork("xingkong");
    expect(work.manifest.titleBgm).toBe("bgm-xingkong-luoyin");
    const fixture = loadWork("mystery-fixture");
    expect(fixture.manifest.titleBgm).toBeUndefined();

    const assets = JSON.parse(
      readFileSync(join(worksRoot, "xingkong/asset-manifest.json"), "utf8"),
    ) as { id: string; path: string; type: string; approved: boolean; license?: string; credit?: string }[];
    const theme = assets.find((a) => a.id === "bgm-xingkong-luoyin");
    expect(theme).toBeDefined();
    expect(theme?.type).toBe("bgm");
    expect(theme?.approved).toBe(true);
    expect(theme?.path).toBe("assets/bgm/xingkong-luoyin.mp3");
    expect(theme?.license).toBe("Helic/Doubao");
    expect(theme?.credit).toContain("星空烙印");
    expect(statSync(join(worksRoot, "xingkong", theme!.path)).isFile()).toBe(true);

    const main = readFileSync(join(repo, "src/main.ts"), "utf8");
    expect(main).toContain("playTitleBgm");
    expect(main).toContain("titleBgm");
  });

  test("xingkong titleNote is adaptation credit; mystery-fixture omits it", () => {
    const work = loadWork("xingkong");
    expect(work.manifest.titleNote).toBe("改篇自凌晨《話當年之二》@ 2011");
    const fixture = loadWork("mystery-fixture");
    expect(fixture.manifest.titleNote).toBeUndefined();

    const main = readFileSync(join(repo, "src/main.ts"), "utf8");
    expect(main).toContain("titleNote");
    expect(main).not.toContain("可切換（無需改播放器）");
  });
});
