import type { ActorSlot, Line, PlayState, VarValue, Work } from "./types.ts";

/**
 * IndexedDB saves. Settings and cross-slot work progress live in other stores.
 * This file does not use sessionStorage.
 */

export const DB_NAME = "galgame-player";
export const DB_VERSION = 1;
export const MANUAL_COUNT = 12;
export const AUTO_SLOT = "auto";
export const QUICK_SLOT = "quick";

const SETTINGS_KEY = "player";

export type SlotId = "auto" | "quick" | `manual-${number}`;

export type SaveProgress = {
  sceneId: string;
  index: number;
  vars: Record<string, VarValue>;
  background: string | null;
  actors: ActorSlot[];
  cg: string | null;
  audio: {
    bgm: string | null;
    se: string | null;
    ambience: string | null;
  };
  line: Line | null;
  choices: { text: string; jump: string }[] | null;
  ending: { id: string } | null;
  waiting: boolean;
};

export type SaveRecord = {
  workId: string;
  schemaVersion: number;
  contentVersion: number;
  timestamp: number;
  progress: SaveProgress;
};

export type Settings = {
  textSpeed: number;
  autoDelayMs: number;
  volumes: { bgm: number; se: number; ambience: number };
  animation: "full" | "reduced";
};

export type LoadResult =
  | { ok: true; record: SaveRecord; state: PlayState }
  | { ok: false; reason: "empty" | "corrupt" | "version" | "work" };

export function manualSlot(index: number): SlotId {
  if (!Number.isInteger(index) || index < 0 || index >= MANUAL_COUNT) {
    throw new Error(`manual slot ${index} is out of range`);
  }
  return `manual-${index}`;
}

export function allSlotIds(): SlotId[] {
  const manual: SlotId[] = [];
  for (let i = 0; i < MANUAL_COUNT; i++) manual.push(manualSlot(i));
  return [AUTO_SLOT, QUICK_SLOT, ...manual];
}

export function isSlotId(value: string): value is SlotId {
  if (value === AUTO_SLOT || value === QUICK_SLOT) return true;
  const match = /^manual-(\d+)$/.exec(value);
  if (!match) return false;
  const index = Number(match[1]);
  return index >= 0 && index < MANUAL_COUNT;
}

export function defaultSettings(textSpeed = 28): Settings {
  return {
    textSpeed,
    autoDelayMs: 1600,
    volumes: { bgm: 0.35, se: 0.55, ambience: 0.22 },
    animation: "full",
  };
}

export function capture(work: Work, state: PlayState, timestamp = Date.now()): SaveRecord {
  return {
    workId: work.manifest.id,
    schemaVersion: work.manifest.schemaVersion,
    contentVersion: work.manifest.contentVersion,
    timestamp,
    progress: snapshot(state),
  };
}

/**
 * Accept a slot only when work id, schemaVersion, and contentVersion all match.
 * A mismatch is a reject. The caller must not write a guessed position back.
 */
export function acceptLoad(raw: unknown, work: Work): LoadResult {
  if (raw == null) return { ok: false, reason: "empty" };
  if (!isSaveRecord(raw)) return { ok: false, reason: "corrupt" };
  if (raw.workId !== work.manifest.id) return { ok: false, reason: "work" };
  if (
    raw.schemaVersion !== work.manifest.schemaVersion ||
    raw.contentVersion !== work.manifest.contentVersion
  ) {
    return { ok: false, reason: "version" };
  }
  return { ok: true, record: raw, state: snapshotToState(raw.progress) };
}

export function isSaveRecord(raw: unknown): raw is SaveRecord {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  if (typeof record.workId !== "string" || record.workId.length === 0) return false;
  if (!isInt(record.schemaVersion) || !isInt(record.contentVersion)) return false;
  if (typeof record.timestamp !== "number" || !Number.isFinite(record.timestamp)) return false;
  return isProgress(record.progress);
}

