import type {
  Branch,
  BranchId,
  Fact,
  GameEvent,
  GameEventId,
  GameState,
  JsonValue,
} from '../contracts/index.js';
import { hashCanonical } from '../core/hash.js';

/**
 * Stage 6 branch semantics, kept pure so the session only has to hold the
 * runtime containers (ADR 0013, ADR 0014).
 *
 * A fork always starts from an anchor checkpoint, never from "now", so a child
 * timeline inherits exactly the facts, choices and anchors that existed at that
 * checkpoint. Nothing discovered later on the parent can leak across. The one
 * deliberate exception is scar memory: facts under `scar.*` cross the fork by
 * explicit allowlist.
 */
export const SCAR_FACT_PREFIX = 'scar.';

export function isScarFactKey(key: string): boolean {
  return key.startsWith(SCAR_FACT_PREFIX);
}

export interface BranchCheckpoint {
  readonly branchId: BranchId;
  readonly anchorId: string;
  readonly stateVersion: number;
  readonly tick: number;
  readonly eventSequenceNo: number;
  readonly stateHash: string;
}

export interface BranchSummary {
  readonly branchId: BranchId;
  readonly label: string;
  readonly timelineIndex: number;
  readonly parentBranchId: BranchId | null;
  readonly status: Branch['status'];
  readonly stateVersion: number;
  readonly tick: number;
  readonly stateHash: string;
  readonly endingId: string | null;
  readonly facts: number;
  readonly evidence: number;
  readonly choices: number;
  readonly anchors: number;
  readonly checkpoint: BranchCheckpoint | null;
  readonly eventCount: number;
  readonly ownEventCount: number;
}

export interface FactDifference {
  readonly key: string;
  readonly base: JsonValue | null;
  readonly other: JsonValue | null;
}

export interface ChoiceDifference {
  readonly nodeId: string;
  readonly baseOptionId: string | null;
  readonly otherOptionId: string | null;
  readonly divergent: boolean;
}

export interface BranchComparison {
  readonly base: BranchSummary;
  readonly other: BranchSummary;
  readonly commonAncestorBranchId: BranchId | null;
  readonly forkPoint: BranchCheckpoint | null;
  readonly sharedFactKeys: readonly string[];
  readonly onlyInBase: readonly string[];
  readonly onlyInOther: readonly string[];
  readonly changedFacts: readonly FactDifference[];
  readonly choices: readonly ChoiceDifference[];
  readonly endings: { readonly base: string | null; readonly other: string | null };
  readonly events: {
    readonly shared: number;
    readonly baseOnly: number;
    readonly otherOnly: number;
  };
  readonly scars: { readonly base: readonly string[]; readonly other: readonly string[] };
}

export interface BranchRuntimeView {
  readonly branch: Branch;
  readonly state: GameState;
  readonly hash: string;
  readonly history: readonly GameState[];
  readonly events: readonly GameEvent[];
}

/** Every branch from the root down to `branchId`, inclusive. */
export function ancestryChain(branches: readonly Branch[], branchId: BranchId): Branch[] {
  const byId = new Map(branches.map((branch) => [branch.branchId, branch]));
  const chain: Branch[] = [];
  let cursor: Branch | undefined = byId.get(branchId);
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor.branchId)) throw new Error('branch ancestry contains a cycle');
    seen.add(cursor.branchId);
    chain.unshift(cursor);
    cursor = cursor.parentBranchId ? byId.get(cursor.parentBranchId) : undefined;
  }
  return chain;
}

/**
 * Re-scope a state onto another branch. Inherited facts, choices and anchors
 * keep their ids, provenance refs and source event ids; only the owning branch
 * changes, because state-level entities must belong to the state's branch
 * (gameStateSchema). Shared ancestry is still visible through sourceEventId.
 */
export function rebaseState(state: GameState, branch: Branch, branchId: BranchId): GameState {
  const facts: Record<string, Fact> = {};
  for (const [key, fact] of Object.entries(state.facts)) {
    facts[key] = fact.branchId === branchId ? fact : { ...fact, branchId };
  }

  return {
    ...state,
    branchId,
    facts,
    choices: state.choices.map((choice) =>
      choice.branchId === branchId ? choice : { ...choice, branchId },
    ),
    anchors: state.anchors.map((anchor) =>
      anchor.branchId === branchId ? anchor : { ...anchor, branchId },
    ),
    branches: [...state.branches.filter((item) => item.branchId !== branchId), branch],
  };
}

/**
 * Facts that survive a BLINK. A scar is any `scar.*` fact asserted on the
 * parent after the checkpoint; the allowlist is the namespace, and nothing
 * else crosses.
 */
