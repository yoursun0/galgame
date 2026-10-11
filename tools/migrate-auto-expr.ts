/**
 * Puppy: fold prior actor show/update expr into dialogue; drop redundant near shows.
 * Voice-only speakers (empty sprites) keep dialogues without expr.
 *
 * Usage: bun tools/migrate-auto-expr.ts works/xingkong [works/mystery-fixture ...]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Instruction, Scene, WorkManifest } from "../src/types.ts";

const POSITION_ONLY = new Set(["near", "far"]);

function isVoiceOnly(sprites: Record<string, string> | undefined): boolean {
  return !sprites || Object.keys(sprites).length === 0;
}

function migrateScene(
  scene: Scene,
  spritesById: Map<string, Record<string, string>>,
): { scene: Scene; folded: number; removed: number } {
  const instructions = scene.instructions;
  const lastExpr = new Map<string, string>();
  let folded = 0;

  const withExpr: Instruction[] = instructions.map((ins) => {
    if (ins.kind === "actor") {
      if (ins.action === "hide") {
        lastExpr.delete(ins.id);
      } else if (typeof ins.expr === "string" && ins.expr.length > 0) {
        lastExpr.set(ins.id, ins.expr);
      }
      return ins;
    }
    if (ins.kind !== "dialogue") return ins;
    const sprites = spritesById.get(ins.speaker);
    if (isVoiceOnly(sprites)) {
      // strip any accidental expr
      if (ins.expr !== undefined) {
        const { expr: _drop, ...rest } = ins;
        return rest as Instruction;
      }
      return ins;
    }
    if (typeof ins.expr === "string" && ins.expr.length > 0) return ins;
    const prior = lastExpr.get(ins.speaker);
    // Prefer last actor expr; else sprites key "default" when present (fixture standees).
    const resolved =
      prior ?? (sprites && Object.prototype.hasOwnProperty.call(sprites, "default")
        ? "default"
        : undefined);
    if (!resolved) return ins;
    folded += 1;
    return { ...ins, expr: resolved };
  });

  // Remove adjacent actor show/update that only stages near (or omits position)
  // immediately before same-speaker dialogue — dialogue auto-shows.
  const next: Instruction[] = [];
  let removed = 0;
  for (let i = 0; i < withExpr.length; i++) {
    const ins = withExpr[i]!;
    const following = withExpr[i + 1];
    if (
      ins.kind === "actor" &&
      (ins.action === "show" || ins.action === "update") &&
      following?.kind === "dialogue" &&
      following.speaker === ins.id &&
      typeof following.expr === "string" &&
      (ins.position === undefined || ins.position === "near") &&
      (ins.expr === undefined || ins.expr === following.expr)
    ) {
      removed += 1;
      continue;
    }
    next.push(ins);
  }

  return { scene: { ...scene, instructions: next }, folded, removed };
}

function migrateWork(root: string): void {
  const manifest = JSON.parse(
    readFileSync(join(root, "work.json"), "utf8"),
  ) as WorkManifest;
  const spritesById = new Map<string, Record<string, string>>();
  for (const character of manifest.characters) {
    spritesById.set(
      character.id,
      character.sprites && typeof character.sprites === "object"
        ? character.sprites
        : {},
    );
  }

  let folded = 0;
  let removed = 0;
  for (const rel of manifest.scenes) {
    const path = join(root, rel);
    const scene = JSON.parse(readFileSync(path, "utf8")) as Scene;
    const result = migrateScene(scene, spritesById);
    folded += result.folded;
    removed += result.removed;
    writeFileSync(path, `${JSON.stringify(result.scene, null, 2)}\n`, "utf8");
  }
  console.log(`${root}: folded expr into ${folded} dialogues; removed ${removed} redundant actor ops`);
}

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error("Usage: bun tools/migrate-auto-expr.ts <workDir>...");
  process.exit(1);
}
for (const root of roots) migrateWork(root);
