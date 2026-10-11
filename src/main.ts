import { resolveAudio, AudioMixer } from "./audio.ts";
import {
  advanceGesture,
  autoStep,
  chooseStep,
  emptyProgress,
  enterRecall,
  exitRecall,
  pushBacklog,
  recallStart,
  recordUnlocks,
  skipRead,
  withSeen,
  type HistoryEntry,
  type RecallFrame,
  type WorkProgress,
} from "./flow.ts";
import { presentGallery, sceneForEnding, type GalleryCard, type RecallCard } from "./gallery.ts";
import {
  buildDebugTree,
  flattenDebugTree,
  jumpToScene,
  type DebugTree,
} from "./debug-tree.ts";
import { initialState } from "./reduce.ts";
import {
  acceptLoad,
  AUTO_SLOT,
  capture,
  defaultSettings,
  latestContinue,
  manualSlot,
  openSaveDb,
  QUICK_SLOT,
  readProgress,
  readSettings,
  readSlot,
  writeProgress,
  writeSettings,
  writeSlot,
  type Settings,
  type SlotId,
} from "./save.ts";
import { mountStage } from "./stage.ts";
import { loadTheme } from "./theme.ts";
import { captureStageThumbnail, isThumbnailDataUrl } from "./thumbnail.ts";
import { isWorkOfflineReady, registerServiceWorker } from "./offline.ts";
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
    throw new Error(`unknown work ${id}. bundled: ${bundledWorkIds().join(", ") || "(none)"}`);
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

const shell = document.createElement("div");
shell.className = "shell title-mode";
const stageHost = document.createElement("div");
stageHost.className = "stage-host";
const hud = document.createElement("div");
hud.className = "hud";
const overlay = document.createElement("div");
overlay.className = "overlay";
shell.append(stageHost, hud, overlay);
app.replaceChildren(shell);

const style = document.createElement("style");
style.textContent = shellCss();
document.head.append(style);

let settings: Settings = defaultSettings(theme.charsPerSecond);
if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
  settings = { ...settings, animation: "reduced" };
}
let progress: WorkProgress = emptyProgress(work.manifest.id);
let seen = new Set<string>();
let recallSeen = new Set<string>();
let state: PlayState = initialState(work);
let backlog: HistoryEntry[] = [];
let recall: RecallFrame | null = null;
let recallFrom: "title" | "play" = "play";
let screen: "title" | "play" = "title";
let panel: "none" | "save" | "load" | "settings" | "gallery" | "backlog" | "recall" = "none";
let autoOn = false;
let autoTimer = 0;
let dbPromise: Promise<IDBDatabase> | null = null;
let persistChain: Promise<void> = Promise.resolve();

const audio = new AudioMixer();

const debugHud = document.createElement("div");
debugHud.className = "debug-hud";
debugHud.hidden = true;
shell.append(debugHud);

const stage = mountStage(stageHost, theme, work, assets, urls, {
  onAdvance: () => requestAdvance(),
  onChoose: (index) => requestChoose(index),
  onTypingComplete: () => scheduleAuto(),
  // Puppy #63
  onReturnToTitle: () => showTitle(),
});

function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openSaveDb();
  return dbPromise;
}

function activeSeen(): Set<string> {
  return recall ? recallSeen : seen;
}

function applySeen(next: Set<string>): void {
  if (recall) recallSeen = next;
  else seen = next;
}

function clearAutoTimer(): void {
  if (autoTimer) window.clearTimeout(autoTimer);
  autoTimer = 0;
}

function scheduleAuto(): void {
  clearAutoTimer();
  if (!autoOn || screen !== "play" || panel !== "none") return;
  if (stage.typing()) return;
  const end = recall?.script.end;
  if (state.choices || state.ending || (end && state.sceneId === end)) {
    autoOn = false;
    syncAutoLabel();
    return;
  }
  autoTimer = window.setTimeout(() => {
    const step = autoStep(work, state, activeSeen(), end);
    if (!step) {
      autoOn = false;
      syncAutoLabel();
      return;
    }
    applySeen(step.seen);
    state = step.state;
    commitStep();
  }, settings.autoDelayMs);
}

function syncAutoLabel(): void {
  const button = hud.querySelector<HTMLButtonElement>("[data-act=auto]");
  if (button) button.textContent = autoOn ? "自動中" : "自動";
}

function applySettings(): void {
  const instant = settings.animation === "reduced";
  stage.setInstant(instant);
  stage.setTextSpeed(instant ? 10_000 : settings.textSpeed);
  audio.setReducedMotion(instant);
  audio.setVolume("bgm", settings.volumes.bgm);
  audio.setVolume("se", settings.volumes.se);
  audio.setVolume("ambience", settings.volumes.ambience);
}

function paint(): void {
  stage.render(state);
  syncDebugHud();
  if (audio.unlocked && screen === "play") {
    audio.sync(resolveAudio(state.audio, (id) => urls.get(id) ?? null));
  }
}

/** Puppy #62: top-right scene id; pointer-events none so it never blocks clicks. */
function syncDebugHud(): void {
  const on = settings.debugMode === true && screen === "play";
  debugHud.hidden = !on;
  if (!on) return;
  debugHud.textContent = `scene: ${state.sceneId}  #${state.index}`;
}

function silence(): void {
  if (!audio.unlocked) return;
  audio.sync(
    resolveAudio({ bgm: null, se: null, ambience: null }, () => null),
  );
}

