/** Plain-text script format. No executable fields and no eval. */

export type VarValue = boolean | number | string;

export type VarType = "boolean" | "number" | "string";

export type CmpOp = "eq" | "neq" | "lt" | "lte" | "gt" | "gte";

export type Condition =
  | { cmp: CmpOp; var: string; value: VarValue }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export type ChoiceOption = {
  text: string;
  jump: string;
};

export type Instruction =
  | { kind: "narration"; text: string }
  | { kind: "dialogue"; speaker: string; text: string }
  | { kind: "background"; asset: string }
  | {
      kind: "actor";
      action: "show" | "update" | "hide";
      id: string;
      expr?: string;
      position?: string;
    }
  | { kind: "cg"; action: "show" | "hide"; asset?: string }
  | {
      kind: "audio";
      action: "play" | "stop";
      channel: "bgm" | "se" | "ambience";
      asset?: string;
    }
  | { kind: "wait"; ms: number }
  | { kind: "choice"; options: ChoiceOption[] }
  | { kind: "set"; var: string; value: VarValue }
  | { kind: "jump"; to: string; when?: Condition }
  | { kind: "ending"; id: string };

export type VariableDecl = {
  name: string;
  type: VarType;
  initial: VarValue;
};

export type CharacterDecl = {
  id: string;
  name: string;
  /** expr or position id -> approved asset id. Data only. */
  sprites?: Record<string, string>;
};

export type RecallScript = {
  id: string;
  /** Player-facing name. Show only after this recall is unlocked. */
  title: string;
  /** Scene the isolated playback starts at. */
  start: string;
  /** Stop before entering this scene. Omit to play until an ending. */
  end?: string;
  vars?: Record<string, VarValue>;
  /** Unlock when this CG asset has been seen. */
  unlockCg?: string;
  /** Unlock when this ending id has been reached. */
  unlockEnding?: string;
};

export type WorkManifest = {
  schemaVersion: number;
  contentVersion: number;
  id: string;
  title: string;
  language: string;
  start: string;
  characters: CharacterDecl[];
  variables: VariableDecl[];
  /** Paths relative to the work directory. */
  scenes: string[];
  /** Optional scene recalls. Absence means the work defines none. */
  recalls?: RecallScript[];
  /** When true, advertise offline after shell+assets cached. */
  offlineReady?: boolean;
  /** Optional title-screen BGM asset id; omitted works stay silent on title. */
  titleBgm?: string;
};

export type Scene = {
  id: string;
  instructions: Instruction[];
};

export type AssetRecord = {
  id: string;
  /** Path relative to the work directory. */
  path: string;
  type: string;
  approved: boolean;
  /** CC0-1.0 or CC-BY-*. CC-BY must be credited on screen. */
  license?: string;
  credit?: string;
  character?: string;
  /** near / far, or an expr id. */
  position?: string;
  expr?: string;
};

export type Work = {
  manifest: WorkManifest;
  scenes: Scene[];
};

export type ActorSlot = {
  id: string;
  expr: string | null;
  position: string | null;
};

export type Line =
  | { kind: "narration"; text: string }
  | { kind: "dialogue"; speaker?: string; text: string };

export type PlayState = {
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
  choices: ChoiceOption[] | null;
  ending: { id: string } | null;
  waiting: boolean;
};

export type Action = { type: "advance" } | { type: "choose"; index: number };

export type CheckIssue = {
  level: "error" | "warning";
  work?: string;
  scene?: string;
  instruction?: number;
  file?: string;
  message: string;
};
