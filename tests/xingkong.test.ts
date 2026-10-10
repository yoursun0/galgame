import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkWork } from "../src/check.ts";
import { initialState, reduce } from "../src/reduce.ts";
import type { Instruction, PlayState, Scene, Work, WorkManifest } from "../src/types.ts";
// prototype/script.js is plain JavaScript; the parity test reads it as data.
// @ts-expect-error no declaration file for the prototype script
import { scenes as prototypeScenes } from "../prototype/script.js";

const root = join(import.meta.dir, "..");
const workRoot = join(root, "works/xingkong");

const speakerId: Record<string, string> = {
  凌晨: "lingchen",
  素婷: "suting",
  綺珊: "qishan",
  芷君: "zhijun",
  家綸: "jialun",
  會長: "huizhang",
};

type ProtoScene = {
  text?: string;
  title?: string;
  speaker?: string;
  card?: boolean;
  cg?: string;
  figure?: string | null;
  figureFar?: string;
  choices?: { label: string; next: string | { flag: string; yes: string; no: string } }[];
  ending?: { id: string; title: string; why: string; cg: string; tier: string };
};

function loadXingkong(): Work {
  const manifest = JSON.parse(readFileSync(join(workRoot, "work.json"), "utf8")) as WorkManifest;
  const scenes = manifest.scenes.map((rel) => {
    return JSON.parse(readFileSync(join(workRoot, rel), "utf8")) as Scene;
  });
  return { manifest, scenes };
}

function textsOf(instructions: Instruction[]): string[] {
  return instructions.flatMap((instruction) => {
    if (instruction.kind === "narration" || instruction.kind === "dialogue") return [instruction.text];
    return [];
  });
}

function play(work: Work, picks: string[]): PlayState {
  let state = initialState(work);
  const pending = [...picks];
  for (let guard = 0; guard < 800 && !state.ending; guard++) {
    if (state.choices) {
      const want = pending.shift();
      const index = state.choices.findIndex((option) => option.text === want);
      if (index < 0) {
        throw new Error(
          `at ${state.sceneId} no choice ${want}; have ${state.choices.map((option) => option.text).join(" | ")}`,
        );
      }
      state = reduce(work, state, { type: "choose", index });
      continue;
    }
    state = reduce(work, state, { type: "advance" });
  }
  if (pending.length) throw new Error(`unused picks ${pending.join(" / ")}`);
  return state;
}

const qiCool = "唏，同學，團刊。";
const qiHonest = "先說清楚——我們遺了一半。";
const wallSlow = "在關口坐下，再跟在她後面。";
const wallRun = "追上去。總不能輸給綺珊。";
const templeLie = "胡扯下去——緣訂七世。";
const templeName = "問她的名字，也報上自己的。";
const templeHold = "先不接話。看素婷還在不在下面。";
const starLeave = "去 set 望遠鏡。";
const starStay = "留下，把話講完。";
/** Scenes rewritten for quality playtest (#8 / #21 VN prose); no longer byte-match v0.3 prototype. */
const playtestRewritten = new Set([
  "open1",
  "open2",
  "open3",
  "st1",
  "st2",
  "st3",
  "st4",
  "st5",
  "qi_choice",
  "qi_cool1",
  "qi_cool2",
  "qi_cool3",
  "qi_cool4",
  "qi_honest1",
  "qi_honest2",
  "qi_honest3",
  "qi_honest4",
  "zj1",
  "zj2",
  "zj3",
  "zj4",
  "bus1",
  "wall1",
  "wall2",
  "wall3",
  "wall_choice",
  "wall_slow1",
  "wall_slow2",
  "wall_slow3",
  "wall_slow4",
  "wall_run1",
  "wall_run2",
  "wall_mister",
  "temple1",
  "temple2",
  "temple_choice",
  "temple_hold1",
  "temple_lie1",
  "temple_lie2",
  "temple_name1",
  "temple_name2",
  "star1",
  "star2",
  "star3",
  "star4",
  "star5",
  "star_choice",
  "star_leave",
  "star_stay",
  "midcard",
]);

