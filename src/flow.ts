import { initialState, reduce } from "./reduce.ts";
import type { Line, PlayState, RecallScript, VarValue, Work } from "./types.ts";

export type HistoryEntry = {
  sceneId: string;
  index: number;
  line: Line;
};

export type WorkProgress = {
  workId: string;
  seen: string[];
  cg: string[];
  endings: string[];
  music: string[];
};

/** Saved play position while a recall is on screen. Not a save slot. */
export type RecallFrame = {
  state: PlayState;
  backlog: HistoryEntry[];
  script: RecallScript;
};

const STEP_CAP = 10_000;

export function emptyProgress(workId: string): WorkProgress {
  return { workId, seen: [], cg: [], endings: [], music: [] };
}

/** Key for a line the player is looking at. Choices and waits are not lines. */
export function lineKey(state: PlayState): string | null {
  if (!state.waiting || !state.line) return null;
  return `${state.sceneId}:${state.index}`;
}

export function pushBacklog(backlog: HistoryEntry[], state: PlayState): HistoryEntry[] {
  if (!state.line || !state.waiting) return backlog;
  const last = backlog[backlog.length - 1];
  if (
    last &&
    last.sceneId === state.sceneId &&
    last.index === state.index &&
    last.line.kind === state.line.kind &&
    last.line.text === state.line.text
  ) {
    return backlog;
  }
  return [
    ...backlog,
    { sceneId: state.sceneId, index: state.index, line: state.line },
  ];
}

/** The line being left is now read. The line just arrived is not. */
export function markRead(seen: ReadonlySet<string>, state: PlayState): Set<string> {
  const key = lineKey(state);
  if (!key || seen.has(key)) return new Set(seen);
  const next = new Set(seen);
  next.add(key);
  return next;
}

export type AdvanceGesture =
  | { type: "reveal" }
  | { type: "blocked" }
  | { type: "step"; state: PlayState; seen: Set<string> };

/**
 * First advance while a line is still typing only reveals it.
 * Choices and endings do not advance. Recall can refuse the step that would enter `end`.
 */
export function advanceGesture(
  typing: boolean,
  work: Work,
  state: PlayState,
  seen: ReadonlySet<string>,
  recallEnd?: string,
): AdvanceGesture {
  if (typing) return { type: "reveal" };
  if (state.choices || state.ending) return { type: "blocked" };
  if (recallEnd && state.sceneId === recallEnd) return { type: "blocked" };
  const next = reduce(work, state, { type: "advance" });
  if (sameBeat(state, next)) return { type: "blocked" };
  if (recallEnd && next.sceneId === recallEnd && state.sceneId !== recallEnd) {
    return { type: "blocked" };
  }
  return { type: "step", state: next, seen: markRead(seen, state) };
}

/**
 * Skip only lines already in `seen`. Stop on a choice, an ending, or the first unread line.
 * Does not mark new lines read.
 */
export function skipRead(
  work: Work,
  state: PlayState,
  seen: ReadonlySet<string>,
  recallEnd?: string,
  /** Lines actually left behind. The stopped beat is not included. */
  onPassed?: (state: PlayState) => void,
): PlayState {
  let current = state;
  for (let steps = 0; steps < STEP_CAP; steps++) {
    if (current.choices || current.ending) return current;
    if (recallEnd && current.sceneId === recallEnd) return current;
    const key = lineKey(current);
    if (key && !seen.has(key)) return current;
    const next = reduce(work, current, { type: "advance" });
    if (sameBeat(current, next)) return current;
    if (recallEnd && next.sceneId === recallEnd && current.sceneId !== recallEnd) {
      return current;
    }
    onPassed?.(current);
    current = next;
  }
  return current;
}

/** Auto-play never chooses and never steps on an ending. */
export function autoStep(
  work: Work,
  state: PlayState,
  seen: ReadonlySet<string>,
  recallEnd?: string,
): { state: PlayState; seen: Set<string> } | null {
  const gesture = advanceGesture(false, work, state, seen, recallEnd);
  if (gesture.type !== "step") return null;
  return { state: gesture.state, seen: gesture.seen };
}

export function chooseStep(
  work: Work,
  state: PlayState,
  index: number,
  recallEnd?: string,
): PlayState | null {
  if (!state.choices || state.ending) return null;
  const next = reduce(work, state, { type: "choose", index });
  if (recallEnd && next.sceneId === recallEnd && state.sceneId !== recallEnd) return null;
  return next;
}

export function recallStart(work: Work, script: RecallScript): PlayState {
  const base = initialState(work);
  const vars: Record<string, VarValue> = { ...base.vars };
  if (script.vars) {
    for (const [key, value] of Object.entries(script.vars)) {
      if (key in vars) vars[key] = value;
    }
  }
  return {
    ...base,
    sceneId: script.start,
    index: 0,
    vars,
    background: null,
    actors: [],
    cg: null,
    audio: { bgm: null, se: null, ambience: null },
    line: null,
    choices: null,
    ending: null,
    waiting: false,
  };
}

export function enterRecall(
  state: PlayState,
  backlog: HistoryEntry[],
  script: RecallScript,
  start: PlayState,
): { frame: RecallFrame; state: PlayState; backlog: HistoryEntry[] } {
  return {
    frame: {
      state: cloneState(state),
      backlog: backlog.map((entry) => ({ ...entry, line: { ...entry.line } })),
      script,
    },
    state: cloneState(start),
    backlog: [],
  };
}

export function exitRecall(frame: RecallFrame): { state: PlayState; backlog: HistoryEntry[] } {
  return {
    state: cloneState(frame.state),
    backlog: frame.backlog.map((entry) => ({ ...entry, line: { ...entry.line } })),
  };
}

/** Recall must not add CG, ending, or music unlocks. */
export function recordUnlocks(
  progress: WorkProgress,
  state: PlayState,
  recalling: boolean,
): WorkProgress {
  if (recalling) return progress;
  const cg = new Set(progress.cg);
  const endings = new Set(progress.endings);
  const music = new Set(progress.music);
  if (state.cg) cg.add(state.cg);
  if (state.ending) endings.add(state.ending.id);
  if (state.audio.bgm) music.add(state.audio.bgm);
  return {
    workId: progress.workId,
    seen: progress.seen,
    cg: [...cg],
    endings: [...endings],
    music: [...music],
  };
}

export function withSeen(progress: WorkProgress, seen: ReadonlySet<string>): WorkProgress {
  return { ...progress, seen: [...seen] };
}

function sameBeat(a: PlayState, b: PlayState): boolean {
  return (
    a.sceneId === b.sceneId &&
    a.index === b.index &&
    a.waiting === b.waiting &&
    a.line?.text === b.line?.text &&
    Boolean(a.choices) === Boolean(b.choices) &&
    Boolean(a.ending) === Boolean(b.ending)
  );
}

function cloneState(state: PlayState): PlayState {
  return {
    sceneId: state.sceneId,
    index: state.index,
    vars: { ...state.vars },
    background: state.background,
    actors: state.actors.map((actor) => ({ ...actor })),
    cg: state.cg,
    audio: { ...state.audio },
    line: state.line ? { ...state.line } : null,
    choices: state.choices ? state.choices.map((option) => ({ ...option })) : null,
    ending: state.ending ? { ...state.ending } : null,
    waiting: state.waiting,
  };
}
