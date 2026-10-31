import { useState } from 'react';
import {
  type NpcCognitionController,
  type NpcCognitionTurn,
  type NpcDefinition,
  type BranchId,
} from '../engine/index.js';

interface NpcPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly controller: NpcCognitionController;
  readonly definitions: readonly NpcDefinition[];
  readonly activeBranchId: string;
}

type PanelState = NpcCognitionTurn | 'skip' | { readonly error: string };

export function NpcPanel({
  open,
  onClose,
  controller,
  definitions,
  activeBranchId,
}: NpcPanelProps) {
  const [turns, setTurns] = useState<Record<string, PanelState>>({});

  if (!open) return null;

  const evaluate = (definition: NpcDefinition, branchId: string): void => {
    try {
      const turn = controller.run(definition.npcId);
      setTurns((current) => ({
        ...current,
        [`${branchId}:${definition.npcId}`]: turn ?? 'skip',
      }));
    } catch (cause) {
      setTurns((current) => ({
        ...current,
        [`${branchId}:${definition.npcId}`]: {
          error: cause instanceof Error ? cause.message : String(cause),
        },
      }));
    }
  };

  return (
    <div className="echo-layer">
      <button type="button" className="ledger-backdrop" aria-label="Close NPC cognition" onClick={onClose} />
      <aside className="echo-panel npc-panel" role="dialog" aria-modal="true" aria-labelledby="npc-title">
        <header className="ledger-head">
          <div>
            <p className="micro">NPC COGNITION / SCRIPTED</p>
            <h2 id="npc-title">What Sable and Ivo can decide</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close NPC cognition">
            x
          </button>
        </header>

        <p className="echo-intro">
          Each NPC sees only the fact prefixes its definition permits. Stage 9
          proposals are deterministic no-ops: they are recorded by the engine and
          kept in branch-scoped memory, but they never write story facts.
        </p>

        {definitions.map((definition) => {
          const key = `${activeBranchId}:${definition.npcId}`;
          const state = turns[key];
          const memory = controller.recentMemory(definition.npcId, activeBranchId as BranchId);
          return (
            <section key={definition.npcId} className="npc-card" aria-labelledby={`npc-${definition.npcId}`}>
              <div className="npc-card-head">
                <div>
                  <h3 id={`npc-${definition.npcId}`}>{definition.displayName}</h3>
                  <p className="mono npc-role">{definition.role}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => evaluate(definition, activeBranchId)}
                >
                  Evaluate
                </button>
              </div>

              <p className="mono npc-scope">
                SEES {definition.permissions.observableFactPrefixes.join(' / ')}
              </p>

              {state === undefined ? (
                <p className="echo-empty">Not evaluated on this timeline yet.</p>
              ) : state === 'skip' ? (
                <p className="echo-empty">Already evaluated this NPC at this tick.</p>
              ) : 'error' in state ? (
                <p className="echo-error">{state.error}</p>
              ) : state.proposal === null ? (
                <p className="echo-empty">No proposal is warranted by the current observation.</p>
              ) : (
                <div className="npc-proposal">
                  <div className="echo-answer-head">
                    <span className="mono npc-status">
                      {state.result?.status.toUpperCase() ?? 'UNSUBMITTED'}
                    </span>
                    <span className="mono npc-confidence">
                      {Math.round(state.proposal.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p>{state.proposal.rationale}</p>
                  <p className="mono npc-action">
                    {state.proposal.proposedActions
                      .map((action) => `${action.actionType}${action.targetId ? `:${action.targetId}` : ''}`)
                      .join(', ')}
                  </p>
                  {state.result?.status === 'rejected' ? (
                    <p className="echo-error">
                      Engine refused: {state.result.rejection?.code} —{' '}
                      {state.result.rejection?.message}
                    </p>
                  ) : null}
                  {state.fallback ? (
                    <p className="npc-fallback">
                      Deterministic fallback: {state.fallbackReason}
                    </p>
                  ) : null}
                  {state.memory ? (
                    <p className="mono npc-memory-id">
                      Memory {state.memory.memoryId} from event{' '}
                      {state.memory.provenance.sourceEventIds[0]}
                    </p>
                  ) : null}
                </div>
              )}

              <p className="mono npc-memory-count">
                MEMORY {memory.length} {memory.length === 1 ? 'RECORD' : 'RECORDS'}
              </p>
              {memory.length > 0 ? (
                <p className="note-muted npc-memory-last">{memory.at(-1)?.content}</p>
              ) : null}
            </section>
          );
        })}
      </aside>
    </div>
  );
}
