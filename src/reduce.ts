import type {
  Action,
  ActorSlot,
  ChoiceOption,
  CmpOp,
  Condition,
  Instruction,
  PlayState,
  VarValue,
  Work,
} from "./types.ts";

const STEP_CAP = 10_000;

export function initialState(work: Work): PlayState {
  const vars: Record<string, VarValue> = {};
  for (const decl of work.manifest.variables) {
    vars[decl.name] = decl.initial;
  }
  return {
    sceneId: work.manifest.start,
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

export function reduce(work: Work, state: PlayState, action: Action): PlayState {
  if (action.type === "choose") {
    if (!state.choices || state.ending) return state;
    const option = state.choices[action.index];
    if (!option) return state;
    return run(work, {
      ...state,
      sceneId: option.jump,
      index: 0,
      line: null,
      choices: null,
      ending: null,
      waiting: false,
    });
  }

  if (state.ending || state.choices) return state;

  if (state.waiting) {
    return run(work, {
      ...state,
      index: state.index + 1,
      line: null,
      choices: null,
      ending: null,
      waiting: false,
    });
  }

  return run(work, state);
}

function run(work: Work, state: PlayState): PlayState {
  let current = state;
  for (let steps = 0; steps < STEP_CAP; steps++) {
    const scene = work.scenes.find((item) => item.id === current.sceneId);
    if (!scene) return current;
    if (current.index >= scene.instructions.length) return current;

    const instruction = scene.instructions[current.index];
    if (!instruction) return current;

    if (isBlocking(instruction)) {
      return applyBlocking(current, instruction);
    }
    current = applyImmediate(current, instruction);
  }
  // A script can jump forever; stop instead of looping.
  return current;
}

function isBlocking(instruction: Instruction): boolean {
  return (
    instruction.kind === "narration" ||
    instruction.kind === "dialogue" ||
    instruction.kind === "choice" ||
    instruction.kind === "wait" ||
    instruction.kind === "ending"
  );
}

function applyBlocking(state: PlayState, instruction: Instruction): PlayState {
  const cleared: PlayState = {
    ...state,
    line: null,
    choices: null,
    ending: null,
    waiting: true,
  };
  switch (instruction.kind) {
    case "narration":
      return {
        ...cleared,
        line: { kind: "narration", text: instruction.text },
      };
    case "dialogue":
      return {
        ...cleared,
        line: {
          kind: "dialogue",
          speaker: instruction.speaker,
          text: instruction.text,
        },
      };
    case "choice":
      return {
        ...cleared,
        choices: instruction.options.map(
          (option): ChoiceOption => ({ text: option.text, jump: option.jump }),
        ),
      };
    case "wait":
      return cleared;
    case "ending":
      return { ...cleared, ending: { id: instruction.id } };
    default:
      return cleared;
  }
}

function applyImmediate(state: PlayState, instruction: Instruction): PlayState {
  switch (instruction.kind) {
    case "background":
      return { ...state, index: state.index + 1, background: instruction.asset };
    case "actor":
      return {
        ...state,
        index: state.index + 1,
        actors: applyActor(state.actors, instruction),
      };
    case "cg":
      return {
        ...state,
        index: state.index + 1,
        cg:
          instruction.action === "hide" ? null : (instruction.asset ?? state.cg),
      };
    case "audio":
      return {
        ...state,
        index: state.index + 1,
        audio: applyAudio(state.audio, instruction),
      };
    case "set":
      return {
        ...state,
        index: state.index + 1,
        vars: { ...state.vars, [instruction.var]: instruction.value },
      };
    case "jump": {
      const take =
        instruction.when === undefined ||
        evalCondition(instruction.when, state.vars);
      if (!take) return { ...state, index: state.index + 1 };
      return { ...state, sceneId: instruction.to, index: 0 };
    }
    default:
      return { ...state, index: state.index + 1 };
  }
}

function applyActor(
  actors: ActorSlot[],
  instruction: Extract<Instruction, { kind: "actor" }>,
): ActorSlot[] {
  if (instruction.action === "hide") {
    return actors.filter((actor) => actor.id !== instruction.id);
  }
  if (instruction.action === "show") {
    return [
      ...actors.filter((actor) => actor.id !== instruction.id),
      {
        id: instruction.id,
        expr: instruction.expr ?? null,
        position: instruction.position ?? null,
      },
    ];
  }
  return actors.map((actor) => {
    if (actor.id !== instruction.id) return actor;
    return {
      id: actor.id,
      expr: instruction.expr ?? actor.expr,
      position: instruction.position ?? actor.position,
    };
  });
}

function applyAudio(
  audio: PlayState["audio"],
  instruction: Extract<Instruction, { kind: "audio" }>,
): PlayState["audio"] {
  const next = instruction.action === "stop" ? null : (instruction.asset ?? null);
  return { ...audio, [instruction.channel]: next };
}

export function evalCondition(
  condition: Condition,
  vars: Record<string, VarValue>,
): boolean {
  if ("cmp" in condition) {
    return compare(condition.cmp, vars[condition.var], condition.value);
  }
  if ("all" in condition) {
    return condition.all.every((item) => evalCondition(item, vars));
  }
  if ("any" in condition) {
    return condition.any.some((item) => evalCondition(item, vars));
  }
  return !evalCondition(condition.not, vars);
}

function compare(op: CmpOp, left: VarValue | undefined, right: VarValue): boolean {
  if (op === "eq") return left === right;
  if (op === "neq") return left !== right;
  if (typeof left !== typeof right || left === undefined) return false;
  if (typeof left === "boolean" || typeof right === "boolean") return false;
  switch (op) {
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    default:
      return false;
  }
}
