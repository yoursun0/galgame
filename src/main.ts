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
import { presentGallery, type GalleryCard, type RecallCard } from "./gallery.ts";
import { initialState } from "./reduce.ts";
import {
  acceptLoad,
  allSlotIds,
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

const stage = mountStage(stageHost, theme, work, assets, urls, {
  onAdvance: () => requestAdvance(),
  onChoose: (index) => requestChoose(index),
  onDismissCg: () => {
    /* stage hides the overlay; the line underneath stays */
  },
  onTypingComplete: () => scheduleAuto(),
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
  if (audio.unlocked && screen === "play") {
    audio.sync(resolveAudio(state.audio, (id) => urls.get(id) ?? null));
  }
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
  await writeSlot(await db(), work.manifest.id, AUTO_SLOT, capture(work, state));
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
  const wrote = await writeSlot(await db(), work.manifest.id, slot, capture(work, state));
  if (!wrote.ok) {
    setOverlayNote("存檔被拒絕，原槽未改。");
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
    { act: "recall", label: recall ? "結束回想" : "回想", on: () => (recall ? endRecall() : openPanel("recall")) },
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
      return "回想";
    default:
      return "";
  }
}

function setOverlayNote(text: string): void {
  const note = overlay.querySelector<HTMLElement>("[data-note]");
  if (note) note.textContent = text;
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
  const database = await db();
  const grid = document.createElement("div");
  grid.className = "slot-grid";
  const ids: SlotId[] =
    mode === "save"
      ? Array.from({ length: 12 }, (_, index) => manualSlot(index))
      : allSlotIds();
  for (const slot of ids) {
    const raw = await readSlot(database, work.manifest.id, slot);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot";
    const name = document.createElement("span");
    name.className = "slot-name";
    name.textContent = slotName(slot);
    const detail = document.createElement("span");
    detail.className = "slot-detail";
    detail.textContent = slotDetail(raw);
    button.append(name, detail);
    button.addEventListener("click", () => {
      if (mode === "save") void saveManual(slot);
      else void loadSlot(slot);
    });
    grid.append(button);
  }
  body.replaceChildren(grid);
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
  const preview = line.length > 32 ? `${line.slice(0, 32)}…` : line;
  return `${when} ${preview}`;
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
    const cell = document.createElement("div");
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
    grid.append(cell);
  }
  group.append(grid);
  return group;
}

function fillRecall(body: HTMLElement): void {
  const view = presentGallery(work, assets, progress);
  if (view.recalls.length === 0) {
    body.textContent = "這部作品沒有回想場景。";
    return;
  }
  body.append(recallList(view.recalls));
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
  const note = document.createElement("p");
  note.className = "note";
  note.dataset.note = "1";
  note.textContent = `作品 ${work.manifest.id} · ?work=<id> 可切換（無需改播放器）`;
  wrap.append(heading, menu, note);
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
    .log-line { margin: 0 0 10px; line-height: 1.6; }
    .log-who { display: inline-block; min-width: 4em; margin-right: 8px; opacity: 0.8; }
    .slot-grid, .gal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
    .slot, .gal-card, .text-btn { text-align: left; padding: 8px 10px; }
    .slot { display: grid; gap: 4px; min-height: 72px; }
    .slot-name { letter-spacing: 0.12em; }
    .slot-detail { font-size: 13px; opacity: 0.85; white-space: pre-wrap; }
    .gal-card { min-height: 72px; border: 1px solid ${theme.nameplate.border}; }
    .gal-card img { width: 100%; height: 96px; object-fit: cover; display: block; }
    .gal-card.locked { opacity: 0.55; }
    .settings { display: grid; gap: 12px; max-width: 520px; }
    .set-row { display: grid; grid-template-columns: 9em 1fr auto; gap: 8px; align-items: center; }
    .recall-list { display: grid; gap: 8px; }
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
      const note = overlay.querySelector(".note");
      if (note instanceof HTMLElement) {
        note.textContent = "此作品已標可離線：首次載入後斷網亦可重開遊玩。";
      }
    }
  }
}

void boot();