describe("xingkong work", () => {
  const work = loadXingkong();
  const proto = prototypeScenes as Record<string, ProtoScene>;

  test("check passes", () => {
    const result = checkWork(workRoot);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("copies prototype lines, choices, and ending copy", () => {
    for (const [id, scene] of Object.entries(proto)) {
      if (playtestRewritten.has(id)) continue;
      const file = work.scenes.find((item) => item.id === id);
      expect(file, id).toBeDefined();
      if (!file) continue;
      const texts = textsOf(file.instructions);
      if (scene.text) expect(texts, id).toContain(scene.text);
      if (scene.card) {
        expect(texts, id).toContain("背後有人叫我");
        expect(texts.join("\n"), id).not.toMatch(/TRUE|GOOD/);
      }
      if (scene.speaker && scene.text) {
        const line = file.instructions.find(
          (instruction) => instruction.kind === "dialogue" && instruction.text === scene.text,
        );
        expect(line && line.kind === "dialogue" ? line.speaker : "", id).toBe(speakerId[scene.speaker]);
      }
      if (scene.choices) {
        const choice = file.instructions.find((instruction) => instruction.kind === "choice");
        expect(choice && choice.kind === "choice" ? choice.options.map((option) => option.text) : [], id).toEqual(
          scene.choices.map((option) => option.label),
        );
      }
      if (scene.ending) {
        expect(texts, id).toContain(scene.ending.title);
        expect(texts, id).toContain(scene.ending.why);
        const ending = file.instructions.find((instruction) => instruction.kind === "ending");
        expect(ending && ending.kind === "ending" ? ending.id : "", id).toBe(scene.ending.id);
        const shown = file.instructions.filter(
          (instruction) => instruction.kind === "cg" && instruction.action === "show",
        );
        const last = shown[shown.length - 1];
        expect(last && last.kind === "cg" ? last.asset : "", id).toContain(scene.ending.id);
      }
    }
  });

  test("懸空寺 keeps 綺珊 near and 芷君 far", () => {
    let state = initialState(work);
    for (let guard = 0; guard < 400 && state.sceneId !== "temple1"; guard++) {
      if (state.choices) state = reduce(work, state, { type: "choose", index: 0 });
      else state = reduce(work, state, { type: "advance" });
    }
    expect(state.sceneId).toBe("temple1");
    expect(state.actors).toEqual([
      { id: "qishan", expr: "01-grin", position: "near" },
      { id: "zhijun", expr: "01-laugh", position: "far" },
    ]);
    expect(state.cg).toBe("cg-qishan-temple");
    expect(state.background).toBe("bg-xuankong");
  });

  test("quality playtest stops at midcard with route flags", () => {
    const routes: [string[], Record<string, boolean | number>][] = [
      [
        [qiHonest, wallSlow, templeName, starStay],
        { qishanHonest: true, sutingWalk: true, zhijunName: true, ch4_faced: true, courage: 1, candor: 0 },
      ],
      [
        [qiCool, wallRun, templeLie, starLeave],
        { qishanHonest: false, sutingWalk: false, zhijunName: false, ch4_faced: false, courage: 0, candor: 0 },
      ],
      [
        [qiHonest, wallSlow, templeHold, starLeave],
        { qishanHonest: true, sutingWalk: true, zhijunName: false, ch4_faced: false, courage: 0, candor: 0 },
      ],
    ];
    for (const [picks, flags] of routes) {
      const state = play(work, picks);
      expect(state.ending?.id, picks.join("|")).toBe("playtest-midcard");
      expect(state.sceneId, picks.join("|")).toBe("midcard");
      expect(state.vars, picks.join("|")).toMatchObject(flags);
    }
  });

  test("playtest path never enters branch", () => {
    const state = play(work, [qiHonest, wallSlow, templeName, starStay]);
    expect(state.sceneId).toBe("midcard");
    expect(state.ending?.id).toBe("playtest-midcard");
    let probe = initialState(work);
    const seen = new Set<string>();
    for (let guard = 0; guard < 800 && !probe.ending; guard++) {
      seen.add(probe.sceneId);
      if (probe.choices) {
        const text = probe.choices[0]?.text;
        const pick =
          text === qiCool || text === qiHonest
            ? qiHonest
            : text === wallSlow || text === wallRun
              ? wallSlow
              : text === templeLie || text === templeName || text === templeHold
                ? templeName
                : text === starLeave || text === starStay
                  ? starStay
                  : text;
        const index = probe.choices.findIndex((option) => option.text === pick);
        probe = reduce(work, probe, { type: "choose", index: Math.max(0, index) });
      } else {
        probe = reduce(work, probe, { type: "advance" });
      }
    }
    expect(seen.has("branch")).toBe(false);
    expect(seen.has("star_choice")).toBe(true);
    expect(seen.has("midcard")).toBe(true);
  });

  test("P0 playtest CGs wire into wall scenes", () => {
    let state = initialState(work);
    for (let guard = 0; guard < 400 && state.sceneId !== "wall_choice"; guard++) {
      if (state.choices) state = reduce(work, state, { type: "choose", index: 0 });
      else state = reduce(work, state, { type: "advance" });
    }
    expect(state.sceneId).toBe("wall_choice");
    expect(state.cg).toBe("cg-wall-wind");

    for (let guard = 0; guard < 80 && state.sceneId !== "wall_mister"; guard++) {
      if (state.choices) state = reduce(work, state, { type: "choose", index: 0 });
      else state = reduce(work, state, { type: "advance" });
    }
    expect(state.sceneId).toBe("wall_mister");
    expect(state.cg).toBe("cg-keyi-keshi");
  });

  test("prototype ending scene files still declare ending ids", () => {
    const endingScenes = [
      "s_true3",
      "s_good2",
      "s_bad_leave",
      "s_bad_rip",
      "z_true2",
      "z_good1",
      "z_bad_shield",
      "z_bad_bridge",
      "q_true2",
      "q_good1",
      "q_bad_setup",
      "q_bad_cool",
    ];
    for (const id of endingScenes) {
      const file = work.scenes.find((item) => item.id === id);
      expect(file, id).toBeDefined();
      const ending = file?.instructions.find((instruction) => instruction.kind === "ending");
      expect(ending && ending.kind === "ending", id).toBeTruthy();
    }
  });
});
