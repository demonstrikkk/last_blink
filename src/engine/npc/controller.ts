import {
  CONTRACT_VERSION,
  memoryRecordSchema,
  npcDecisionProposalSchema,
  type ActionResult,
  type ActorId,
  type BranchId,
  type MemoryRecord,
  type NpcDecisionProposal,
  type NpcDefinition,
  type NpcId,
  type NpcObservation,
} from '../contracts/index.js';
import { hashCanonical } from '../core/hash.js';
import type { ClockPort } from '../session/ports.js';
import type { GameSession } from '../session/gameSession.js';
import type { NpcMemoryPort } from './memory.js';
import { InMemoryNpcMemory } from './memory.js';
import { buildNpcObservation } from './observation.js';
import {
  createFallbackProposal,
  createIvoPolicy,
  createSablePolicy,
  type NpcPolicy,
} from './policy.js';
import { STAGE9_NPC_DEFINITIONS } from '../../content/npcContent.js';

export interface NpcCognitionTurn {
  readonly observation: NpcObservation;
  readonly proposal: NpcDecisionProposal | null;
  readonly result: ActionResult | null;
  readonly fallback: boolean;
  readonly fallbackReason: 'policy_exception' | 'invalid_output' | null;
  readonly memory: MemoryRecord | null;
}

export interface NpcRunOptions {
  readonly force?: boolean;
}

export interface NpcCognitionControllerOptions {
  readonly policies?: readonly NpcPolicy[];
  readonly definitions?: Record<string, NpcDefinition>;
  readonly memory?: NpcMemoryPort;
  readonly clock?: ClockPort;
}

const SYSTEM_CLOCK: ClockPort = { nowIso: () => new Date().toISOString() };

export class NpcCognitionController {
  private readonly policies = new Map<string, NpcPolicy>();
  private readonly definitions: Record<string, NpcDefinition>;
  private readonly memory: NpcMemoryPort;
  private readonly clock: ClockPort;
  private readonly evaluatedTicks = new Set<string>();

  constructor(
    private readonly session: GameSession,
    options: NpcCognitionControllerOptions = {},
  ) {
    const configured = options.policies ?? [createSablePolicy(), createIvoPolicy()];
    for (const policy of configured) this.policies.set(policy.npcId, policy);
    this.definitions = options.definitions ?? STAGE9_NPC_DEFINITIONS;
    this.memory = options.memory ?? new InMemoryNpcMemory();
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  observe(npcId: NpcId): NpcObservation {
    return buildNpcObservation(this.session, {
      definition: this.definitionFor(npcId),
      nowIso: () => this.clock.nowIso(),
    });
  }

  run(npcId: NpcId, options: NpcRunOptions = {}): NpcCognitionTurn | null {
    const definition = this.definitionFor(npcId);
    const policy = this.policies.get(npcId);
    if (!policy) throw new Error(`no Stage 9 policy registered for ${npcId}`);

    const observation = this.observe(npcId);
    const tickKey = `${observation.branchId}\u0000${npcId}\u0000${observation.tick}`;
    if (!options.force && this.evaluatedTicks.has(tickKey)) return null;

    let proposal: NpcDecisionProposal | null = null;
    let fallback = false;
    let fallbackReason: NpcCognitionTurn['fallbackReason'] = null;

    try {
      const output = policy.evaluate(
        observation,
        this.memory.list(npcId, observation.branchId),
      );
      if (output === null) {
        return {
          observation,
          proposal: null,
          result: null,
          fallback: false,
          fallbackReason: null,
          memory: null,
        };
      }
      const parsed = npcDecisionProposalSchema.safeParse(output);
      if (parsed.success) {
        proposal = parsed.data;
      } else {
        fallback = true;
        fallbackReason = 'invalid_output';
      }
    } catch {
      fallback = true;
      fallbackReason = 'policy_exception';
    }

    if (!proposal) {
      proposal = createFallbackProposal(
        observation,
        definition,
        fallbackReason ?? 'unknown',
      );
    }

    this.evaluatedTicks.add(tickKey);

    const result = this.session.dispatch({
      actionType: 'npc.propose',
      actorId: definition.npcId as unknown as ActorId,
      params: {
        proposal,
        observationHash: observation.perceptionHash,
        basedOnStateVersion: observation.stateVersion,
        fallbackReason,
      },
    });

    const memory = this.recordMemory(observation, proposal, result, fallback);

    return {
      observation,
      proposal,
      result,
      fallback,
      fallbackReason,
      memory,
    };
  }

  recentMemory(npcId: NpcId, branchId?: BranchId): readonly MemoryRecord[] {
    return this.memory.list(npcId, branchId ?? this.session.getActiveBranchId());
  }

  reset(branchId?: BranchId): void {
    if (branchId) {
      const prefix = `${branchId}\u0000`;
      for (const key of [...this.evaluatedTicks]) {
        if (key.startsWith(prefix)) this.evaluatedTicks.delete(key);
      }
      return;
    }
    this.evaluatedTicks.clear();
  }

  private definitionFor(npcId: NpcId): NpcDefinition {
    const definition = this.definitions[npcId];
    if (!definition) throw new Error(`unknown NPC ${npcId}`);
    return definition;
  }

  private recordMemory(
    observation: NpcObservation,
    proposal: NpcDecisionProposal,
    result: ActionResult,
    fallback: boolean,
  ): MemoryRecord {
    const memoryId = `mem_${hashCanonical({
      proposalId: proposal.proposalId,
      status: result.status,
      branchId: observation.branchId,
      tick: observation.tick,
      fallback,
    })}`;

    const record = memoryRecordSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      memoryId,
      npcId: proposal.npcId,
      sessionId: proposal.sessionId,
      branchId: proposal.branchId,
      kind: 'episodic',
      content: `${result.status}: ${proposal.rationale}`,
      provenance: {
        sourceEventIds: [...result.eventIds],
        sourceMemoryIds: [],
      },
      createdAtTick: observation.tick,
      importance: fallback ? 0.3 : 0.5,
      expiresAtTick: null,
      visibility: 'private',
      modelManifestId: null,
      tags: fallback
        ? ['fallback_proposal', result.status]
        : ['npc_proposal', result.status],
    });

    return this.memory.append(record);
  }
}