/** Title / load / settings / gallery share one track; AudioMixer skips same id. */
function playTitleBgm(): void {
  if (!audio.unlocked || screen !== "title") return;
  const id = work.manifest.titleBgm;
  if (!id) return;
  const url = urls.get(id);
  if (!url) return;
  audio.sync(
    resolveAudio({ bgm: id, se: null, ambience: null }, (assetId) =>
      assetId === id ? url : null,
    ),
  );
}

async function persistProgress(): Promise<void> {
  if (recall) return;
  progress = recordUnlocks(withSeen(progress, seen), state, false);
  await writeProgress(await db(), progress);
}

async function persistAuto(): Promise<void> {
  if (recall || screen !== "play") return;
  // Puppy #67: reuse cached thumb when the stage frame is unchanged.
  const thumb = await captureStageThumbnail(state, work, urls, assets, theme, { useCache: true });
  await writeSlot(
    await db(),
    work.manifest.id,
    AUTO_SLOT,
    capture(work, state, Date.now(), thumb),
  );
}

function commitStep(): void {
  backlog = pushBacklog(backlog, state);
  if (!recall) {
    persistChain = persistChain
      .catch(() => undefined)
      .then(async () => {
        await persistProgress();
        await persistAuto();
      });
  }
  paint();
  scheduleAuto();
}

function requestAdvance(): void {
  if (screen !== "play" || panel !== "none") return;
  const gesture = advanceGesture(
    stage.typing(),
    work,
    state,
    activeSeen(),
    recall?.script.end,
  );
  if (gesture.type === "reveal") {
    stage.finishTyping();
    return;
  }
  if (gesture.type === "blocked") return;
  applySeen(gesture.seen);
  state = gesture.state;
  commitStep();
}

function requestChoose(index: number): void {
  if (screen !== "play" || panel !== "none") return;
  const next = chooseStep(work, state, index, recall?.script.end);
  if (!next) return;
  state = next;
  commitStep();
}

function requestSkip(): void {
  if (screen !== "play" || panel !== "none") return;
  const passed: PlayState[] = [];
  const next = skipRead(work, state, activeSeen(), recall?.script.end, (beat) => {
    passed.push(beat);
  });
  const moved =
    next.sceneId !== state.sceneId ||
    next.index !== state.index ||
    next.line?.text !== state.line?.text ||
    Boolean(next.choices) !== Boolean(state.choices);
  if (!moved) return;
  stage.cancel();
  for (const beat of passed) backlog = pushBacklog(backlog, beat);
  state = next;
  commitStep();
}

function beginPlay(next: PlayState): void {
  clearAutoTimer();
  autoOn = false;
  syncAutoLabel();
  stage.cancel();
  recall = null;
  recallSeen = new Set();
  state = next;
  backlog = pushBacklog([], state);
  screen = "play";
  panel = "none";
  shell.classList.remove("title-mode");
  renderHud();
  renderOverlay();
  commitStep();
}

function showTitle(): void {
  clearAutoTimer();
  autoOn = false;
  stage.cancel();
  if (recall) {
    const restored = exitRecall(recall);
    recall = null;
    recallSeen = new Set();
    state = restored.state;
    backlog = restored.backlog;
  }
  screen = "title";
  panel = "none";
  shell.classList.add("title-mode");
  silence();
  renderHud();
  overlay.replaceChildren();
  void renderTitle();
}

function openPanel(next: typeof panel): void {
  clearAutoTimer();
  panel = next;
  renderOverlay();
}

function closePanel(): void {
  if (screen === "title") {
    panel = "none";
    void renderTitle();
    return;
  }
  panel = "none";
  renderOverlay();
  scheduleAuto();
}

async function saveManual(slot: SlotId): Promise<void> {
  if (recall) return;
  // Puppy #67: capture stage thumb before write (panel may cover the live DOM).
  const thumb = await captureStageThumbnail(state, work, urls, assets, theme);
  const wrote = await writeSlot(
    await db(),
    work.manifest.id,
    slot,
    capture(work, state, Date.now(), thumb),
  );
  if (!wrote.ok) {
    setOverlayNote("存檔被拒絕，原槽未改。");
    return;
  }
  // Puppy #69: HUD 快存寫入 QUICK_SLOT 後唔開存檔 modal。
  if (slot === QUICK_SLOT) {
    setOverlayNote("快速存檔成功");
    return;
  }
  openPanel("save");
}

async function loadSlot(slot: SlotId): Promise<void> {
  const raw = await readSlot(await db(), work.manifest.id, slot);
  const accepted = acceptLoad(raw, work);
  if (!accepted.ok) {
    const note =
      accepted.reason === "version"
        ? "版本不符，無法讀取。存檔未改寫，也不會猜位置。"
        : accepted.reason === "corrupt"
          ? "存檔損壞，無法讀取。好的存檔未覆寫。"
          : accepted.reason === "empty"
            ? "這個槽是空的。"
            : "這不是這部作品的存檔。";
    if (panel === "none") openPanel("load");
    setOverlayNote(note);
    return;
  }
  beginPlay(accepted.state);
}

function startRecall(card: RecallCard): void {
  if (!card.unlocked || !card.script || recall) return;
  clearAutoTimer();
  autoOn = false;
  stage.cancel();
  recallFrom = screen;
  const started = enterRecall(state, backlog, card.script, recallStart(work, card.script));
  recall = started.frame;
  state = started.state;
  backlog = started.backlog;
  recallSeen = new Set();
  screen = "play";
  panel = "none";
  shell.classList.remove("title-mode");
  renderHud();
  renderOverlay();
  commitStep();
}

