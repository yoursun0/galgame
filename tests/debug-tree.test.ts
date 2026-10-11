import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDebugTree,
  countChoiceInstructions,
  findVarsAtScene,
  flattenDebugTree,
  jumpToScene,
} from "../src/debug-tree.ts";
import type { Scene, Work, WorkManifest } from "../src/types.ts";

function loadWork(id: string): Work {
  const root = join(import.meta.dir, "../works", id);
  const manifest = JSON.parse(readFileSync(join(root, "work.json"), "utf8")) as WorkManifest;
  const scenes = manifest.scenes.map((rel) => {
    return JSON.parse(readFileSync(join(root, rel), "utf8")) as Scene;
  });
  return { manifest, scenes };
}

describe("debug-tree (#74)", () => {
  test("mystery-fixture: choice edges, ending hub, set on lock path", () => {
    const work = loadWork("mystery-fixture");
    const tree = buildDebugTree(work);
    expect(tree.start).toBe("corridor");
    expect(countChoiceInstructions(work)).toBe(1);

    const corridor = tree.nodes.get("corridor");
    expect(corridor?.hasChoice).toBe(true);
    expect(corridor?.edges.filter((e) => e.kind === "choice")).toHaveLength(3);

    const done = tree.nodes.get("done");
    expect(done?.endingId).toBe("stop");
    expect(done?.hub).toBe(true);

    // Entry to lock: locked still false; after jumpToScene reduce, set runs before first line.
    const entry = findVarsAtScene(work, "lock");
    expect(entry?.locked).toBe(false);
    const playing = jumpToScene(work, "lock");
    expect(playing).not.toBeNull();
    expect(playing!.sceneId).toBe("lock");
    expect(playing!.vars.locked).toBe(true);
    expect(playing!.waiting).toBe(true);

    // Shortest path to done is via first choice option (lock) → locked true at entry to done.
    const atDone = findVarsAtScene(work, "done");
    expect(atDone?.locked).toBe(true);
  });

  test("xingkong: ~33 choices, endings, jump applies ch4_faced via star_stay", () => {
    const work = loadWork("xingkong");
    const tree = buildDebugTree(work);
    const choices = countChoiceInstructions(work);
    expect(choices).toBeGreaterThanOrEqual(30);
    expect(choices).toBeLessThanOrEqual(40);

    let endingHubs = 0;
    for (const node of tree.nodes.values()) {
      if (node.endingId) endingHubs += 1;
    }
    expect(endingHubs).toBeGreaterThanOrEqual(7);

    const rows = flattenDebugTree(tree);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows[0]?.sceneId).toBe(work.manifest.start);

    const star = jumpToScene(work, "star_choice");
    expect(star).not.toBeNull();
    expect(star!.sceneId).toBe("star_choice");
    expect(star!.waiting).toBe(true);
    // Choice is later in the scene; first beat is dialogue/narration.

    // star_choice__1 sets ch4_faced=true then jumps to star_stay.
    const stayVars = findVarsAtScene(work, "star_stay");
    expect(stayVars?.ch4_faced).toBe(true);
    expect(stayVars?.courage).toBe(1);

    const leaveVars = findVarsAtScene(work, "star_leave");
    expect(leaveVars?.ch4_faced).toBe(false);

    const stay = jumpToScene(work, "star_stay");
    expect(stay).not.toBeNull();
    expect(stay!.vars.ch4_faced).toBe(true);

    const filtered = flattenDebugTree(tree, "star_choice");
    expect(filtered.some((r) => r.sceneId.includes("star_choice"))).toBe(true);
  });

  test("unknown scene returns null", () => {
    const work = loadWork("mystery-fixture");
    expect(jumpToScene(work, "no-such-scene")).toBeNull();
  });
});
