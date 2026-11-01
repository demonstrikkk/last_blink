import { MORROW_TACTICS, morrowPlanSchema, type MorrowPlan, type MorrowTactic } from '../contracts/loop.js';
import { CONTRACT_VERSION } from '../contracts/primitives.js';
import { hashCanonical } from '../core/hash.js';
import type { BranchSummary } from '../session/branching.js';

/**
 * A reproducible, reinforcement-learning-inspired adversary policy.
 *
 * This is not a trained model. It is a bounded scoring policy: tactics that
 * failed in earlier loops lose weight, tactics that kept the case unresolved
 * gain a little, and target selection follows the evidence the investigator is
 * actually chasing. The same inputs always produce the same plan, which is what
 * makes the adversary testable.
 */

export interface AdversaryLoopRecord {
  readonly loopIndex: number;
  readonly tactic: MorrowTactic;
  readonly targets: readonly string[];
  readonly outcome: 'catastrophe' | 'averted' | 'unknown';
}

export interface AdversaryInput {
  readonly sessionId: string;
  readonly branchId: string;
  readonly loopIndex: number;
  readonly tick: number;
  readonly seed: string;
  readonly roster: readonly string[];
  /** Evidence ids Aster is currently pursuing, strongest first. */
  readonly focus: readonly string[];
  readonly collected: readonly string[];
  readonly priorLoops: readonly AdversaryLoopRecord[];
  readonly provider?: MorrowPlan['provider'];
}

export const CITY_ROSTER = [
  'npc_sable',
  'npc_ivo',
  'npc_lyra',
  'npc_vane',
  'npc_castor',
  'npc_mara',
  'npc_ren',
  'npc_nia',
  'npc_vale',
  'npc_orin',
  'npc_kade',
  'npc_suri',
  'npc_tamsin',
] as const;

/** Which witnesses MORROW prefers to blur when Aster chases a given record. */
const EVIDENCE_AFFINITY: Readonly<Record<string, readonly string[]>> = {
  ward_dispatch: ['npc_ivo', 'npc_sable'],
  relay_7_log: ['npc_sable', 'npc_ren'],
  archive_record: ['npc_vale', 'npc_ren'],
  surveillance_frequency: ['npc_lyra', 'npc_sable'],
  clue_guestbook: ['npc_mara', 'npc_vane'],
  freight_log: ['npc_vane', 'npc_castor'],
  depot_terminal: ['npc_castor', 'npc_ren'],
  human_cost: ['npc_nia', 'npc_vale'],
  vendor_testimony: ['npc_ivo', 'npc_lyra'],
};

const INTERFERENCE_FOR_TACTIC: Readonly<Record<MorrowTactic, MorrowPlan['targets'][number]['interference']>> = {
  discredit_witness: 'altered_recollection',
  redirect_attention: 'misattributed_detail',
  seed_rumour: 'seeded_rumour',
  erase_detail: 'temporary_blank',
  reinforce_confidence: 'skewed_timestamp',
};

const MIN_TACTIC_WEIGHT = 0.25;
const MAX_TACTIC_WEIGHT = 2;

function deterministicJitter(key: string): number {
  const hash = hashCanonical({ key });
  return Number.parseInt(hash.slice(0, 4), 16) / 0xffff;
}

/**
 * Tactic weights start neutral. A catastrophe (the case was not resolved by
 * 18:00) is a success for MORROW. An averted catastrophe is a failure: the
 * tactic is discounted so the next loop tries something else.
 */
export function tacticWeights(priorLoops: readonly AdversaryLoopRecord[]): Record<MorrowTactic, number> {
  const weights = Object.fromEntries(
    MORROW_TACTICS.map((tactic) => [tactic, 1]),
  ) as Record<MorrowTactic, number>;

  for (const record of priorLoops) {
    const delta = record.outcome === 'averted' ? -0.35 : record.outcome === 'catastrophe' ? 0.15 : 0;
    weights[record.tactic] = Math.max(
      MIN_TACTIC_WEIGHT,
      Math.min(MAX_TACTIC_WEIGHT, weights[record.tactic] + delta),
    );
  }
  return weights;
}