export function sanitizeSettings(raw: unknown): Settings | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const volumes = value.volumes;
  if (!volumes || typeof volumes !== "object") return null;
  const vol = volumes as Record<string, unknown>;
  const textSpeed = clampNumber(value.textSpeed, 1, 200);
  const autoDelayMs = clampNumber(value.autoDelayMs, 200, 10_000);
  const bgm = clampNumber(vol.bgm, 0, 1);
  const se = clampNumber(vol.se, 0, 1);
  const ambience = clampNumber(vol.ambience, 0, 1);
  if (
    textSpeed === null ||
    autoDelayMs === null ||
    bgm === null ||
    se === null ||
    ambience === null
  ) {
    return null;
  }
  if (value.animation !== "full" && value.animation !== "reduced") return null;
  return {
    textSpeed,
    autoDelayMs,
    volumes: { bgm, se, ambience },
    animation: value.animation,
  };
}

export type ProgressShape = {
  workId: string;
  seen: string[];
  cg: string[];
  endings: string[];
  music: string[];
};

export function sanitizeProgress(workId: string, raw: unknown): ProgressShape | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.workId !== workId) return null;
  if (!isStringList(value.seen) || !isStringList(value.cg)) return null;
  if (!isStringList(value.endings) || !isStringList(value.music)) return null;
  return {
    workId,
    seen: value.seen,
    cg: value.cg,
    endings: value.endings,
    music: value.music,
  };
}

export function openSaveDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("slots")) db.createObjectStore("slots");
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
      if (!db.objectStoreNames.contains("progress")) db.createObjectStore("progress");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readSlot(
  db: IDBDatabase,
  workId: string,
  slot: SlotId,
): Promise<unknown> {
  return idbGet(db, "slots", slotKey(workId, slot));
}

/**
 * Refuses a record that is not a well-formed save. The existing slot is left as it was.
 */
export async function writeSlot(
  db: IDBDatabase,
  workId: string,
  slot: SlotId,
  record: unknown,
): Promise<{ ok: true } | { ok: false; reason: "corrupt" | "work" }> {
  if (!isSaveRecord(record)) return { ok: false, reason: "corrupt" };
  if (record.workId !== workId) return { ok: false, reason: "work" };
  await idbPut(db, "slots", slotKey(workId, slot), record);
  return { ok: true };
}

export async function readSettings(db: IDBDatabase): Promise<Settings | null> {
  const raw = await idbGet(db, "settings", SETTINGS_KEY);
  if (raw == null) return null;
  return sanitizeSettings(raw);
}

/** Invalid settings are not written, so a bad payload cannot replace a good one. */
export async function writeSettings(
  db: IDBDatabase,
  settings: unknown,
): Promise<{ ok: true } | { ok: false; reason: "corrupt" }> {
  const clean = sanitizeSettings(settings);
  if (!clean) return { ok: false, reason: "corrupt" };
  await idbPut(db, "settings", SETTINGS_KEY, clean);
  return { ok: true };
}

export async function readProgress(
  db: IDBDatabase,
  workId: string,
): Promise<ProgressShape | null> {
  const raw = await idbGet(db, "progress", workId);
  if (raw == null) return null;
  return sanitizeProgress(workId, raw);
}

export async function writeProgress(
  db: IDBDatabase,
  progress: ProgressShape,
): Promise<{ ok: true } | { ok: false; reason: "corrupt" }> {
  const clean = sanitizeProgress(progress.workId, progress);
  if (!clean) return { ok: false, reason: "corrupt" };
  await idbPut(db, "progress", progress.workId, clean);
  return { ok: true };
}

export async function listSlots(
  db: IDBDatabase,
  workId: string,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const slot of allSlotIds()) {
    out[slot] = await readSlot(db, workId, slot);
  }
  return out;
}

/** Newest acceptable slot. Skips empty, corrupt, and wrong-version records without rewriting them. */
export async function latestContinue(
  db: IDBDatabase,
  work: Work,
): Promise<{ slot: SlotId; record: SaveRecord; state: PlayState } | null> {
  let best: { slot: SlotId; record: SaveRecord; state: PlayState } | null = null;
  for (const slot of allSlotIds()) {
    const accepted = acceptLoad(await readSlot(db, workIdOf(work), slot), work);
    if (!accepted.ok) continue;
    if (!best || accepted.record.timestamp > best.record.timestamp) {
      best = { slot, record: accepted.record, state: accepted.state };
    }
  }
  return best;
}

function workIdOf(work: Work): string {
  return work.manifest.id;
}

