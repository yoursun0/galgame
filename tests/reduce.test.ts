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
      { id: "admin", expr: "default", position: "far" },
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

describe("auto-expr dialogue", () => {
  test("dialogue auto-shows speaker at near when off-stage", () => {
    const work: Work = {
      manifest: {
        schemaVersion: 1,
        contentVersion: 1,
        id: "auto-expr",
        title: "auto-expr",
        language: "zh-Hant",
        start: "room",
        characters: [
          {
            id: "hero",
            name: "Hero",
            sprites: { "01-smile": "spr-hero-01", near: "spr-hero-near" },
          },
        ],
        variables: [],
        scenes: [],
      },
      scenes: [
        {
          id: "room",
          instructions: [
            {
              kind: "dialogue",
              speaker: "hero",
              expr: "01-smile",
              text: "你好。",
            },
          ],
        },
      ],
    };
    const state = reduce(work, initialState(work), { type: "advance" });
    expect(state.line).toEqual({
      kind: "dialogue",
      speaker: "hero",
      text: "你好。",
    });
    expect(state.actors).toEqual([
      { id: "hero", expr: "01-smile", position: "near" },
    ]);
  });

  test("dialogue updates expr but keeps far position", () => {
    const work: Work = {
      manifest: {
        schemaVersion: 1,
        contentVersion: 1,
        id: "auto-expr-far",
        title: "auto-expr-far",
        language: "zh-Hant",
        start: "room",
        characters: [
          {
            id: "hero",
            name: "Hero",
            sprites: { "02-sad": "spr-hero-02", far: "spr-hero-far" },
          },
        ],
        variables: [],
        scenes: [],
      },
      scenes: [
        {
          id: "room",
          instructions: [
            {
              kind: "actor",
              action: "show",
              id: "hero",
              position: "far",
              expr: "02-sad",
            },
            {
              kind: "dialogue",
              speaker: "hero",
              expr: "02-sad",
              text: "遠一點。",
            },
          ],
        },
      ],
    };
    const state = reduce(work, initialState(work), { type: "advance" });
    expect(state.actors).toEqual([
      { id: "hero", expr: "02-sad", position: "far" },
    ]);
  });

  // Puppy: #77 new auto-expr speakers take the free near/far slot; on-stage speakers keep position.
  function slotWork(
    id: string,
    instructions: Scene["instructions"],
  ): Work {
    return {
      manifest: {
        schemaVersion: 1,
        contentVersion: 1,
        id,
        title: id,
        language: "zh-Hant",
        start: "room",
        characters: [
          {
            id: "lingchen",
            name: "凌晨",
            sprites: { "01-shrug": "spr-lc-01", "02-blush": "spr-lc-02" },
          },
          {
            id: "zhijun",
            name: "芷君",
            sprites: { "01-laugh": "spr-zj-01" },
          },
        ],
        variables: [],
        scenes: [],
      },
      scenes: [{ id: "room", instructions }],
    };
  }

  test("new speaker auto-shows at far when another actor is already near", () => {
    const work = slotWork("slots-near-taken", [
      {
        kind: "actor",
        action: "show",
        id: "lingchen",
        position: "near",
        expr: "01-shrug",
      },
      {
        kind: "dialogue",
        speaker: "zhijun",
        expr: "01-laugh",
        text: "你又搞甚麼花樣了？",
      },
    ]);
    const state = reduce(work, initialState(work), { type: "advance" });
    expect(state.actors).toEqual([
      { id: "lingchen", expr: "01-shrug", position: "near" },
      { id: "zhijun", expr: "01-laugh", position: "far" },
    ]);
  });

  test("new speaker auto-shows at near when another actor is already far", () => {
    const work = slotWork("slots-far-taken", [
      {
        kind: "actor",
        action: "show",
        id: "lingchen",
        position: "far",
        expr: "01-shrug",
      },
      {
        kind: "dialogue",
        speaker: "zhijun",
        expr: "01-laugh",
        text: "你又搞甚麼花樣了？",
      },
    ]);
    const state = reduce(work, initialState(work), { type: "advance" });
    expect(state.actors).toEqual([
      { id: "lingchen", expr: "01-shrug", position: "far" },
      { id: "zhijun", expr: "01-laugh", position: "near" },
    ]);
  });

  test("existing speaker keeps position when dialogue updates expr", () => {
    const work = slotWork("slots-keep", [
      {
        kind: "actor",
        action: "show",
        id: "lingchen",
        position: "far",
        expr: "01-shrug",
      },
      {
        kind: "actor",
        action: "show",
        id: "zhijun",
        position: "near",
        expr: "01-laugh",
      },
      {
        kind: "dialogue",
        speaker: "lingchen",
        expr: "02-blush",
        text: "冇花樣。",
      },
    ]);
    const state = reduce(work, initialState(work), { type: "advance" });
    expect(state.actors).toEqual([
      { id: "lingchen", expr: "02-blush", position: "far" },
      { id: "zhijun", expr: "01-laugh", position: "near" },
    ]);
  });

  // Puppy: null position shares the near slot (stage.ts: position !== "far").
  test("new speaker auto-shows at far when another actor has a null position", () => {
    const work = slotWork("slots-null-near", [
      {
        kind: "actor",
        action: "show",
        id: "lingchen",
        expr: "01-shrug",
      },
      {
        kind: "dialogue",
        speaker: "zhijun",
        expr: "01-laugh",
        text: "你又搞甚麼花樣了？",
      },
    ]);
    const state = reduce(work, initialState(work), { type: "advance" });
    expect(state.actors).toEqual([
      { id: "lingchen", expr: "01-shrug", position: null },
      { id: "zhijun", expr: "01-laugh", position: "far" },
    ]);
  });

  test("voice-only speaker does not auto-show", () => {
    const work: Work = {
      manifest: {
        schemaVersion: 1,
        contentVersion: 1,
        id: "vo-only",
        title: "vo-only",
        language: "zh-Hant",
        start: "phone",
        characters: [{ id: "student", name: "學生", sprites: {} }],
        variables: [],
        scenes: [],
      },
      scenes: [
        {
          id: "phone",
          instructions: [
            { kind: "dialogue", speaker: "student", text: "喂？" },
          ],
        },
      ],
    };
    const state = reduce(work, initialState(work), { type: "advance" });
    expect(state.actors).toEqual([]);
    expect(state.line).toEqual({
      kind: "dialogue",
      speaker: "student",
      text: "喂？",
    });
  });
});
