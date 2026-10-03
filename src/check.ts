import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { inspectAssetFile } from "./links.ts";
import type {
  AssetRecord,
  CheckIssue,
  Condition,
  Instruction,
  Scene,
  VarType,
  VarValue,
  WorkManifest,
} from "./types.ts";

const KINDS = new Set([
  "dialogue",
  "narration",
  "background",
  "actor",
  "cg",
  "audio",
  "wait",
  "choice",
  "set",
  "jump",
  "ending",
]);

const CMP = new Set(["eq", "neq", "lt", "lte", "gt", "gte"]);
const HTML_TAG = /<[a-zA-Z/!]/;

export function checkWork(rootDir: string): {
  ok: boolean;
  errors: CheckIssue[];
  warnings: CheckIssue[];
} {
  const errors: CheckIssue[] = [];
  const warnings: CheckIssue[] = [];
  const root = rootDir;

  const manifest = readJsonFile<WorkManifest>(
    root,
    "work.json",
    errors,
    undefined,
  );
  const assets = readJsonFile<AssetRecord[]>(
    root,
    "asset-manifest.json",
    errors,
    undefined,
  );
  if (!manifest) {
    return { ok: false, errors, warnings };
  }

  const workId = typeof manifest.id === "string" ? manifest.id : undefined;
  const declaredVars = new Map<string, VarType>();
  if (Array.isArray(manifest.variables)) {
    for (const variable of manifest.variables) {
      if (!variable || typeof variable.name !== "string") continue;
      if (
        variable.type === "boolean" ||
        variable.type === "number" ||
        variable.type === "string"
      ) {
        declaredVars.set(variable.name, variable.type);
        if (!valueMatches(variable.type, variable.initial)) {
          errors.push({
            level: "error",
            work: workId,
            file: "work.json",
            message: `variable ${variable.name} initial does not match type ${variable.type}`,
          });
        }
      }
    }
  }

  const characters = new Set<string>();
  if (Array.isArray(manifest.characters)) {
    for (const character of manifest.characters) {
      if (character && typeof character.id === "string") {
        characters.add(character.id);
      }
    }
  }

  const assetById = new Map<string, AssetRecord>();
  if (Array.isArray(assets)) {
    for (const asset of assets) {
      if (!asset || typeof asset.id !== "string") continue;
      assetById.set(asset.id, asset);
      if (typeof asset.path !== "string" || asset.path.length === 0) {
        errors.push({
          level: "error",
          work: workId,
          file: "asset-manifest.json",
          message: `asset ${asset.id} is missing a path`,
        });
        continue;
      }
      if (!fileInside(root, asset.path)) {
        errors.push({
          level: "error",
          work: workId,
          file: asset.path,
          message: `missing file ${asset.path}`,
        });
        continue;
      }
      const inspected = inspectAssetFile(join(root, asset.path), projectRoot(root));
      if (inspected.kind === "broken") {
        errors.push({
          level: "error",
          work: workId,
          file: asset.path,
          message: `broken link ${asset.path}`,
        });
      }
    }
  }

  if (Array.isArray(manifest.characters)) {
    for (const character of manifest.characters) {
      const sprites = character && typeof character === "object" ? character.sprites : undefined;
      if (!sprites || typeof sprites !== "object") continue;
      for (const assetId of Object.values(sprites)) {
        if (typeof assetId !== "string") continue;
        const asset = assetById.get(assetId);
        if (!asset || asset.approved !== true) {
          errors.push({
            level: "error",
            work: workId,
            file: "work.json",
            message: `unapproved asset ${assetId}`,
          });
        }
      }
    }
  }

  const scenes: Scene[] = [];
  const sceneFiles = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  for (const scenePath of sceneFiles) {
    if (typeof scenePath !== "string") continue;
    const scene = readJsonFile<Scene>(root, scenePath, errors, workId);
    if (scene) scenes.push(scene);
  }

  const sceneIds = new Set(scenes.map((scene) => scene.id).filter(Boolean));
  if (typeof manifest.start !== "string" || !sceneIds.has(manifest.start)) {
    errors.push({
      level: "error",
      work: workId,
      file: "work.json",
      scene: typeof manifest.start === "string" ? manifest.start : undefined,
      message: `start scene ${String(manifest.start)} does not exist`,
    });
  }

  for (const scene of scenes) {
    const instructions = Array.isArray(scene.instructions) ? scene.instructions : [];
    instructions.forEach((instruction, index) => {
      checkInstruction(
        instruction,
        index,
        scene,
        workId,
        declaredVars,
        characters,
        assetById,
        sceneIds,
        errors,
        warnings,
      );
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

function checkInstruction(
  instruction: Instruction,
  index: number,
  scene: Scene,
  workId: string | undefined,
  declaredVars: Map<string, VarType>,
  characters: Set<string>,
  assetById: Map<string, AssetRecord>,
  sceneIds: Set<string>,
  errors: CheckIssue[],
  _warnings: CheckIssue[],
): void {
  const base = (): CheckIssue => ({
    level: "error",
    work: workId,
    scene: scene.id,
    instruction: index,
    message: "",
  });

  if (!instruction || typeof instruction !== "object" || !("kind" in instruction)) {
    errors.push({ ...base(), message: "unknown instruction kind" });
    return;
  }
  if (!KINDS.has(instruction.kind)) {
    errors.push({
      ...base(),
      message: `unknown instruction kind ${String(instruction.kind)}`,
    });
    return;
  }

  switch (instruction.kind) {
    case "narration":
      checkText(instruction.text, base(), errors);
      break;
    case "dialogue":
      checkText(instruction.text, base(), errors);
      if (!characters.has(instruction.speaker)) {
        errors.push({
          ...base(),
          message: `speaker ${String(instruction.speaker)} is not a declared character`,
        });
      }
      break;
    case "background":
      requireApproved(instruction.asset, base(), assetById, errors);
      break;
    case "actor":
      break;
    case "cg":
      if (instruction.asset !== undefined) {
        requireApproved(instruction.asset, base(), assetById, errors);
      } else if (instruction.action === "show") {
        errors.push({ ...base(), message: "cg show is missing an asset" });
      }
      break;
    case "audio":
      if (instruction.asset !== undefined) {
        requireApproved(instruction.asset, base(), assetById, errors);
      } else if (instruction.action === "play") {
        errors.push({ ...base(), message: "audio play is missing an asset" });
      }
      break;
    case "wait":
      break;
    case "choice": {
      const options = Array.isArray(instruction.options) ? instruction.options : [];
      if (options.length < 1 || options.length > 3) {
        errors.push({
          ...base(),
          message: `choice has ${options.length} options; expected 1 to 3`,
        });
      }
      for (const option of options) {
        if (!option) continue;
        checkText(option.text, base(), errors);
        if (!sceneIds.has(option.jump)) {
          errors.push({
            ...base(),
            message: `bad jump to unknown scene ${String(option.jump)}`,
          });
        }
      }
      break;
    }
    case "set": {
      const declared = declaredVars.get(instruction.var);
      if (!declared) {
        errors.push({
          ...base(),
          message: `undeclared variable ${instruction.var}`,
        });
        break;
      }
      if (!valueMatches(declared, instruction.value)) {
        errors.push({
          ...base(),
          message: `set ${instruction.var} value type ${typeof instruction.value} does not match ${declared}`,
        });
      }
      break;
    }
    case "jump":
      if (!sceneIds.has(instruction.to)) {
        errors.push({
          ...base(),
          message: `bad jump to unknown scene ${instruction.to}`,
        });
      }
      if (instruction.when) {
        checkCondition(instruction.when, base(), declaredVars, errors);
      }
      break;
    case "ending":
      break;
    default:
      break;
  }
}

function checkCondition(
  condition: Condition,
  base: CheckIssue,
  declaredVars: Map<string, VarType>,
  errors: CheckIssue[],
): void {
  if (!condition || typeof condition !== "object") {
    errors.push({ ...base, message: "invalid condition" });
    return;
  }
  if ("cmp" in condition) {
    if (!CMP.has(condition.cmp)) {
      errors.push({ ...base, message: `unknown comparison ${String(condition.cmp)}` });
    }
    if (!declaredVars.has(condition.var)) {
      errors.push({
        ...base,
        message: `undeclared variable ${condition.var}`,
      });
    }
    return;
  }
  if ("all" in condition && Array.isArray(condition.all)) {
    for (const item of condition.all) checkCondition(item, base, declaredVars, errors);
    return;
  }
  if ("any" in condition && Array.isArray(condition.any)) {
    for (const item of condition.any) checkCondition(item, base, declaredVars, errors);
    return;
  }
  if ("not" in condition) {
    checkCondition(condition.not, base, declaredVars, errors);
    return;
  }
  errors.push({ ...base, message: "invalid condition" });
}

function checkText(text: string, base: CheckIssue, errors: CheckIssue[]): void {
  if (typeof text !== "string") return;
  if (HTML_TAG.test(text)) {
    errors.push({ ...base, message: "text contains an HTML tag" });
  }
}

function requireApproved(
  assetId: string,
  base: CheckIssue,
  assetById: Map<string, AssetRecord>,
  errors: CheckIssue[],
): void {
  const asset = assetById.get(assetId);
  if (!asset || asset.approved !== true) {
    errors.push({
      ...base,
      message: `unapproved asset ${String(assetId)}`,
    });
  }
}

function valueMatches(type: VarType, value: VarValue): boolean {
  return typeof value === type;
}

function readJsonFile<T>(
  root: string,
  relPath: string,
  errors: CheckIssue[],
  workId: string | undefined,
): T | null {
  if (!fileInside(root, relPath)) {
    errors.push({
      level: "error",
      work: workId,
      file: relPath,
      message: `missing file ${relPath}`,
    });
    return null;
  }
  try {
    const raw = readFileSync(join(root, relPath), "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    errors.push({
      level: "error",
      work: workId,
      file: relPath,
      message: `invalid JSON in ${relPath}: ${error instanceof Error ? error.message : String(error)}`,
    });
    return null;
  }
}

/** Work directories live under works/<id>. Link targets live next to that, in the repo. */
function projectRoot(workRoot: string): string {
  let dir = resolve(workRoot);
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "works"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(workRoot);
}

function fileInside(root: string, relPath: string): boolean {
  if (relPath.startsWith("/") || relPath.includes("\0")) return false;
  const rootAbs = normalize(root);
  const abs = normalize(join(root, relPath));
  const rel = relative(rootAbs, abs);
  if (rel.startsWith("..") || rel.split(sep).includes("..")) return false;
  return existsSync(abs);
}