function slotKey(workId: string, slot: SlotId): string {
  return `${workId}:${slot}`;
}

function snapshot(state: PlayState): SaveProgress {
  return {
    sceneId: state.sceneId,
    index: state.index,
    vars: { ...state.vars },
    background: state.background,
    actors: state.actors.map((actor) => ({
      id: actor.id,
      expr: actor.expr,
      position: actor.position,
    })),
    cg: state.cg,
    audio: {
      bgm: state.audio.bgm,
      se: state.audio.se,
      ambience: state.audio.ambience,
    },
    line: state.line ? { ...state.line } : null,
    choices: state.choices ? state.choices.map((option) => ({ text: option.text, jump: option.jump })) : null,
    ending: state.ending ? { id: state.ending.id } : null,
    waiting: state.waiting,
  };
}

function snapshotToState(progress: SaveProgress): PlayState {
  return {
    sceneId: progress.sceneId,
    index: progress.index,
    vars: { ...progress.vars },
    background: progress.background,
    actors: progress.actors.map((actor) => ({ ...actor })),
    cg: progress.cg,
    audio: { ...progress.audio },
    line: progress.line ? { ...progress.line } : null,
    choices: progress.choices ? progress.choices.map((option) => ({ ...option })) : null,
    ending: progress.ending ? { id: progress.ending.id } : null,
    waiting: progress.waiting,
  };
}

function isProgress(raw: unknown): raw is SaveProgress {
  if (!raw || typeof raw !== "object") return false;
  const progress = raw as Record<string, unknown>;
  if (typeof progress.sceneId !== "string" || progress.sceneId.length === 0) return false;
  if (!isInt(progress.index) || (progress.index as number) < 0) return false;
  if (!isVars(progress.vars)) return false;
  if (!(progress.background === null || typeof progress.background === "string")) return false;
  if (!isActors(progress.actors)) return false;
  if (!(progress.cg === null || typeof progress.cg === "string")) return false;
  if (!isAudio(progress.audio)) return false;
  if (!isLine(progress.line)) return false;
  if (!isChoices(progress.choices)) return false;
  if (!isEnding(progress.ending)) return false;
  if (typeof progress.waiting !== "boolean") return false;
  return true;
}

function isVars(raw: unknown): raw is Record<string, VarValue> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  for (const value of Object.values(raw as Record<string, unknown>)) {
    const kind = typeof value;
    if (kind !== "boolean" && kind !== "number" && kind !== "string") return false;
    if (kind === "number" && !Number.isFinite(value as number)) return false;
  }
  return true;
}

function isActors(raw: unknown): raw is ActorSlot[] {
  if (!Array.isArray(raw)) return false;
  return raw.every((item) => {
    if (!item || typeof item !== "object") return false;
    const actor = item as Record<string, unknown>;
    return (
      typeof actor.id === "string" &&
      (actor.expr === null || typeof actor.expr === "string") &&
      (actor.position === null || typeof actor.position === "string")
    );
  });
}

function isAudio(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const audio = raw as Record<string, unknown>;
  for (const key of ["bgm", "se", "ambience"]) {
    const value = audio[key];
    if (!(value === null || typeof value === "string")) return false;
  }
  return true;
}

function isLine(raw: unknown): boolean {
  if (raw === null) return true;
  if (!raw || typeof raw !== "object") return false;
  const line = raw as Record<string, unknown>;
  if (typeof line.text !== "string") return false;
  if (line.kind === "narration") return true;
  if (line.kind === "dialogue") {
    return line.speaker === undefined || typeof line.speaker === "string";
  }
  return false;
}

function isChoices(raw: unknown): boolean {
  if (raw === null) return true;
  if (!Array.isArray(raw)) return false;
  return raw.every((item) => {
    if (!item || typeof item !== "object") return false;
    const option = item as Record<string, unknown>;
    return typeof option.text === "string" && typeof option.jump === "string";
  });
}

function isEnding(raw: unknown): boolean {
  if (raw === null) return true;
  if (!raw || typeof raw !== "object") return false;
  return typeof (raw as { id?: unknown }).id === "string";
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function clampNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function idbGet(db: IDBDatabase, store: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const request = tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? request.error);
  });
}
