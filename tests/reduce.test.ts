import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initialState, reduce } from "../src/reduce.ts";
import type { Scene, Work, WorkManifest } from "../src/types.ts";

const fixtureRoot = join(import.meta.dir, "../works/mystery-fixture");

function loadMystery(): Work {
  const manifest = JSON.parse(
    readFileSync(join(fixtureRoot, "work.json"), "utf8"),
  ) as WorkManifest;
  const scenes = manifest.scenes.map((rel) => {
    return JSON.parse(readFileSync(join(fixtureRoot, rel), "utf8")) as Scene;
  });
  return { manifest, scenes };
}

describe("mystery-fixture reduce", () => {
  const work = loadMystery();

  test("start is the first instruction, before any line", () => {
    const state = initialState(work);
    expect(state.sceneId).toBe("corridor");
    expect(state.index).toBe(0);
    expect(state.waiting).toBe(false);
    expect(state.background).toBeNull();
    expect(state.line).toBeNull();
    expect(state.vars.locked).toBe(false);
  });

  test("advance applies the background and stops on narration", () => {
    const state = reduce(work, initialState(work), { type: "advance" });
    expect(state.background).toBe("bg-soc");
    expect(state.line).toEqual({
      kind: "narration",
      text: "走廊盡頭的燈滅了一盞，門還開著一條縫。",
    });
    expect(state.waiting).toBe(true);
    expect(state.choices).toBeNull();
    expect(state.actors).toEqual([
      { id: "admin", expr: null, position: "near" },
    ]);
    expect(state.audio.bgm).toBe("bgm-starfield");
  });

  test("advance moves from narration to dialogue", () => {
    let state = reduce(work, initialState(work), { type: "advance" });
    state = reduce(work, state, { type: "advance" });
    expect(state.line).toEqual({
      kind: "dialogue",
      speaker: "admin",
      text: "鑰匙不在櫃上。",
    });
  });

  test("advance reaches a choice with three options", () => {
    let state = initialState(work);
    state = reduce(work, state, { type: "advance" });
    state = reduce(work, state, { type: "advance" });
    state = reduce(work, state, { type: "advance" });
    expect(state.choices).toEqual([
      { text: "回去把門鎖上", jump: "lock" },
      { text: "在抽屜裡再找一次", jump: "drawer" },
      { text: "先去問樓下", jump: "ask" },
    ]);
    expect(state.line).toBeNull();
    expect(state.ending).toBeNull();
  });

  test("choose lock sets locked, shows the far actor, and can reach the ending", () => {
    let state = initialState(work);
    state = reduce(work, state, { type: "advance" });
    state = reduce(work, state, { type: "advance" });
    state = reduce(work, state, { type: "advance" });
    state = reduce(work, state, { type: "choose", index: 0 });
    expect(state.vars.locked).toBe(true);
    expect(state.sceneId).toBe("lock");
    expect(state.waiting).toBe(true);
    expect(state.ending).toBeNull();
    expect(state.actors).toEqual([
      { id: "admin", expr: null, position: "far" },
    ]);
    expect(state.audio.bgm).toBe("bgm-village");
    expect(state.line?.kind).toBe("narration");
    for (let i = 0; i < 12 && !state.ending; i++) {
      state = reduce(work, state, { type: "advance" });
    }
    expect(state.sceneId).toBe("done");
    expect(state.ending).toEqual({ id: "stop" });
    expect(state.cg).toBe("ending-stop");
  });

  test("choose drawer does not set locked and still ends", () => {
    let state = initialState(work);
    state = reduce(work, state, { type: "advance" });
    state = reduce(work, state, { type: "advance" });
    state = reduce(work, state, { type: "advance" });
    state = reduce(work, state, { type: "choose", index: 1 });
    expect(state.vars.locked).toBe(false);
    expect(state.sceneId).toBe("drawer");
    expect(state.ending).toBeNull();
    expect(state.line?.kind).toBe("narration");
    for (let i = 0; i < 12 && !state.ending; i++) {
      state = reduce(work, state, { type: "advance" });
    }
    expect(state.ending).toEqual({ id: "stop" });
  });

  test("choose ask reaches ending without locking", () => {
    let state = initialState(work);
    state = reduce(work, state, { type: "advance" });
    state = reduce(work, state, { type: "advance" });
    state = reduce(work, state, { type: "advance" });
    state = reduce(work, state, { type: "choose", index: 2 });
    expect(state.vars.locked).toBe(false);
    expect(state.sceneId).toBe("ask");
    for (let i = 0; i < 12 && !state.ending; i++) {
      state = reduce(work, state, { type: "advance" });
    }
    expect(state.ending).toEqual({ id: "stop" });
  });
});

test("a jump with a false condition is skipped", () => {
  const work: Work = {
    manifest: {
      schemaVersion: 1,
      contentVersion: 1,
      id: "cond",
      title: "cond",
      language: "zh-Hant",
      start: "hall",
      characters: [],
      variables: [{ name: "flag", type: "boolean", initial: false }],
      scenes: [],
    },
    scenes: [
      {
        id: "hall",
        instructions: [
          {
            kind: "jump",
            to: "secret",
            when: { cmp: "eq", var: "flag", value: true },
          },
          { kind: "ending", id: "plain" },
        ],
      },
      {
        id: "secret",
        instructions: [{ kind: "ending", id: "secret" }],
      },
    ],
  };
  const state = reduce(work, initialState(work), { type: "advance" });
  expect(state.sceneId).toBe("hall");
  expect(state.ending).toEqual({ id: "plain" });
});