function endRecall(): void {
  if (!recall) return;
  clearAutoTimer();
  autoOn = false;
  stage.cancel();
  const restored = exitRecall(recall);
  recall = null;
  recallSeen = new Set();
  state = restored.state;
  backlog = restored.backlog;
  const backToTitle = recallFrom === "title";
  recallFrom = "play";
  if (backToTitle) {
    showTitle();
    return;
  }
  screen = "play";
  panel = "none";
  renderHud();
  renderOverlay();
  paint();
}

function renderHud(): void {
  hud.replaceChildren();
  if (screen !== "play") return;
  const specs: { act: string; label: string; disabled?: boolean; on: () => void }[] = [
    { act: "auto", label: autoOn ? "自動中" : "自動", on: () => toggleAuto() },
    { act: "skip", label: "快進", on: () => requestSkip() },
    { act: "log", label: "紀錄", on: () => openPanel("backlog") },
    {
      act: "save",
      label: "存檔",
      disabled: Boolean(recall),
      on: () => openPanel("save"),
    },
    { act: "load", label: "讀檔", on: () => openPanel("load") },
    { act: "qsave", label: "快存", disabled: Boolean(recall), on: () => void saveManual(QUICK_SLOT) },
    { act: "qload", label: "快讀", on: () => void loadSlot(QUICK_SLOT) },
    {
      act: "recall",
      // Puppy #74: DEBUG ON → branch tree; OFF → normal recall list.
      label: recall ? "結束回想" : settings.debugMode ? "DEBUG 樹" : "回想",
      on: () => (recall ? endRecall() : openPanel("recall")),
    },
    { act: "settings", label: "設定", on: () => openPanel("settings") },
    { act: "title", label: "標題", on: () => showTitle() },
  ];
  for (const spec of specs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hud-btn";
    button.dataset.act = spec.act;
    button.textContent = spec.label;
    button.disabled = Boolean(spec.disabled);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      spec.on();
    });
    hud.append(button);
  }
}

function toggleAuto(): void {
  autoOn = !autoOn;
  syncAutoLabel();
  if (autoOn) scheduleAuto();
  else clearAutoTimer();
}

function renderOverlay(): void {
  if (screen === "title" && panel === "none") return;
  overlay.replaceChildren();
  if (panel === "none") return;
  const panelEl = document.createElement("section");
  panelEl.className = "panel";
  const head = document.createElement("div");
  head.className = "panel-head";
  const title = document.createElement("h2");
  title.textContent = panelTitle(panel);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "text-btn";
  close.textContent = "關閉";
  close.addEventListener("click", () => closePanel());
  head.append(title, close);
  const body = document.createElement("div");
  body.className = "panel-body";
  const note = document.createElement("p");
  note.className = "note";
  note.dataset.note = "1";
  panelEl.append(head, note, body);
  overlay.append(panelEl);
  if (panel === "backlog") fillBacklog(body);
  if (panel === "save") void fillSlots(body, "save");
  if (panel === "load") void fillSlots(body, "load");
  if (panel === "settings") fillSettings(body);
  if (panel === "gallery") fillGallery(body);
  if (panel === "recall") fillRecall(body);
}

function panelTitle(kind: typeof panel): string {
  switch (kind) {
    case "backlog":
      return "紀錄";
    case "save":
      return "存檔";
    case "load":
      return "讀檔";
    case "settings":
      return "設定";
    case "gallery":
      return "鑑賞";
    case "recall":
      // Puppy #74
      return settings.debugMode ? "DEBUG 分支樹" : "回想";
    default:
      return "";
  }
}

function setOverlayNote(text: string): void {
  const note = overlay.querySelector<HTMLElement>("[data-note]");
  if (note) {
    note.textContent = text;
    return;
  }
  // Puppy #69: no panel open (e.g. HUD 快存) — transient toast on shell.
  showFlashNote(text);
}

let flashNoteTimer = 0;
function showFlashNote(text: string): void {
  let toast = shell.querySelector<HTMLElement>("[data-flash-note]");
  if (!toast) {
    toast = document.createElement("p");
    toast.className = "flash-note";
    toast.dataset.flashNote = "1";
    shell.append(toast);
  }
  toast.textContent = text;
  toast.hidden = false;
  if (flashNoteTimer) window.clearTimeout(flashNoteTimer);
  flashNoteTimer = window.setTimeout(() => {
    toast.hidden = true;
    toast.textContent = "";
    flashNoteTimer = 0;
  }, 2200);
}

function fillBacklog(body: HTMLElement): void {
  if (backlog.length === 0) {
    body.textContent = "還沒有讀過的句子。";
    return;
  }
  for (const entry of backlog) {
    const row = document.createElement("p");
    row.className = "log-line";
    const who = document.createElement("span");
    who.className = "log-who";
    if (entry.line.kind === "narration") who.textContent = "";
    else {
      const speaker = entry.line.speaker ?? "";
      const named = work.manifest.characters.find((item) => item.id === speaker);
      who.textContent = named?.name ?? speaker;
    }
    const text = document.createElement("span");
    text.textContent = entry.line.text;
    row.append(who, text);
    body.append(row);
  }
}

