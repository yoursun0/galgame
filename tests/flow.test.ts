import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  advanceGesture,
  autoStep,
  chooseStep,
  emptyProgress,
  enterRecall,
  exitRecall,
  lineKey,
  pushBacklog,
  recallStart,
  recordUnlocks,
  skipRead,
  withSeen,
} from "../src/flow.ts";
import { presentGallery } from "../src/gallery.ts";
import { initialState } from "../src/reduce.ts";
import type { AssetRecord, Scene, Work, WorkManifest } from "../src/types.ts";

function loadWork(id: string): { work: Work; assets: AssetRecord[] } {
  const root = join(import.meta.dir, "../works", id);
  const manifest = JSON.parse(readFileSync(join(root, "work.json"), "utf8")) as WorkManifest;
  const scenes = manifest.scenes.map((rel) => {
    return JSON.parse(readFileSync(join(root, rel), "utf8")) as Scene;
  });
  const assets = JSON.parse(readFileSync(join(root, "asset-manifest.json"), "utf8")) as AssetRecord[];
  return { work: { manifest, scenes }, assets };
}

function playToChoice(work: Work) {
  let state = initialState(work);
  let seen = new Set<string>();
  const beats = [state];
  for (let i = 0; i < 8; i++) {
    const gesture = advanceGesture(false, work, state, seen);
    if (gesture.type !== "step") break;
    seen = gesture.seen;
    state = gesture.state;
    beats.push(state);
    if (state.choices) break;
  }
  return { state, seen, beats };
}

describe("advance, skip, auto, backlog", () => {
  const { work } = loadWork("mystery-fixture");

  test("first advance while typing only reveals", () => {
    const state = initialState(work);
    const gesture = advanceGesture(true, work, state, new Set());
    expect(gesture.type).toBe("reveal");
  });

  test("advance does not step or mark read when the script does not move", () => {
    const stuck = { ...initialState(work), index: 9999 };
    const seen = new Set<string>();
    const gesture = advanceGesture(false, work, stuck, seen);
    expect(gesture.type).toBe("blocked");
    expect(seen.size).toBe(0);
  });

  test("skip stops on an unread line and on a choice", () => {
    const first = advanceGesture(false, work, initialState(work), new Set());
    if (first.type !== "step") throw new Error("expected a step");
    const unread = skipRead(work, first.state, new Set());
    expect(unread.line?.text).toBe(first.state.line?.text);
    expect(unread.sceneId).toBe(first.state.sceneId);

    const played = playToChoice(work);
    expect(played.state.choices).not.toBeNull();
    const passed: string[] = [];
    const skipped = skipRead(work, initialState(work), played.seen, undefined, (beat) => {
      if (beat.line) passed.push(beat.line.text);
    });
    expect(passed).toEqual(played.beats.slice(1, -1).flatMap((beat) => (beat.line ? [beat.line.text] : [])));
    expect(skipped.choices?.map((option) => option.jump)).toEqual(
      played.state.choices?.map((option) => option.jump),
    );
    expect(skipped.ending).toBeNull();
  });

  test("auto-play stops on a choice", () => {
    const played = playToChoice(work);
    expect(autoStep(work, played.state, played.seen)).toBeNull();
    const first = advanceGesture(false, work, initialState(work), new Set());
    if (first.type !== "step") throw new Error("expected a step");
    const again = autoStep(work, first.state, first.seen);
    expect(again).not.toBeNull();
    expect(again?.state.choices).toBeNull();
  });

  test("backlog keeps seen lines in order", () => {
    let state = initialState(work);
    let seen = new Set<string>();
    let backlog = pushBacklog([], state);
    for (let i = 0; i < 2; i++) {
      const gesture = advanceGesture(false, work, state, seen);
      if (gesture.type !== "step") break;
      state = gesture.state;
      seen = gesture.seen;
      backlog = pushBacklog(backlog, state);
    }
    expect(backlog.map((entry) => entry.line.text)).toEqual([
      "走廊盡頭的燈滅了一盞，門還開著一條縫。",
      "鑰匙不在櫃上。",
    ]);
    expect(lineKey(state)).toBe(`${state.sceneId}:${state.index}`);
  });
});

