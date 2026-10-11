import type { AssetRecord, PlayState, Work } from "./types.ts";
import type { Theme } from "./theme.ts";
import { slotsForActors, type ActorSlot } from "./stage.ts";

/** Puppy #67: compact stage preview for save slots (16:9 JPEG data URL). */
export const THUMB_WIDTH = 320;
export const THUMB_HEIGHT = 180;
const JPEG_QUALITY = 0.72;

type ThumbCache = { key: string; dataUrl: string | null };

let cache: ThumbCache | null = null;

/**
 * Compose a small JPEG of the current stage (bg → actors → full-page CG).
 * Returns null when canvas/Image is unavailable or every layer fails to load.
 * Does not use DOM screenshots so an open save panel cannot blank the thumb.
 */
export async function captureStageThumbnail(
  state: PlayState,
  work: Work,
  urls: Map<string, string>,
  _assets: AssetRecord[],
  theme: Theme,
  options?: { width?: number; height?: number; useCache?: boolean },
): Promise<string | null> {
  const width = options?.width ?? THUMB_WIDTH;
  const height = options?.height ?? THUMB_HEIGHT;
  const useCache = options?.useCache !== false;
  const key = visualKey(state);
  if (useCache && cache && cache.key === key) return cache.dataUrl;

  const dataUrl = await renderThumb(state, work, urls, theme, width, height);
  if (useCache) cache = { key, dataUrl };
  return dataUrl;
}

/** Clear the visual-key cache (tests / hard reset). */
export function clearThumbnailCache(): void {
  cache = null;
}

export function visualKey(state: PlayState): string {
  return JSON.stringify({
    bg: state.background,
    cg: state.cg,
    ending: state.ending?.id ?? null,
    actors: state.actors.map((actor) => [actor.id, actor.expr, actor.position]),
  });
}

export function isThumbnailDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 32 &&
    value.length < 1_500_000 &&
    /^data:image\/(jpeg|jpg|webp|png);base64,/i.test(value)
  );
}

async function renderThumb(
  state: PlayState,
  work: Work,
  urls: Map<string, string>,
  theme: Theme,
  width: number,
  height: number,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  if (!canvas.getContext) return null;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = theme.pageBackground || "#070b14";
  ctx.fillRect(0, 0, width, height);

  const bgUrl = urlOf(urls, state.background);
  if (bgUrl) {
    const img = await loadImage(bgUrl);
    if (img) drawCover(ctx, img, width, height);
  }

  if (!state.cg && !state.ending) {
    const near = state.actors.filter((actor) => actor.position !== "far");
    const far = state.actors.filter((actor) => actor.position === "far");
    // Puppy #93: same dual boxes as stage.place so save thumbs match the live layout.
    const slots = slotsForActors(theme.actors, near.length, far.length);
    await drawActors(ctx, far, work, urls, slots.far, false, width, height);
    await drawActors(ctx, near, work, urls, slots.near, true, width, height);
  }

  const coverId = state.ending ? null : state.cg;
  if (coverId) {
    const cgUrl = urlOf(urls, coverId);
    if (cgUrl) {
      const img = await loadImage(cgUrl);
      if (img) drawCover(ctx, img, width, height);
    }
  }

  try {
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    return null;
  }
}

async function drawActors(
  ctx: CanvasRenderingContext2D,
  group: PlayState["actors"],
  work: Work,
  urls: Map<string, string>,
  box: ActorSlot,
  fromLeft: boolean,
  width: number,
  height: number,
): Promise<void> {
  for (let index = 0; index < group.length; index++) {
    const actor = group[index]!;
    const sprite = spriteId(work, actor.id, actor.position, actor.expr);
    const src = urlOf(urls, sprite);
    if (!src) continue;
    const img = await loadImage(src);
    if (!img) continue;
    const span = group.length <= 1 ? 0 : index * 16;
    drawFitted(ctx, img, box, fromLeft, span, width, height);
  }
}

/**
 * Puppy #93: dual boxes use object-fit:cover and object-position:center bottom,
 * matching `.actors-dual .actor`. Single-slot boxes keep the old aspect draw.
 */
function drawFitted(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number; naturalWidth?: number; naturalHeight?: number },
  box: ActorSlot,
  fromLeft: boolean,
  span: number,
  stageW: number,
  stageH: number,
): void {
  const naturalW = ("naturalWidth" in img && img.naturalWidth) || img.width || 1;
  const naturalH = ("naturalHeight" in img && img.naturalHeight) || img.height || 1;
  const boxH = (box.heightPercent / 100) * stageH;
  const bottom = (box.bottomPercent / 100) * stageH;
  const edge = ((box.edgePercent + span) / 100) * stageW;
  const y = stageH - bottom - boxH;

  if (box.maxWidthPercent == null) {
    const w = boxH * (naturalW / naturalH);
    const x = fromLeft ? edge : stageW - w - edge;
    ctx.drawImage(img, x, y, w, boxH);
    return;
  }

  const boxW = (box.maxWidthPercent / 100) * stageW;
  const scale = Math.max(boxW / naturalW, boxH / naturalH);
  const renderedW = naturalW * scale;
  const renderedH = naturalH * scale;
  // center horizontally, pin to the bottom of the box (CSS object-position)
  let sx = (renderedW - boxW) / 2 / scale;
  let sy = (renderedH - boxH) / scale;
  let sw = boxW / scale;
  let sh = boxH / scale;
  sx = Math.min(Math.max(0, sx), Math.max(0, naturalW - sw));
  sy = Math.min(Math.max(0, sy), Math.max(0, naturalH - sh));
  sw = Math.min(sw, naturalW - sx);
  sh = Math.min(sh, naturalH - sy);
  const x = fromLeft ? edge : stageW - boxW - edge;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, boxW, boxH);
}

function spriteId(
  work: Work,
  id: string,
  position: string | null,
  expr: string | null,
): string | null {
  const character = work.manifest.characters.find((item) => item.id === id);
  const sprites = character?.sprites;
  if (expr && sprites?.[expr]) return sprites[expr];
  if (position && sprites?.[position]) return sprites[position];
  return null;
}

function urlOf(urls: Map<string, string>, id: string | null | undefined): string {
  return id ? urls.get(id) ?? "" : "";
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number; naturalWidth?: number; naturalHeight?: number },
  width: number,
  height: number,
): void {
  const iw = ("naturalWidth" in img && img.naturalWidth) || img.width || 1;
  const ih = ("naturalHeight" in img && img.naturalHeight) || img.height || 1;
  const scale = Math.max(width / iw, height / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    try {
      img.src = src;
    } catch {
      resolve(null);
    }
  });
}