async function fillSlots(body: HTMLElement, mode: "save" | "load"): Promise<void> {
  // Puppy #67: load keeps AUTO/QUICK on their own first row so manual 1–12 stay 6+6.
  const database = await db();
  const wrap = document.createElement("div");
  wrap.className = "slot-panel";

  if (mode === "load") {
    const special = document.createElement("div");
    special.className = "slot-special";
    special.append(
      await makeSlotButton(database, AUTO_SLOT, mode),
      await makeSlotButton(database, QUICK_SLOT, mode),
    );
    wrap.append(special);
  }

  const grid = document.createElement("div");
  grid.className = "slot-grid";
  for (let index = 0; index < 12; index++) {
    grid.append(await makeSlotButton(database, manualSlot(index), mode));
  }
  wrap.append(grid);
  body.replaceChildren(wrap);
}

async function makeSlotButton(
  database: IDBDatabase,
  slot: SlotId,
  mode: "save" | "load",
): Promise<HTMLButtonElement> {
  const raw = await readSlot(database, work.manifest.id, slot);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "slot";
  button.append(slotThumbEl(raw), slotMetaEl(slot, raw));
  button.addEventListener("click", () => {
    if (mode === "save") void saveManual(slot);
    else void loadSlot(slot);
  });
  return button;
}

function slotThumbEl(raw: unknown): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "slot-thumb";
  const accepted = acceptLoad(raw, work);
  const dataUrl =
    accepted.ok && isThumbnailDataUrl(accepted.record.thumbnail)
      ? accepted.record.thumbnail
      : null;
  if (dataUrl) {
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.src = dataUrl;
    img.addEventListener("error", () => {
      img.remove();
      wrap.append(slotThumbFallback(accepted.ok ? "無圖" : "空"));
    });
    wrap.append(img);
    return wrap;
  }
  wrap.append(slotThumbFallback(accepted.ok ? "無圖" : "空"));
  return wrap;
}

function slotThumbFallback(label: string): HTMLElement {
  const mark = document.createElement("span");
  mark.className = "slot-thumb-fallback";
  mark.textContent = label;
  return mark;
}

function slotMetaEl(slot: SlotId, raw: unknown): HTMLElement {
  const meta = document.createElement("div");
  meta.className = "slot-meta";
  const name = document.createElement("span");
  name.className = "slot-name";
  name.textContent = slotName(slot);
  const detail = document.createElement("span");
  detail.className = "slot-detail";
  detail.textContent = slotDetail(raw);
  meta.append(name, detail);
  return meta;
}

function slotName(slot: SlotId): string {
  if (slot === AUTO_SLOT) return "自動";
  if (slot === QUICK_SLOT) return "快速";
  const index = Number(slot.slice("manual-".length)) + 1;
  return `槽 ${index}`;
}

function slotDetail(raw: unknown): string {
  const accepted = acceptLoad(raw, work);
  if (!accepted.ok) {
    if (accepted.reason === "empty") return "空";
    if (accepted.reason === "version") return "版本不符";
    if (accepted.reason === "corrupt") return "損壞";
    return "其他作品";
  }
  const when = new Date(accepted.record.timestamp).toLocaleString("zh-Hant-HK", {
    timeZone: "Asia/Hong_Kong",
    hour12: false,
  });
  const line = accepted.state.line?.text ?? accepted.state.sceneId;
  const preview = line.length > 28 ? `${line.slice(0, 28)}…` : line;
  return `${when}\n${preview}`;
}

function fillSettings(body: HTMLElement): void {
  const form = document.createElement("div");
  form.className = "settings";
  form.append(
    slider("文字速度", settings.textSpeed, 8, 80, 1, (value) => {
      settings = { ...settings, textSpeed: value };
      void storeSettings();
    }),
    slider("自動停留（毫秒）", settings.autoDelayMs, 400, 5000, 100, (value) => {
      settings = { ...settings, autoDelayMs: value };
      void storeSettings();
    }),
    slider("音樂", settings.volumes.bgm, 0, 1, 0.05, (value) => {
      settings = { ...settings, volumes: { ...settings.volumes, bgm: roundVol(value) } };
      void storeSettings();
    }),
    slider("音效", settings.volumes.se, 0, 1, 0.05, (value) => {
      settings = { ...settings, volumes: { ...settings.volumes, se: roundVol(value) } };
      void storeSettings();
    }),
    slider("環境", settings.volumes.ambience, 0, 1, 0.05, (value) => {
      settings = {
        ...settings,
        volumes: { ...settings.volumes, ambience: roundVol(value) },
      };
      void storeSettings();
    }),
  );
  const anim = document.createElement("label");
  anim.className = "set-row";
  const animName = document.createElement("span");
  animName.textContent = "動畫";
  const select = document.createElement("select");
  for (const option of [
    { value: "full", label: "完整" },
    { value: "reduced", label: "減少" },
  ]) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    if (settings.animation === option.value) node.selected = true;
    select.append(node);
  }
  select.addEventListener("change", () => {
    const animation = select.value === "reduced" ? "reduced" : "full";
    settings = { ...settings, animation };
    void storeSettings();
  });
  anim.append(animName, select);
  form.append(anim);

  // Puppy #62
  const debugRow = document.createElement("label");
  debugRow.className = "set-row";
  const debugName = document.createElement("span");
  debugName.textContent = "DEBUG MODE";
  const debugSelect = document.createElement("select");
  for (const option of [
    { value: "off", label: "OFF" },
    { value: "on", label: "ON" },
  ]) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    if ((settings.debugMode ? "on" : "off") === option.value) node.selected = true;
    debugSelect.append(node);
  }
  debugSelect.addEventListener("change", () => {
    settings = { ...settings, debugMode: debugSelect.value === "on" };
    void storeSettings();
    syncDebugHud();
    // Puppy #74: HUD「回想」／「DEBUG 樹」label follows debugMode.
    renderHud();
  });
  debugRow.append(debugName, debugSelect);
  form.append(debugRow);

  body.append(form);
}

