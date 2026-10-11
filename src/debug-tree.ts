/** Puppy #74: DEBUG MODE branch tree + one-click jump (pure, no DOM). */

import { evalCondition, initialState, reduce } from "./reduce.ts";
import type {
  Condition,
  PlayState,
  Scene,
  VarValue,
  Work,
} from "./types.ts";

export type DebugEdgeKind = "choice" | "jump" | "fallthrough";

export type DebugEdge = {
  /** Destination scene id. */
  to: string;
  kind: DebugEdgeKind;
  /** Choice option text, or short jump note. */
  label: string;
  /** Sets applied on this scene before taking this edge (same-scene prefix). */
  sets: { var: string; value: VarValue }[];
  /** Present when the jump instruction had a `when` condition. */
  when?: Condition;
};

export type DebugNode = {
  sceneId: string;
  /** True when the scene contains a choice instruction. */
  hasChoice: boolean;
  /** Ending id if this scene hits an ending instruction. */
  endingId: string | null;
  /** All set instructions in the scene (order preserved). */
  sets: { var: string; value: VarValue }[];
  edges: DebugEdge[];
  /** True when this node is kept in the compact tree (hub). */
  hub: boolean;
};

export type DebugTree = {
  start: string;
  nodes: Map<string, DebugNode>;
  /** Hub scene ids in BFS order from start (for stable UI). */
  hubOrder: string[];
};

export type DebugTreeRow = {
  depth: number;
  sceneId: string;
  /** How we arrived (choice/jump label); empty for root. */
  via: string;
  sets: { var: string; value: VarValue }[];
  endingId: string | null;
  hasChoice: boolean;
  /** Collapsed linear scenes between previous hub and this one. */
  skipped: number;
};

/** Puppy: build per-scene graph from story JSON (choice→jump, set, ending). */
export function buildDebugTree(work: Work): DebugTree {
  const nodes = new Map<string, DebugNode>();
  for (const scene of work.scenes) {
    nodes.set(scene.id, analyzeScene(scene));
  }

  const hubs = new Set<string>();
  hubs.add(work.manifest.start);
  for (const node of nodes.values()) {
    if (node.hasChoice || node.endingId || node.sets.length > 0) {
      hubs.add(node.sceneId);
    }
    for (const edge of node.edges) {
      if (edge.kind === "choice") hubs.add(edge.to);
    }
  }
  for (const node of nodes.values()) {
    node.hub = hubs.has(node.sceneId);
  }

  const hubOrder: string[] = [];
  const seen = new Set<string>();
  const queue: string[] = [work.manifest.start];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.get(id);
    if (!node) continue;
    if (node.hub) hubOrder.push(id);
    for (const edge of node.edges) {
      if (!seen.has(edge.to)) queue.push(edge.to);
    }
  }
  // Orphan hubs (unreachable) still listed for DEBUG completeness.
  for (const id of hubs) {
    if (!seen.has(id)) hubOrder.push(id);
  }

  return { start: work.manifest.start, nodes, hubOrder };
}

/**
 * Puppy: flatten hubs into indented rows for the panel.
 * Linear non-hub scenes between hubs are collapsed (`skipped` count).
 */
export function flattenDebugTree(tree: DebugTree, filter = ""): DebugTreeRow[] {
  const needle = filter.trim().toLowerCase();
  const rows: DebugTreeRow[] = [];
  const visited = new Set<string>();

  function walk(sceneId: string, depth: number, via: string, skipped: number): void {
    const node = tree.nodes.get(sceneId);
    if (!node) return;

    if (!node.hub) {
      // Keep walking a unique primary edge to the next hub; count skip.
      if (visited.has(sceneId)) return;
      visited.add(sceneId);
      const next = primaryEdge(node);
      if (!next) return;
      walk(next.to, depth, via || next.label, skipped + 1);
      return;
    }

    if (visited.has(sceneId)) return;
    visited.add(sceneId);

    const row: DebugTreeRow = {
      depth,
      sceneId,
      via,
      sets: node.sets,
      endingId: node.endingId,
      hasChoice: node.hasChoice,
      skipped,
    };
    if (!needle || rowMatches(row, needle, node)) {
      rows.push(row);
    }

    if (node.hasChoice) {
      for (const edge of node.edges.filter((e) => e.kind === "choice")) {
        walk(edge.to, depth + 1, edge.label, 0);
      }
      return;
    }

    for (const edge of node.edges) {
      walk(edge.to, depth + (edge.kind === "choice" ? 1 : depth > 0 ? 0 : 0), edge.label, 0);
    }
  }

  walk(tree.start, 0, "", 0);
  // Unreachable hubs (filter only).
  if (needle) {
    for (const id of tree.hubOrder) {
      if (visited.has(id)) continue;
      const node = tree.nodes.get(id);
      if (!node) continue;
      const row: DebugTreeRow = {
        depth: 0,
        sceneId: id,
        via: "(unreachable)",
        sets: node.sets,
        endingId: node.endingId,
        hasChoice: node.hasChoice,
        skipped: 0,
      };
      if (rowMatches(row, needle, node)) rows.push(row);
    }
  }
  return rows;
}

