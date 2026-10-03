import { initialState, reduce } from "./reduce.ts";
import { AudioMixer, resolveAudio } from "./audio.ts";
import { mountStage } from "./stage.ts";
import { loadTheme } from "./theme.ts";
import type { AssetRecord, PlayState, Scene, Work, WorkManifest } from "./types.ts";

import manifest from "../works/mystery-fixture/work.json";
import assetManifest from "../works/mystery-fixture/asset-manifest.json";
import ask from "../works/mystery-fixture/story/ask.json";
import corridor from "../works/mystery-fixture/story/corridor.json";
import done from "../works/mystery-fixture/story/done.json";
import drawer from "../works/mystery-fixture/story/drawer.json";
import lock from "../works/mystery-fixture/story/lock.json";

const scenes = [corridor, lock, drawer, ask, done] as Scene[];
const work: Work = {
  manifest: manifest as WorkManifest,
  scenes,
};
const assets = assetManifest as AssetRecord[];

const bundled: Record<string, string> = {
  "assets/bg-soc.jpg": new URL("../works/mystery-fixture/assets/bg-soc.jpg", import.meta.url).href,
  "assets/actor-admin-near.png": new URL(
    "../works/mystery-fixture/assets/actor-admin-near.png",
    import.meta.url,
  ).href,
  "assets/actor-admin-far.png": new URL(
    "../works/mystery-fixture/assets/actor-admin-far.png",
    import.meta.url,
  ).href,
  "assets/ending-stop.jpg": new URL(
    "../works/mystery-fixture/assets/ending-stop.jpg",
    import.meta.url,
  ).href,
  "assets/bgm-starfield.mp3": new URL(
    "../works/mystery-fixture/assets/bgm-starfield.mp3",
    import.meta.url,
  ).href,
  "assets/bgm-village.mp3": new URL(
    "../works/mystery-fixture/assets/bgm-village.mp3",
    import.meta.url,
  ).href,
};

const urls = new Map<string, string>();
for (const asset of assets) {
  const url = bundled[asset.path];
  if (!url) throw new Error(`missing bundled asset ${asset.path}`);
  urls.set(asset.id, url);
}

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