function roundVol(value: number): number {
  return Math.round(value * 100) / 100;
}

async function storeSettings(): Promise<void> {
  applySettings();
  const wrote = await writeSettings(await db(), settings);
  if (!wrote.ok) setOverlayNote("設定格式不對，未寫入。");
}

function slider(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "set-row";
  const name = document.createElement("span");
  name.textContent = label;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const out = document.createElement("span");
  out.textContent = String(value);
  input.addEventListener("input", () => {
    const next = Number(input.value);
    out.textContent = String(next);
    onChange(next);
  });
  row.append(name, input, out);
  return row;
}

function fillGallery(body: HTMLElement): void {
  const view = presentGallery(work, assets, progress);
  body.append(
    galleryGroup("CG", view.cg),
    galleryGroup("音樂", view.music),
    galleryGroup("結局", view.endings),
  );
  const recalls = document.createElement("div");
  recalls.className = "gal-group";
  const heading = document.createElement("h3");
  heading.textContent = "回想";
  recalls.append(heading);
  if (view.recalls.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "這部作品沒有回想場景。";
    recalls.append(empty);
  } else {
    recalls.append(recallList(view.recalls));
  }
  body.append(recalls);
}

function galleryGroup(title: string, cards: GalleryCard[]): HTMLElement {
  const group = document.createElement("div");
  group.className = "gal-group";
  const heading = document.createElement("h3");
  const unlocked = cards.filter((card) => card.unlocked).length;
  heading.textContent = `${title} ${unlocked}/${cards.length}`;
  group.append(heading);
  const grid = document.createElement("div");
  grid.className = "gal-grid";
  for (const card of cards) {
    // Puppy #72: unlocked cards are buttons with click actions; locked stay inert.
    const cell = document.createElement(card.unlocked ? "button" : "div");
    if (card.unlocked) (cell as HTMLButtonElement).type = "button";
    cell.className = card.unlocked ? "gal-card" : "gal-card locked";
    const caption = document.createElement("p");
    caption.textContent = card.label;
    cell.append(caption);
    if (card.unlocked && card.assetId && title === "CG") {
      const src = urls.get(card.assetId);
      if (src) {
        const img = document.createElement("img");
        img.alt = "";
        img.src = src;
        cell.prepend(img);
      }
    }
    if (card.unlocked) {
      cell.addEventListener("click", () => {
        if (title === "CG" && card.assetId) {
          openCgViewer(card.assetId);
          return;
        }
        if (title === "音樂" && card.assetId) {
          playGalleryBgm(card.assetId);
          return;
        }
        if (title === "結局" && card.endingId && card.sceneId) {
          startEndingReplay(card.endingId, card.sceneId);
        }
      });
    }
    grid.append(cell);
  }
  group.append(grid);
  return group;
}

/** Puppy #72: fullscreen CG review on top of gallery; click / 關閉 returns to gallery. */
function openCgViewer(assetId: string): void {
  const src = urls.get(assetId);
  if (!src) return;
  const existing = overlay.querySelector(".cg-viewer");
  existing?.remove();
  const viewer = document.createElement("div");
  viewer.className = "cg-viewer";
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-label", "CG 重溫");
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "text-btn cg-viewer-close";
  closeBtn.textContent = "關閉";
  const close = () => viewer.remove();
  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    close();
  });
  viewer.addEventListener("click", () => close());
  viewer.append(img, closeBtn);
  overlay.append(viewer);
}

/** Puppy #72: switch BGM immediately via AudioMixer (title／鑑賞 share mixer). */
function playGalleryBgm(assetId: string): void {
  unlockFromGesture();
  if (!audio.unlocked) return;
  const url = urls.get(assetId);
  if (!url) {
    setOverlayNote("找不到這首音樂。");
    return;
  }
  audio.sync(
    resolveAudio({ bgm: assetId, se: null, ambience: null }, (id) => urls.get(id) ?? null),
  );
  setOverlayNote("正在播放");
}

/** Puppy #72: jump to the ending scene and replay through to the ending card. */
function startEndingReplay(_endingId: string, sceneId: string): void {
  const resolved = sceneForEnding(work, _endingId);
  if (!resolved || resolved !== sceneId) {
    setOverlayNote("找不到這個結局場。");
    return;
  }
  const base = initialState(work);
  beginPlay({
    ...base,
    sceneId,
    index: 0,
    background: null,
    actors: [],
    cg: null,
    audio: { bgm: null, se: null, ambience: null },
    line: null,
    choices: null,
    ending: null,
    waiting: false,
  });
}

