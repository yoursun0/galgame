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

const qiCool = "裝酷，把團刊塞過去。";
const qiHonest = "先說明，是我們遺下一半。";
const wallSlow = "在關口坐下，然後一級一級跟在她後面。";
const wallRun = "追上去。總不能看起來跑輸給綺珊。";
const templeLie = "胡扯下去。指腹為婚，緣訂七世。";
const templeName = "問她的名字，也報上自己的。";
const templeHold = "先別接話。看素婷還在不在下面。";
const branchSu = "回頭。我希望站在那裡的是素婷。";
const branchZhi = "先別作聲。如果她是叫我看星星的，我就抬頭。";
const branchQi = "走回去，把激光筆奪回來。這場笑話還沒講完。";
const suConfess = "在他開口之前去找素婷，把那句話說完。";
const suLeave = "關掉電筒。讓那兩個影子靠在一起。";
const suRip = "走過去把他們拉開，問這算甚麼兄弟。";
const zhiAsk = "認真問：可不可以，當我的女朋友。";
const zhiShield = "笑著借她的名義，好讓自己可以安心離開。";
const zhiBridge = "要來游牧的聯絡，勸她回到那段沒有結果的愛情。";
const qiTell = "告訴她：我約你，不是為了素婷，也不是為了家綸。";
const qiSetup = "答應家綸。讓他去說。你去忙你的。";
const qiCoolOff = "把杯子喝完，打個哈哈就走。";

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

  test("twelve endings follow the prototype flags", () => {
    const routes: [string[], string, Record<string, boolean>][] = [
      [[qiHonest, wallSlow, templeName, branchSu, suConfess], "suting-true", { qishanHonest: true, sutingWalk: true, zhijunName: true }],
      [[qiCool, wallRun, templeLie, branchSu, suConfess], "suting-good", { qishanHonest: false, sutingWalk: false, zhijunName: false }],
      [[qiHonest, wallSlow, templeName, branchSu, suLeave], "suting-bad-leave", { qishanHonest: true, sutingWalk: true, zhijunName: true }],
      [[qiHonest, wallSlow, templeName, branchSu, suRip], "suting-bad-rip", { qishanHonest: true, sutingWalk: true, zhijunName: true }],
      [[qiHonest, wallSlow, templeName, branchZhi, zhiAsk], "zhijun-true", { qishanHonest: true, sutingWalk: true, zhijunName: true }],
      [[qiHonest, wallSlow, templeHold, branchZhi, zhiAsk], "zhijun-good", { qishanHonest: true, sutingWalk: true, zhijunName: false }],
      [[qiHonest, wallSlow, templeName, branchZhi, zhiShield], "zhijun-bad-shield", { qishanHonest: true, sutingWalk: true, zhijunName: true }],
      [[qiHonest, wallSlow, templeName, branchZhi, zhiBridge], "zhijun-bad-bridge", { qishanHonest: true, sutingWalk: true, zhijunName: true }],
      [[qiHonest, wallSlow, templeName, branchQi, qiTell], "qishan-true", { qishanHonest: true, sutingWalk: true, zhijunName: true }],
      [[qiCool, wallSlow, templeName, branchQi, qiTell], "qishan-good", { qishanHonest: false, sutingWalk: true, zhijunName: true }],
      [[qiHonest, wallSlow, templeName, branchQi, qiSetup], "qishan-bad-setup", { qishanHonest: true, sutingWalk: true, zhijunName: true }],
      [[qiHonest, wallSlow, templeName, branchQi, qiCoolOff], "qishan-bad-cool", { qishanHonest: true, sutingWalk: true, zhijunName: true }],
    ];
    for (const [picks, endingId, flags] of routes) {
      const state = play(work, picks);
      expect(state.ending?.id, endingId).toBe(endingId);
      expect(state.cg, endingId).toBe(`ending-${endingId}`);
      expect(state.vars, endingId).toMatchObject(flags);
    }
  });
});