export function collectScars(
  parentState: GameState,
  postCheckpointEventIds: ReadonlySet<GameEventId>,
): Fact[] {
  return Object.values(parentState.facts)
    .filter((fact) => isScarFactKey(fact.key))
    .filter((fact) => postCheckpointEventIds.has(fact.sourceEventId))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Ancestor events up to the checkpoint, then this branch's own events. */
export function lineageEvents(
  branch: Branch,
  ancestors: readonly Branch[],
  logs: ReadonlyMap<BranchId, readonly GameEvent[]>,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (const ancestor of ancestors) {
    const own = logs.get(ancestor.branchId) ?? [];
    if (ancestor.branchId === branch.branchId) {
      events.push(...own);
    } else {
      const cutoff = branch.forkedAtEventSequenceNo;
      events.push(...own.filter((event) => cutoff === null || event.sequenceNo < cutoff));
    }
  }
  return events;
}

export function checkpointOf(branch: Branch): BranchCheckpoint | null {
  if (
    branch.parentBranchId === null ||
    branch.forkedAtAnchorId === null ||
    branch.forkedAtStateVersion === null ||
    branch.forkedAtEventSequenceNo === null ||
    branch.forkedAtStateHash === null ||
    branch.forkedAtTick === null
  ) {
    return null;
  }
  return {
    branchId: branch.parentBranchId,
    anchorId: branch.forkedAtAnchorId,
    stateVersion: branch.forkedAtStateVersion,
    tick: branch.forkedAtTick,
    eventSequenceNo: branch.forkedAtEventSequenceNo,
    stateHash: branch.forkedAtStateHash,
  };
}

export function summariseBranch(
  runtime: BranchRuntimeView,
  ancestors: readonly Branch[],
  logs: ReadonlyMap<BranchId, readonly GameEvent[]>,
): BranchSummary {
  const { branch, state } = runtime;
  return {
    branchId: branch.branchId,
    label: branch.label,
    timelineIndex: branch.timelineIndex,
    parentBranchId: branch.parentBranchId,
    status: branch.status,
    stateVersion: state.stateVersion,
    tick: state.tick,
    stateHash: runtime.hash,
    endingId: state.endingId,
    facts: Object.keys(state.facts).length,
    evidence: Object.keys(state.facts).filter((key) => key.startsWith('evidence.')).length,
    choices: state.choices.length,
    anchors: state.anchors.length,
    checkpoint: checkpointOf(branch),
    eventCount: lineageEvents(branch, ancestors, logs).length,
    ownEventCount: runtime.events.length,
  };
}

function lowestCommonAncestor(
  baseChain: readonly Branch[],
  otherChain: readonly Branch[],
): Branch | null {
  const otherIds = new Set(otherChain.map((branch) => branch.branchId));
  for (let index = baseChain.length - 1; index >= 0; index -= 1) {
    const candidate = baseChain[index];
    if (candidate && otherIds.has(candidate.branchId)) return candidate;
  }
  return null;
}

export function compareBranchStates(
  base: BranchRuntimeView,
  other: BranchRuntimeView,
  context: {
    readonly baseChain: readonly Branch[];
    readonly otherChain: readonly Branch[];
    readonly baseEvents: readonly GameEvent[];
    readonly otherEvents: readonly GameEvent[];
    readonly logs: ReadonlyMap<BranchId, readonly GameEvent[]>;
  },
): BranchComparison {
  if (hashCanonical(base.state) !== base.hash) {
    throw new Error('base branch snapshot hash does not match its state');
  }
  if (hashCanonical(other.state) !== other.hash) {
    throw new Error('other branch snapshot hash does not match its state');
  }

  const ancestor = lowestCommonAncestor(context.baseChain, context.otherChain);
  let forkPoint: BranchCheckpoint | null = null;
  if (ancestor) {
    const ancestorIndex = context.otherChain.findIndex(
      (branch) => branch.branchId === ancestor.branchId,
    );
    const baseIndex = context.baseChain.findIndex(
      (branch) => branch.branchId === ancestor.branchId,
    );
    const descendant =
      context.otherChain[ancestorIndex + 1] ?? context.baseChain[baseIndex + 1] ?? null;
    forkPoint = descendant ? checkpointOf(descendant) : null;
  }

  const baseKeys = new Set(Object.keys(base.state.facts));
  const otherKeys = new Set(Object.keys(other.state.facts));
  const sharedFactKeys: string[] = [];
  const onlyInBase: string[] = [];
  const onlyInOther: string[] = [];
  const changedFacts: FactDifference[] = [];

  for (const key of [...baseKeys].sort()) {
    if (!otherKeys.has(key)) {
      onlyInBase.push(key);
      continue;
    }
    const baseValue = base.state.facts[key]?.value ?? null;
    const otherValue = other.state.facts[key]?.value ?? null;
    if (JSON.stringify(baseValue) === JSON.stringify(otherValue)) {
      sharedFactKeys.push(key);
    } else {
      changedFacts.push({ key, base: baseValue, other: otherValue });
    }
  }
  for (const key of [...otherKeys].sort()) {
    if (!baseKeys.has(key)) onlyInOther.push(key);
  }

  const nodeIds = [
    ...new Set([
      ...base.state.choices.map((choice) => choice.nodeId),
      ...other.state.choices.map((choice) => choice.nodeId),
    ]),
  ].sort();
  const choices: ChoiceDifference[] = nodeIds.map((nodeId) => {
    const baseOptionId =
      base.state.choices.find((choice) => choice.nodeId === nodeId)?.optionId ?? null;
    const otherOptionId =
      other.state.choices.find((choice) => choice.nodeId === nodeId)?.optionId ?? null;
    return { nodeId, baseOptionId, otherOptionId, divergent: baseOptionId !== otherOptionId };
  });

  const baseEventIds = new Set(context.baseEvents.map((event) => event.eventId));
  const otherEventIds = new Set(context.otherEvents.map((event) => event.eventId));
  const shared = [...baseEventIds].filter((id) => otherEventIds.has(id)).length;

  const scarKeys = (state: GameState): string[] =>
    Object.keys(state.facts).filter(isScarFactKey).sort();

  return {
    base: summariseBranch(base, context.baseChain, context.logs),
    other: summariseBranch(other, context.otherChain, context.logs),
    commonAncestorBranchId: ancestor?.branchId ?? null,
    forkPoint,
    sharedFactKeys,
    onlyInBase,
    onlyInOther,
    changedFacts,
    choices,
    endings: { base: base.state.endingId, other: other.state.endingId },
    events: {
      shared,
      baseOnly: baseEventIds.size - shared,
      otherOnly: otherEventIds.size - shared,
    },
    scars: { base: scarKeys(base.state), other: scarKeys(other.state) },
  };
}