function fillRecall(body: HTMLElement): void {
  // Puppy #74: DEBUG MODE ON → full branch tree; OFF → unlocked recall list only.
  if (settings.debugMode) {
    fillDebugTree(body);
    return;
  }
  const view = presentGallery(work, assets, progress);
  if (view.recalls.length === 0) {
    body.textContent = "這部作品沒有回想場景。";
    return;
  }
  body.append(recallList(view.recalls));
}

/** Puppy #74: scrollable VN branch tree; click hub → jumpToScene + beginPlay. */
function fillDebugTree(body: HTMLElement): void {
  const tree: DebugTree = buildDebugTree(work);
  const wrap = document.createElement("div");
  wrap.className = "debug-tree";

  const tools = document.createElement("div");
  tools.className = "debug-tree-tools";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "debug-tree-search";
  search.placeholder = "搜尋 scene id／選項／變數";
  search.setAttribute("aria-label", "搜尋分支樹");
  tools.append(search);

  const list = document.createElement("div");
  list.className = "debug-tree-list";

  const renderRows = (): void => {
    list.replaceChildren();
    const rows = flattenDebugTree(tree, search.value);
    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "note";
      empty.textContent = "沒有符合的節點。";
      list.append(empty);
      return;
    }
    for (const row of rows) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "debug-tree-node";
      if (row.sceneId === state.sceneId) btn.classList.add("current");
      btn.style.setProperty("--depth", String(row.depth));
      const title = document.createElement("span");
      title.className = "debug-tree-id";
      let label = row.sceneId;
      if (row.endingId) label += `  〔ending: ${row.endingId}〕`;
      if (row.hasChoice) label += "  〔choice〕";
      title.textContent = label;
      btn.append(title);
      if (row.via) {
        const via = document.createElement("span");
        via.className = "debug-tree-via";
        via.textContent = row.via;
        btn.append(via);
      }
      if (row.skipped > 0) {
        const skip = document.createElement("span");
        skip.className = "debug-tree-skip";
        skip.textContent = `…${row.skipped} 場`;
        btn.append(skip);
      }
      if (row.sets.length > 0) {
        const effects = document.createElement("span");
        effects.className = "debug-tree-sets";
        effects.textContent = row.sets
          .map((s) => `${s.var}=${JSON.stringify(s.value)}`)
          .join(" · ");
        btn.append(effects);
      }
      btn.addEventListener("click", () => {
        const next = jumpToScene(work, row.sceneId);
        if (!next) {
          setOverlayNote(`無法跳到 ${row.sceneId}（不可達或缺場）。`);
          return;
        }
        beginPlay(next);
        setOverlayNote(`已跳到 ${row.sceneId}`);
      });
      list.append(btn);
    }
  };

  search.addEventListener("input", () => renderRows());
  wrap.append(tools, list);
  body.append(wrap);
  renderRows();
}

function recallList(cards: RecallCard[]): HTMLElement {
  const list = document.createElement("div");
  list.className = "recall-list";
  for (const card of cards) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-btn";
    button.textContent = card.label;
    button.disabled = !card.unlocked || !card.script;
    if (card.unlocked && card.script) {
      button.addEventListener("click", () => startRecall(card));
    }
    list.append(button);
  }
  return list;
}

async function renderTitle(): Promise<void> {
  await persistChain.catch(() => undefined);
  overlay.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "title-screen";
  const coverUrl = urls.get("title-cover");
  if (coverUrl) {
    wrap.classList.add("has-cover");
    wrap.style.backgroundImage = `url("${coverUrl}")`;
  }
  const heading = document.createElement("h1");
  heading.textContent = work.manifest.title;
  const menu = document.createElement("div");
  menu.className = "title-menu";
  const latest = await latestContinue(await db(), work).catch(() => null);
  const items: { label: string; disabled?: boolean; on: () => void }[] = [
    { label: "新遊戲", on: () => beginPlay(initialState(work)) },
    {
      label: "繼續",
      disabled: !latest,
      on: () => {
        if (latest) beginPlay(latest.state);
      },
    },
    { label: "讀檔", on: () => openPanel("load") },
    { label: "設定", on: () => openPanel("settings") },
    { label: "鑑賞", on: () => openPanel("gallery") },
  ];
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "title-btn";
    button.textContent = item.label;
    button.disabled = Boolean(item.disabled);
    button.addEventListener("click", () => item.on());
    menu.append(button);
  }
  wrap.append(heading, menu);
  const titleNote = work.manifest.titleNote?.trim();
  if (titleNote) {
    const note = document.createElement("p");
    note.className = "note";
    note.dataset.note = "1";
    note.textContent = titleNote;
    wrap.append(note);
  }
  overlay.append(wrap);
  playTitleBgm();
  if (panel !== "none") renderOverlay();
}

function unlockFromGesture(): void {
  if (audio.unlocked) return;
  audio.unlock();
  applySettings();
  if (screen === "play") {
    audio.sync(resolveAudio(state.audio, (id) => urls.get(id) ?? null));
  } else if (screen === "title") {
    playTitleBgm();
  }
}

window.addEventListener("pointerdown", unlockFromGesture);
window.addEventListener("keydown", (event) => {
  unlockFromGesture();
  if (event.key === "Escape") {
    // Puppy #72: close fullscreen CG review before dismissing gallery panel.
    const viewer = overlay.querySelector(".cg-viewer");
    if (viewer) {
      viewer.remove();
      return;
    }
    if (panel !== "none") closePanel();
    else if (recall) endRecall();
    return;
  }
  if (screen !== "play" || panel !== "none") return;
  const target = event.target;
  if (target instanceof Element && target.closest("button, input, select, textarea")) return;
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    requestAdvance();
  }
});

