import type { AssetRecord, Work } from "./types.ts";
import type { WorkProgress } from "./flow.ts";
import type { RecallScript } from "./types.ts";

export const LOCKED_LABEL = "未解鎖";

export type GalleryCard = {
  unlocked: boolean;
  /** Null when locked so a full name cannot be rendered. */
  label: string;
  /** Null when locked so an image URL cannot be resolved. */
  assetId: string | null;
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

/** Locked cards expose neither the asset id nor the ending / recall title. */
export function presentGallery(
  work: Work,
  assets: AssetRecord[],
  progress: WorkProgress,
): GalleryView {
  const cgUnlocked = new Set(progress.cg);
  const musicUnlocked = new Set(progress.music);
  const endingUnlocked = new Set(progress.endings);

  const cg = assets
    .filter((asset) => asset.type === "cg")
    .map((asset) => card(cgUnlocked.has(asset.id), asset.id));

  const music = assets
    .filter((asset) => asset.type === "bgm")
    .map((asset) => card(musicUnlocked.has(asset.id), asset.id));

  const endings = endingIds(work).map((id) => card(endingUnlocked.has(id), id));

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

function card(unlocked: boolean, secret: string): GalleryCard {
  if (!unlocked) return { unlocked: false, label: LOCKED_LABEL, assetId: null };
  return { unlocked: true, label: secret, assetId: secret };
}

function endingIds(work: Work): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const scene of work.scenes) {
    for (const instruction of scene.instructions) {
      if (instruction.kind !== "ending") continue;
      if (seen.has(instruction.id)) continue;
      seen.add(instruction.id);
      ids.push(instruction.id);
    }
  }
  return ids;
}