export function buildMorrowPlan(input: AdversaryInput): MorrowPlan {
  const weights = tacticWeights(input.priorLoops);
  const tactics = [...MORROW_TACTICS].sort((left, right) => {
    const byWeight = weights[right] - weights[left];
    if (byWeight !== 0) return byWeight;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const tactic = tactics[0] ?? 'discredit_witness';

  const lastLoop = [...input.priorLoops]
    .filter((record) => record.loopIndex === input.loopIndex - 1)
    .at(-1);
  const previouslyTargeted = new Set(lastLoop?.targets ?? []);

  const focus = [...new Set(input.focus)].slice(0, 4);
  const targetScores = input.roster
    .filter((npcId) => npcId !== 'npc_moth')
    .map((npcId) => {
      let score = 0.5;
      for (const [index, evidenceId] of focus.entries()) {
        if ((EVIDENCE_AFFINITY[evidenceId] ?? []).includes(npcId)) {
          score += 1.2 - index * 0.2;
        }
      }
      // MORROW varies its targets; it does not repeat the same minds blindly.
      if (!previouslyTargeted.has(npcId)) score += 0.35;
      if (previouslyTargeted.has(npcId) && lastLoop?.outcome === 'averted') score -= 0.6;
      // A witness whose claim Aster already corroborated is a poor target.
      if (
        (npcId === 'npc_ivo' && input.collected.includes('ward_dispatch')) ||
        (npcId === 'npc_sable' && input.collected.includes('relay_7_log'))
      ) {
        score -= 0.25;
      }
      score += deterministicJitter(`${input.seed}:${input.loopIndex}:${npcId}`) * 0.2;
      return { npcId, score };
    })
    .sort((left, right) => {
      const byScore = right.score - left.score;
      if (byScore !== 0) return byScore;
      return left.npcId < right.npcId ? -1 : left.npcId > right.npcId ? 1 : 0;
    });

  const targets = targetScores.slice(0, 3).map((entry, index) => ({
    npcId: entry.npcId as MorrowPlan['targets'][number]['npcId'],
    interference: INTERFERENCE_FOR_TACTIC[tactic],
    durationMinutes: 120 + input.loopIndex * 15 + index * 20,
    focusEvidenceId: focus[0] ?? null,
  }));

  const planId = `plan_${hashCanonical({
    sessionId: input.sessionId,
    loopIndex: input.loopIndex,
    tactic,
    targets: targets.map((target) => target.npcId),
  }).slice(0, 12)}`;

  return morrowPlanSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    planId,
    sessionId: input.sessionId,
    branchId: input.branchId,
    loopIndex: input.loopIndex,
    tactic,
    targets,
    rationale:
      focus.length > 0
        ? `Loop ${input.loopIndex}: ${tactic.replaceAll('_', ' ')} around ${focus[0]}; ${targets.length} minds selected.`
        : `Loop ${input.loopIndex}: ${tactic.replaceAll('_', ' ')}; ${targets.length} minds selected from the street roster.`,
    predictedFocus: focus.slice(0, 3),
    createdAtTick: input.tick,
    provider: input.provider ?? 'deterministic',
  });
}

/** Convert retained branches into the compact history the policy consumes. */
export function priorLoopsFromBranches(branches: readonly BranchSummary[]): AdversaryLoopRecord[] {
  return branches
    .filter((branch) => branch.morrowTargets.length > 0)
    .map((branch) => ({
      loopIndex: branch.loopIndex,
      tactic: (branch.morrowTactic ?? 'discredit_witness') as MorrowTactic,
      targets: branch.morrowTargets,
      outcome:
        branch.catastropheStatus === 'averted'
          ? 'averted'
          : branch.catastropheStatus === 'occurred'
            ? 'catastrophe'
            : 'unknown',
    }));
}