/**
 * Puppy: path-BFS from start; accumulate `set` along the way; evaluate jump `when`
 * with accumulated vars. First reach wins (shortest scene-hop path).
 * Returns a PlayState primed at scene start then advanced to the first beat.
 */
export function jumpToScene(work: Work, sceneId: string): PlayState | null {
  if (!work.scenes.some((s) => s.id === sceneId)) return null;
  const vars = findVarsAtScene(work, sceneId);
  if (!vars) return null;

  const base = initialState(work);
  const primed: PlayState = {
    ...base,
    sceneId,
    index: 0,
    vars: { ...vars },
    background: null,
    actors: [],
    cg: null,
    audio: { bgm: null, se: null, ambience: null },
    line: null,
    choices: null,
    ending: null,
    waiting: false,
  };
  // Advance once so dialogue/choice/ending is waiting (same as fresh scene entry).
  return reduce(work, primed, { type: "advance" });
}

/** Puppy: vars at entry to `sceneId` along a shortest reachable path, or null. */
export function findVarsAtScene(
  work: Work,
  sceneId: string,
): Record<string, VarValue> | null {
  const startVars = initialState(work).vars;
  if (sceneId === work.manifest.start) return { ...startVars };

  type Frame = { sceneId: string; vars: Record<string, VarValue> };
  const queue: Frame[] = [{ sceneId: work.manifest.start, vars: { ...startVars } }];
  // Visit scene once with first (shortest) var snapshot — DEBUG jump is best-effort.
  const visited = new Set<string>();

  while (queue.length > 0) {
    const frame = queue.shift()!;
    if (visited.has(frame.sceneId)) continue;
    visited.add(frame.sceneId);

    const scene = work.scenes.find((s) => s.id === frame.sceneId);
    if (!scene) continue;

    const { vars, outs } = simulateScene(scene, frame.vars);
    for (const out of outs) {
      if (out.to === sceneId) {
        return { ...vars };
      }
      if (!visited.has(out.to)) {
        queue.push({ sceneId: out.to, vars: { ...vars } });
      }
    }
  }
  return null;
}

function analyzeScene(scene: Scene): DebugNode {
  const sets: { var: string; value: VarValue }[] = [];
  const edges: DebugEdge[] = [];
  let hasChoice = false;
  let endingId: string | null = null;
  // Sets that apply before the next outgoing edge in instruction order.
  let pendingSets: { var: string; value: VarValue }[] = [];

  for (const instruction of scene.instructions) {
    switch (instruction.kind) {
      case "set": {
        const entry = { var: instruction.var, value: instruction.value };
        sets.push(entry);
        pendingSets.push(entry);
        break;
      }
      case "choice": {
        hasChoice = true;
        for (const option of instruction.options) {
          edges.push({
            to: option.jump,
            kind: "choice",
            label: option.text,
            sets: [...pendingSets],
          });
        }
        pendingSets = [];
        break;
      }
      case "jump": {
        edges.push({
          to: instruction.to,
          kind: "jump",
          label: instruction.when ? `jump?→${instruction.to}` : `→${instruction.to}`,
          sets: [...pendingSets],
          when: instruction.when,
        });
        pendingSets = [];
        break;
      }
      case "ending": {
        endingId = instruction.id;
        pendingSets = [];
        break;
      }
      default:
        break;
    }
  }

  return {
    sceneId: scene.id,
    hasChoice,
    endingId,
    sets,
    edges,
    hub: false,
  };
}

function simulateScene(
  scene: Scene,
  startVars: Record<string, VarValue>,
): {
  vars: Record<string, VarValue>;
  outs: { to: string }[];
} {
  let vars = { ...startVars };
  const outs: { to: string }[] = [];

  for (const instruction of scene.instructions) {
    if (instruction.kind === "set") {
      vars = { ...vars, [instruction.var]: instruction.value };
      continue;
    }
    if (instruction.kind === "choice") {
      for (const option of instruction.options) {
        outs.push({ to: option.jump });
      }
      return { vars, outs };
    }
    if (instruction.kind === "jump") {
      const take =
        instruction.when === undefined || evalCondition(instruction.when, vars);
      if (take) {
        outs.push({ to: instruction.to });
        return { vars, outs };
      }
      continue;
    }
    if (instruction.kind === "ending") {
      return { vars, outs };
    }
  }
  return { vars, outs };
}

function primaryEdge(node: DebugNode): DebugEdge | null {
  const choice = node.edges.find((e) => e.kind === "choice");
  if (choice) return choice;
  const jump = node.edges.find((e) => e.kind === "jump" && !e.when);
  if (jump) return jump;
  return node.edges[0] ?? null;
}

function rowMatches(row: DebugTreeRow, needle: string, node: DebugNode): boolean {
  if (row.sceneId.toLowerCase().includes(needle)) return true;
  if (row.via.toLowerCase().includes(needle)) return true;
  if (row.endingId?.toLowerCase().includes(needle)) return true;
  for (const set of node.sets) {
    if (set.var.toLowerCase().includes(needle)) return true;
  }
  return false;
}

/** Puppy: count choice instructions across the work (acceptance ~33 for xingkong). */
export function countChoiceInstructions(work: Work): number {
  let n = 0;
  for (const scene of work.scenes) {
    for (const instruction of scene.instructions) {
      if (instruction.kind === "choice") n += 1;
    }
  }
  return n;
}