function shellCss(): string {
  const plate = theme.choice;
  return `
    .shell { min-height: 100dvh; background: ${theme.pageBackground}; color: ${theme.color}; }
    .shell.title-mode .stage-host, .shell.title-mode .hud { visibility: hidden; }
    .hud {
      position: fixed;
      left: 0; right: 0; top: 0;
      z-index: 20;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      padding: 8px 12px 10px;
      pointer-events: none;
    }
    .hud-btn, .title-btn, .text-btn, .slot {
      pointer-events: auto;
      color: ${plate.color};
      background: ${theme.pageBackground};
      border: 1px solid ${theme.nameplate.border};
      font-family: ${theme.fontFamily};
      letter-spacing: 0.08em;
    }
    .hud-btn { font-size: 14px; padding: 6px 10px; }
    .hud-btn:disabled { opacity: 0.4; }
    .overlay { position: fixed; inset: 0; z-index: 30; pointer-events: none; }
    .debug-hud {
      position: fixed;
      top: 8px;
      right: 10px;
      z-index: 40;
      margin: 0;
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.55);
      color: #9fe870;
      font: 12px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: 0.02em;
      pointer-events: none;
      user-select: none;
    }
    .debug-hud[hidden] { display: none !important; }
    .overlay:empty { display: none; }
    .title-screen, .panel { pointer-events: auto; }
    .title-screen {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 28px;
      background: ${theme.pageBackground};
      font-family: ${theme.fontFamily};
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }
    .title-screen.has-cover {
      place-items: end start;
      align-content: end;
      justify-items: start;
      padding: 0 0 8vh 6vw;
      gap: 16px;
    }
    .title-screen.has-cover h1 {
      text-shadow: 0 2px 18px rgba(0, 0, 0, 0.65);
      color: #f5f0e8;
    }
    .title-screen.has-cover .note {
      color: #f5f0e8;
      text-shadow: 0 1px 10px rgba(0, 0, 0, 0.55);
    }
    .title-screen h1 { margin: 0; font-weight: 500; letter-spacing: 0.28em; font-size: 48px; }
    .title-menu { display: grid; gap: 10px; min-width: 220px; }
    .title-btn {
      min-height: 48px;
      font-size: 18px;
      background: url("${plate.image}") center / 100% 100% no-repeat;
      border: 0;
    }
    .title-btn:hover, .title-btn:focus-visible {
      background-image: url("${plate.imageActive}");
    }
    .title-btn:disabled { opacity: 0.35; }
    .panel {
      position: absolute;
      inset: 32px;
      overflow: auto;
      background: ${theme.pageBackground};
      border: 1px solid ${theme.nameplate.border};
      padding: 20px 24px 28px;
      font-family: ${theme.fontFamily};
    }
    .panel-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .panel h2, .panel h3 { font-weight: 500; letter-spacing: 0.14em; }
    .note { min-height: 1.2em; opacity: 0.85; }
    .flash-note {
      position: fixed;
      left: 50%;
      bottom: max(18vh, env(safe-area-inset-bottom, 0px) + 72px);
      transform: translateX(-50%);
      z-index: 50;
      margin: 0;
      padding: 10px 16px;
      max-width: min(90vw, 420px);
      text-align: center;
      letter-spacing: 0.08em;
      background: rgba(7, 11, 20, 0.88);
      border: 1px solid rgba(232, 240, 255, 0.28);
      border-radius: 8px;
      pointer-events: none;
    }
    .flash-note[hidden] { display: none; }
    .log-line { margin: 0 0 10px; line-height: 1.6; }
    .log-who { display: inline-block; min-width: 4em; margin-right: 8px; opacity: 0.8; }
    .slot-panel { display: grid; gap: 10px; max-width: 100%; }
    /* Puppy #67: fixed 6-col manual grid; AUTO/QUICK sit in .slot-special above it. */
    /* Puppy #70: same 6-col as .slot-grid so 自動｜快速 match slot1／slot2 width. */
    .slot-special {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
      max-width: 100%;
    }
    .slot-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
      max-width: 100%;
    }
    .gal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
    .slot, .gal-card, .text-btn { text-align: left; padding: 8px 10px; }
    .slot {
      display: grid;
      gap: 6px;
      min-width: 0;
      min-height: 0;
      align-content: start;
      overflow: hidden;
    }
    .slot-thumb {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #0c1220;
      border: 1px solid ${theme.nameplate.border};
      overflow: hidden;
      display: grid;
      place-items: center;
    }
    .slot-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .slot-thumb-fallback {
      font-size: 12px;
      letter-spacing: 0.08em;
      opacity: 0.55;
    }
    .slot-meta { display: grid; gap: 2px; min-width: 0; }
    .slot-name { letter-spacing: 0.12em; font-size: 13px; }
    .slot-detail {
      font-size: 12px;
      opacity: 0.85;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .gal-card { min-height: 72px; border: 1px solid ${theme.nameplate.border}; cursor: pointer; width: 100%; color: inherit; background: transparent; font: inherit; }
    button.gal-card:hover, button.gal-card:focus-visible { border-color: ${plate.color}; }
    .gal-card img { width: 100%; height: 96px; object-fit: cover; display: block; pointer-events: none; }
    .gal-card.locked { opacity: 0.55; cursor: default; }
    .gal-card p { margin: 6px 0 0; }
    /* Puppy #72: fullscreen CG review above gallery panel */
    .cg-viewer {
      position: absolute;
      inset: 0;
      z-index: 5;
      display: grid;
      place-items: center;
      background: rgba(0, 0, 0, 0.92);
      pointer-events: auto;
      padding: 12px;
    }
    .cg-viewer img {
      max-width: min(100%, 1280px);
      max-height: calc(100dvh - 96px);
      width: auto;
      height: auto;
      object-fit: contain;
      pointer-events: none;
    }
    .cg-viewer-close {
      position: absolute;
      top: max(12px, env(safe-area-inset-top, 0px));
      right: max(12px, env(safe-area-inset-right, 0px));
      z-index: 1;
      padding: 8px 14px;
      background: rgba(7, 11, 20, 0.85);
    }
    .settings { display: grid; gap: 12px; max-width: 520px; }
    .set-row { display: grid; grid-template-columns: 9em 1fr auto; gap: 8px; align-items: center; }
    .recall-list { display: grid; gap: 8px; }
    /* Puppy #74: DEBUG branch tree panel */
    .debug-tree { display: grid; gap: 10px; max-width: 100%; }
    .debug-tree-tools { display: grid; gap: 8px; }
    .debug-tree-search {
      width: 100%;
      max-width: 520px;
      padding: 8px 10px;
      border: 1px solid rgba(232, 240, 255, 0.28);
      border-radius: 6px;
      background: rgba(7, 11, 20, 0.75);
      color: inherit;
      font: inherit;
    }
    .debug-tree-list {
      display: grid;
      gap: 6px;
      max-height: min(60vh, 640px);
      overflow: auto;
      padding-right: 4px;
    }
    .debug-tree-node {
      display: grid;
      gap: 2px;
      text-align: left;
      margin-left: calc(var(--depth, 0) * 14px);
      padding: 8px 10px;
      border: 1px solid rgba(232, 240, 255, 0.22);
      border-radius: 6px;
      background: rgba(7, 11, 20, 0.55);
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .debug-tree-node.current { border-color: rgba(120, 200, 255, 0.65); }
    .debug-tree-id { letter-spacing: 0.04em; }
    .debug-tree-via, .debug-tree-skip, .debug-tree-sets {
      font-size: 12px;
      opacity: 0.8;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    @media (max-width: 720px) {
      .hud {
        gap: 6px;
        justify-content: stretch;
        padding: max(6px, env(safe-area-inset-top, 0px)) 8px 8px;
        background: linear-gradient(180deg, rgba(7, 11, 20, 0.82), rgba(7, 11, 20, 0));
      }
      .hud-btn {
        flex: 1 1 calc(20% - 6px);
        min-width: 0;
        min-height: 40px;
        font-size: 12px;
        padding: 6px 4px;
        letter-spacing: 0.04em;
      }
      .title-screen h1 {
        font-size: clamp(28px, 8vw, 40px);
        letter-spacing: 0.18em;
      }
      .title-screen.has-cover {
        padding: 0 0 max(4vh, env(safe-area-inset-bottom, 0px)) 5vw;
        gap: 12px;
      }
      .title-menu { min-width: min(220px, 80vw); width: min(260px, 86vw); }
      .title-btn { min-height: 46px; font-size: 16px; }
      .panel {
        inset: 12px;
        padding: 14px 14px 20px;
      }
      .set-row {
        grid-template-columns: 1fr;
        gap: 4px;
      }
      /* Puppy #70: mobile 2-col — special matches manual cell width, no overflow. */
      .slot-special {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .slot-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .gal-grid {
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      }
      .debug-tree-node { margin-left: calc(var(--depth, 0) * 10px); }
      .debug-tree-list { max-height: min(65vh, 560px); }
    }
    @media (max-width: 720px) and (orientation: portrait) {
      /* #38: wrap instead of horizontal scroll so all HUD actions stay tappable */
      .hud {
        flex-wrap: wrap;
        overflow-x: hidden;
        justify-content: stretch;
      }
      .hud-btn {
        flex: 1 1 calc(20% - 6px);
        min-width: 0;
        min-height: 40px;
        font-size: 12px;
        padding: 6px 4px;
      }
    }
  `;
}

async function boot(): Promise<void> {
  try {
    const database = await db();
    const storedSettings = await readSettings(database);
    if (storedSettings) settings = storedSettings;
    const storedProgress = await readProgress(database, work.manifest.id);
    if (storedProgress) {
      progress = storedProgress;
      seen = new Set(storedProgress.seen);
    }
  } catch {
    /* private mode or blocked storage: play still starts, continue stays off */
  }
  applySettings();
  renderHud();
  await renderTitle();
  if (import.meta.env.PROD) {
    const ok = await registerServiceWorker(import.meta.env.BASE_URL);
    if (ok && isWorkOfflineReady(work.manifest)) {
      const screen = overlay.querySelector(".title-screen");
      let note = overlay.querySelector(".note");
      if (!(note instanceof HTMLElement) && screen instanceof HTMLElement) {
        note = document.createElement("p");
        note.className = "note";
        note.dataset.note = "1";
        screen.append(note);
      }
      if (note instanceof HTMLElement) {
        note.textContent = "此作品已標可離線：首次載入後斷網亦可重開遊玩。";
      }
    }
  }
}

void boot();
