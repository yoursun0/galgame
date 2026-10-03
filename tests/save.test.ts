import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "fake-indexeddb/auto";
import { emptyProgress, withSeen } from "../src/flow.ts";
import { initialState, reduce } from "../src/reduce.ts";
import {
  DB_NAME,
  acceptLoad,
  capture,
  defaultSettings,
  latestContinue,
  manualSlot,
  openSaveDb,
  readProgress,
  readSettings,
  readSlot,
  writeProgress,
  writeSettings,
  writeSlot,
  type SaveRecord,
} from "../src/save.ts";
import type { Scene, Work, WorkManifest } from "../src/types.ts";

function loadXingkong(): Work {
  const root = join(import.meta.dir, "../works/xingkong");
  const manifest = JSON.parse(readFileSync(join(root, "work.json"), "utf8")) as WorkManifest;
  const scenes = manifest.scenes.map((rel) => {
    return JSON.parse(readFileSync(join(root, rel), "utf8")) as Scene;
  });
  return { manifest, scenes };
}

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await resetDb();
});

describe("indexedDB saves", () => {
  const work = loadXingkong();

  test("round-trip keeps the play position", async () => {
    let state = reduce(work, initialState(work), { type: "advance" });
    state = reduce(work, state, { type: "advance" });
    const record = capture(work, state, 1_700_000_000_000);
    const db = await openSaveDb();
    expect(await writeSlot(db, work.manifest.id, "auto", record)).toEqual({ ok: true });
    expect(await writeSlot(db, work.manifest.id, manualSlot(0), record)).toEqual({ ok: true });
    db.close();

    const reopened = await openSaveDb();
    const loaded = acceptLoad(await readSlot(reopened, work.manifest.id, "auto"), work);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.sceneId).toBe(state.sceneId);
    expect(loaded.state.index).toBe(state.index);
    expect(loaded.state.vars).toEqual(state.vars);
    expect(loaded.state.background).toBe(state.background);
    expect(loaded.state.actors).toEqual(state.actors);
    expect(loaded.state.cg).toBe(state.cg);
    expect(loaded.state.audio).toEqual(state.audio);
    expect(loaded.state.line).toEqual(state.line);
    expect(loaded.state.waiting).toBe(state.waiting);
    const continued = await latestContinue(reopened, work);
    expect(continued?.slot).toBe("auto");
    expect(continued?.state.line).toEqual(state.line);
    expect(continued?.state.sceneId).toBe(state.sceneId);
    reopened.close();
  });

  test("a corrupt write does not replace a good slot", async () => {
    const state = reduce(work, initialState(work), { type: "advance" });
    const good = capture(work, state, 1_700_000_000_000);
    const db = await openSaveDb();
    await writeSlot(db, work.manifest.id, manualSlot(3), good);
    const rejected = await writeSlot(db, work.manifest.id, manualSlot(3), {
      workId: work.manifest.id,
      broken: true,
    });
    expect(rejected).toEqual({ ok: false, reason: "corrupt" });
    const stored = await readSlot(db, work.manifest.id, manualSlot(3));
    expect(stored).toEqual(good);
    const accepted = acceptLoad(stored, work);
    expect(accepted.ok).toBe(true);
    db.close();
  });

  test("version mismatch is rejected and the slot is not rewritten", async () => {
    const state = reduce(work, initialState(work), { type: "advance" });
    const mismatched: SaveRecord = {
      ...capture(work, state, 1_700_000_000_100),
      contentVersion: work.manifest.contentVersion + 9,
      progress: { ...capture(work, state).progress, sceneId: state.sceneId },
    };
    const db = await openSaveDb();
    expect(await writeSlot(db, work.manifest.id, "quick", mismatched)).toEqual({ ok: true });
    const before = await readSlot(db, work.manifest.id, "quick");
    const accepted = acceptLoad(before, work);
    expect(accepted).toEqual({ ok: false, reason: "version" });
    const after = await readSlot(db, work.manifest.id, "quick");
    expect(after).toEqual(before);
    expect(await latestContinue(db, work)).toBeNull();
    db.close();
  });

  test("settings, progress, and slots stay in separate stores", async () => {
    const state = reduce(work, initialState(work), { type: "advance" });
    const db = await openSaveDb();
    const settings = defaultSettings(28);
    settings.textSpeed = 40;
    settings.autoDelayMs = 2200;
    settings.animation = "reduced";
    expect(await writeSettings(db, settings)).toEqual({ ok: true });
    const seen = new Set(["open1:3"]);
    const progress = withSeen(emptyProgress(work.manifest.id), seen);
    progress.cg = ["cg-example"];
    expect(await writeProgress(db, progress)).toEqual({ ok: true });
    const record = capture(work, state, 1_700_000_000_200);
    expect(await writeSlot(db, work.manifest.id, manualSlot(1), record)).toEqual({ ok: true });

    expect(await writeSettings(db, { textSpeed: "fast" })).toEqual({ ok: false, reason: "corrupt" });
    expect(await readSettings(db)).toEqual(settings);

    const slot = (await readSlot(db, work.manifest.id, manualSlot(1))) as SaveRecord;
    expect(slot.progress.sceneId).toBe(state.sceneId);
    expect(Object.keys(slot).sort()).toEqual(
      ["contentVersion", "progress", "schemaVersion", "timestamp", "workId"],
    );
    expect(Object.keys(slot.progress).sort()).toEqual(
      ["actors", "audio", "background", "cg", "choices", "ending", "index", "line", "sceneId", "vars", "waiting"],
    );
    expect(slot.progress.cg).toBe(state.cg);

    expect(await readProgress(db, work.manifest.id)).toEqual(progress);
    expect(await readSettings(db)).toEqual(settings);
    db.close();
  });
});
