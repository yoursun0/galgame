import type { AssetRecord, Work } from "./types.ts";
import type { WorkProgress } from "./flow.ts";
import type { RecallScript } from "./types.ts";

export const LOCKED_LABEL = "未解鎖";

export type GalleryCard = {
  unlocked: boolean;
  /** Null when locked so a full name cannot be rendered. */
  label: string;
  /** Null when locked so an image URL cannot be resolved. CG／音樂 asset id；結局卡為 null。 */
  assetId: string | null;
  /** Puppy #72: ending id when this is an unlocked ending card. */
  endingId?: string | null;
  /** Puppy #72: scene that contains the ending instruction (replay jump). */
  sceneId?: string | null;
};

export type RecallCard = {
  script: RecallScript | null;
  unlocked: boolean;
  label: string;
};

export type GalleryView = {
  cg: GalleryCard[];
  music: GalleryCard[];
  endings: GalleryCard[];
  recalls: RecallCard[];
};

export type PresentGalleryOptions = {
  /** Puppy #86: DEBUG MODE ON → unlock all CG + BGM (not endings). */
  debugUnlock?: boolean;
};

/** Locked cards expose neither the asset id nor the ending / recall title. */
export function presentGallery(
  work: Work,
  assets: AssetRecord[],
  progress: WorkProgress,
  options?: PresentGalleryOptions,
): GalleryView {
  const debugUnlock = options?.debugUnlock === true;
  const cgUnlocked = new Set(progress.cg);
  const musicUnlocked = new Set(progress.music);
  const endingUnlocked = new Set(progress.endings);
  const titles = work.manifest.endingTitles ?? {};

  const cg = assets
    .filter((asset) => asset.type === "cg")
    .map((asset) => card(debugUnlock || cgUnlocked.has(asset.id), asset.id));

  const music = assets
    .filter((asset) => asset.type === "bgm")
    .map((asset) => card(debugUnlock || musicUnlocked.has(asset.id), asset.id));

  const endings = listEndings(work).map(({ id, sceneId }) => {
    const unlocked = endingUnlocked.has(id);
    if (!unlocked) {
      return {
        unlocked: false,
        label: LOCKED_LABEL,
        assetId: null,
        endingId: null,
        sceneId: null,
      };
    }
    // Puppy #72: readable title; fall back to raw id if map missing (九把刀可後補).
    const label = titles[id]?.trim() || id;
    return {
      unlocked: true,
      label,
      assetId: null,
      endingId: id,
      sceneId,
    };
  });

  const recalls = (work.manifest.recalls ?? []).map((script) => {
    const unlocked = recallUnlocked(script, cgUnlocked, endingUnlocked);
    return {
      script: unlocked ? script : null,
      unlocked,
      label: unlocked ? script.title : LOCKED_LABEL,
    };
  });

  return { cg, music, endings, recalls };
}

export function recallUnlocked(
  script: RecallScript,
  cg: ReadonlySet<string>,
  endings: ReadonlySet<string>,
): boolean {
  if (script.unlockCg && !cg.has(script.unlockCg)) return false;
  if (script.unlockEnding && !endings.has(script.unlockEnding)) return false;
  return true;
}

/** Puppy #72: scene id that holds this ending instruction, or null. */
export function sceneForEnding(work: Work, endingId: string): string | null {
  for (const scene of work.scenes) {
    for (const instruction of scene.instructions) {
      if (instruction.kind === "ending" && instruction.id === endingId) {
        return scene.id;
      }
    }
  }
  return null;
}

function card(unlocked: boolean, secret: string): GalleryCard {
  if (!unlocked) return { unlocked: false, label: LOCKED_LABEL, assetId: null };
  return { unlocked: true, label: secret, assetId: secret };
}

function listEndings(work: Work): { id: string; sceneId: string }[] {
  const out: { id: string; sceneId: string }[] = [];
  const seen = new Set<string>();
  for (const scene of work.scenes) {
    for (const instruction of scene.instructions) {
      if (instruction.kind !== "ending") continue;
      if (seen.has(instruction.id)) continue;
      seen.add(instruction.id);
      out.push({ id: instruction.id, sceneId: scene.id });
    }
  }
  return out;
}
