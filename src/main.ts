import { initialState, reduce } from "./reduce.ts";
import { AudioMixer, resolveAudio } from "./audio.ts";
import { mountStage } from "./stage.ts";
import { loadTheme } from "./theme.ts";
import type { AssetRecord, PlayState, Scene, Work, WorkManifest } from "./types.ts";

/**
 * Default playable work is xingkong (v0.3 trial).
 * `?work=mystery-fixture` loads the other bundled work. Any id under works/ is accepted.
 */
declare global {
  interface ImportMeta {
    glob: (
      pattern: string,
      options?: { eager?: boolean; query?: string; import?: string },
    ) => Record<string, unknown>;
  }
}

const workModules = import.meta.glob("../works/*/work.json", { eager: true });
const assetModules = import.meta.glob("../works/*/asset-manifest.json", { eager: true });
const storyModules = import.meta.glob("../works/*/story/*.json", { eager: true });
const assetUrlModules = import.meta.glob("../works/*/assets/**/*", {
  eager: true,
  query: "?url",
  import: "default",
});

function unwrap<T>(mod: unknown): T {
  if (mod && typeof mod === "object" && "default" in mod) {
    return (mod as { default: T }).default;
  }
  return mod as T;
}

function asUrl(value: unknown): string | null {
  if (typeof value === "string") return value;
  return unwrap<string>(value) || null;
}

function endsWithWorkPath(key: string, id: string, rel: string): boolean {
  const normalized = key.replaceAll("\\", "/");
  return normalized.endsWith(`/works/${id}/${rel}`);
}

function moduleFor(table: Record<string, unknown>, id: string, rel: string): unknown {
  const key = Object.keys(table).find((item) => endsWithWorkPath(item, id, rel));
  if (!key) return undefined;
  return table[key];
}

function bundledWorkIds(): string[] {
  const ids = new Set<string>();
  for (const key of Object.keys(workModules)) {
    const match = key.replaceAll("\\", "/").match(/\/works\/([^/]+)\/work\.json$/);
    if (match) ids.add(match[1]);
  }
  return [...ids];
}

function loadBundled(id: string): { work: Work; assets: AssetRecord[]; urls: Map<string, string> } {
  const manifestMod = moduleFor(workModules, id, "work.json");
  const assetMod = moduleFor(assetModules, id, "asset-manifest.json");
  if (!manifestMod || !assetMod) {
    throw new Error(
      `unknown work ${id}. bundled: ${bundledWorkIds().join(", ") || "(none)"}`,
    );
  }
  const manifest = unwrap<WorkManifest>(manifestMod);
  const assets = unwrap<AssetRecord[]>(assetMod);
  const scenes = manifest.scenes.map((rel) => {
    const mod = moduleFor(storyModules, id, rel);
    if (!mod) throw new Error(`missing bundled scene ${id} ${rel}`);
    return unwrap<Scene>(mod);
  });
  const urls = new Map<string, string>();
  for (const asset of assets) {
    const mod = moduleFor(assetUrlModules, id, asset.path);
    const url = mod === undefined ? null : asUrl(mod);
    if (!url) throw new Error(`missing bundled asset ${id} ${asset.path}`);
    urls.set(asset.id, url);
  }
  return { work: { manifest, scenes }, assets, urls };
}

const requested = new URLSearchParams(window.location.search).get("work");
const workId = requested && requested.length > 0 ? requested : "xingkong";
const loaded = loadBundled(workId);
const work = loaded.work;
const assets = loaded.assets;
const urls = loaded.urls;

const theme = loadTheme();
const app = document.querySelector("#app");
if (!app) throw new Error("missing #app");

let state: PlayState = initialState(work);
const audio = new AudioMixer();

const stage = mountStage(app as HTMLElement, theme, work, assets, urls, {
  onAdvance: () => {
    if (stage.typing()) {
      stage.finishTyping();
      return;
    }
    if (state.choices || state.ending) return;
    state = reduce(work, state, { type: "advance" });
    paint();
  },
  onChoose: (index) => {
    state = reduce(work, state, { type: "choose", index });
    paint();
  },
  onDismissCg: () => {
    /* stage hides the overlay; the line underneath stays */
  },
});

function paint(): void {
  stage.render(state);
  if (audio.unlocked) {
    audio.sync(resolveAudio(state.audio, (id) => urls.get(id) ?? null));
  }
}

function unlockFromGesture(): void {
  if (audio.unlocked) return;
  audio.unlock();
  audio.sync(resolveAudio(state.audio, (id) => urls.get(id) ?? null));
}

window.addEventListener("pointerdown", unlockFromGesture);
window.addEventListener("keydown", unlockFromGesture);

paint();