describe("recall isolation", () => {
  const { work } = loadWork("mystery-fixture");

  test("exit restores position and does not unlock or mark reads", () => {
    let state = initialState(work);
    let seen = new Set<string>();
    for (let i = 0; i < 2; i++) {
      const gesture = advanceGesture(false, work, state, seen);
      if (gesture.type !== "step") throw new Error("expected a step");
      state = gesture.state;
      seen = gesture.seen;
    }
    const before = {
      sceneId: state.sceneId,
      index: state.index,
      vars: { ...state.vars },
      cg: state.cg,
      line: state.line?.text,
    };
    let progress = recordUnlocks(withSeen(emptyProgress(work.manifest.id), seen), state, false);
    const cgBefore = [...progress.cg];
    const seenBefore = [...progress.seen];
    const script = {
      id: "corridor-recall",
      title: "不該在未解鎖時出現的標題",
      start: "corridor",
      end: "done",
    };
    const started = enterRecall(state, [], script, recallStart(work, script));
    let recallState = started.state;
    let recallSeen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      if (recallState.choices) {
        const chosen = chooseStep(work, recallState, 0, script.end);
        if (!chosen) break;
        recallState = chosen;
      } else {
        const gesture = advanceGesture(false, work, recallState, recallSeen, script.end);
        if (gesture.type !== "step") break;
        recallState = gesture.state;
        recallSeen = gesture.seen;
      }
      const nextProgress = recordUnlocks(progress, recallState, true);
      expect(nextProgress).toBe(progress);
    }
    expect(recallState.sceneId).not.toBe("done");
    expect(recallState.ending).toBeNull();
    const restored = exitRecall(started.frame);
    expect(restored.state.sceneId).toBe(before.sceneId);
    expect(restored.state.index).toBe(before.index);
    expect(restored.state.vars).toEqual(before.vars);
    expect(restored.state.cg).toBe(before.cg);
    expect(restored.state.line?.text).toBe(before.line);
    expect(progress.cg).toEqual(cgBefore);
    expect(progress.seen).toEqual(seenBefore);
    expect(progress.endings).toEqual([]);
    const seenAfter = [...seen];
    expect(seenAfter).toEqual(seenBefore);
    const onlyInRecall = [...recallSeen].filter((key) => !seen.has(key));
    expect(onlyInRecall.length).toBeGreaterThan(0);
  });
});

describe("gallery redaction", () => {
  const { work, assets } = loadWork("xingkong");

  test("locked cards hide cg ids and ending names", () => {
    const view = presentGallery(work, assets, emptyProgress(work.manifest.id));
    const dumped = JSON.stringify(view);
    expect(view.cg.length).toBeGreaterThan(0);
    expect(view.endings.length).toBeGreaterThan(0);
    expect(view.cg.every((card) => !card.unlocked && card.assetId === null && card.label === "未解鎖")).toBe(true);
    expect(view.endings.every((card) => !card.unlocked && card.assetId === null && card.label === "未解鎖")).toBe(true);
    expect(view.music.every((card) => card.assetId === null)).toBe(true);
    for (const asset of assets) {
      if (asset.type === "cg" || asset.type === "bgm") expect(dumped.includes(asset.id)).toBe(false);
    }
    for (const card of view.endings) expect(dumped.includes("true")).toBe(false);
    const endingIds = new Set<string>();
    for (const scene of work.scenes) {
      for (const instruction of scene.instructions) {
        if (instruction.kind === "ending") endingIds.add(instruction.id);
      }
    }
    for (const id of endingIds) expect(dumped.includes(id)).toBe(false);
  });

  test("an unlocked cg is labeled and a locked one stays blank", () => {
    const progress = emptyProgress(work.manifest.id);
    const unlockedId = assets.find((asset) => asset.type === "cg")?.id;
    if (!unlockedId) throw new Error("missing cg");
    progress.cg = [unlockedId];
    const view = presentGallery(work, assets, progress);
    const dumpedLocked = JSON.stringify(view.cg.filter((card) => !card.unlocked));
    expect(view.cg.some((card) => card.unlocked && card.assetId === unlockedId)).toBe(true);
    expect(dumpedLocked.includes(unlockedId)).toBe(false);
    for (const scene of work.scenes) {
      for (const instruction of scene.instructions) {
        if (instruction.kind === "ending") expect(dumpedLocked.includes(instruction.id)).toBe(false);
      }
    }
  });
});
