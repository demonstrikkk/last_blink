import type { BranchSummary, GameEvent, GameState } from '../engine/index.js';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface LedgerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly state: GameState;
  readonly hash: string;
  readonly events: readonly GameEvent[];
  readonly branches: readonly BranchSummary[];
  readonly saveState: SaveState;
  readonly onSave: () => void;
  readonly onRestart: () => void;
}

export function Ledger({
  open,
  onClose,
  state,
  hash,
  events,
  branches,
  saveState,
  onSave,
  onRestart,
}: LedgerProps) {
  if (!open) return null;

  const facts = Object.entries(state.facts).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const recent = [...events].slice(-12).reverse();
  const timelineName = (branchId: string): string => {
    const found = branches.find((branch) => String(branch.branchId) === branchId);
    return found ? `V${found.timelineIndex + 1}` : 'V?';
  };
  const lineage = new Map<string, BranchSummary>(
    branches.map((branch) => [String(branch.branchId), branch]),
  );
  const chain: string[] = [];
  let cursor: string | null = String(state.branchId);
  while (cursor && lineage.has(cursor) && chain.length < 16) {
    chain.unshift(cursor);
    const parent: BranchSummary['parentBranchId'] | undefined = lineage.get(cursor)?.parentBranchId;
    cursor = parent ? String(parent) : null;
  }

  return (
    <div className="ledger-layer">
      <button type="button" className="ledger-backdrop" aria-label="Close ledger" onClick={onClose} />
      <aside className="ledger" role="dialog" aria-modal="true" aria-labelledby="ledger-title">
        <header className="ledger-head">
          <div>
            <p className="micro">ENGINE LEDGER</p>
            <h2 id="ledger-title">Canonical state</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close ledger">
            ✕
          </button>
        </header>

        <dl className="ledger-stats">
          <div>
            <dt>State version</dt>
            <dd className="mono">v{state.stateVersion}</dd>
          </div>
          <div>
            <dt>Tick</dt>
            <dd className="mono">{state.tick}</dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd className="mono">{state.player.progress.evidenceFound}</dd>
          </div>
          <div>
            <dt>Choices</dt>
            <dd className="mono">{state.player.progress.choicesMade}</dd>
          </div>
          <div>
            <dt>Anchors</dt>
            <dd className="mono">{state.anchors.length}</dd>
          </div>
          <div className="ledger-stat-ending">
            <dt>Ending</dt>
            <dd className="mono">{state.endingId ?? '—'}</dd>
          </div>
        </dl>

        <div className="ledger-hash">
          <p className="micro">STATE HASH</p>
          <p className="mono">{hash}</p>
          <p className="micro">SESSION</p>
          <p className="mono">{state.sessionId}</p>
        </div>

        <section className="ledger-section" aria-labelledby="ledger-lineage">
          <h3 id="ledger-lineage">Timeline lineage</h3>
          <ol className="lineage-list">
            {chain.map((branchId) => {
              const branch = lineage.get(branchId);
              if (!branch) return null;
              const active = branchId === String(state.branchId);
              return (
                <li key={branchId} className={active ? 'lineage-active' : undefined}>
                  <span className="mono lineage-tag">{timelineName(branchId)}</span>
                  <span className="lineage-label">{branch.label}</span>
                  <span className="mono lineage-meta">
                    {branch.branchId} · v{branch.stateVersion} · {branch.stateHash}
                  </span>
                  {branch.checkpoint ? (
                    <span className="mono lineage-meta">
                      forked at {branch.checkpoint.anchorId} · checkpoint v
                      {branch.checkpoint.stateVersion} · event {branch.checkpoint.eventSequenceNo}
                    </span>
                  ) : (
                    <span className="mono lineage-meta">root timeline</span>
                  )}
                </li>
              );
            })}
          </ol>
          {branches.length > chain.length ? (
            <p className="mono lineage-meta">
              {branches.length - chain.length} other timeline
              {branches.length - chain.length === 1 ? '' : 's'} in this session.
            </p>
          ) : null}
        </section>

        <section className="ledger-section" aria-labelledby="ledger-facts">
          <h3 id="ledger-facts">Facts ({facts.length})</h3>
          <ul className="fact-list">
            {facts.map(([key, fact]) => (
              <li key={key}>
                <span className="mono fact-key">{key}</span>
                <span className="mono fact-value">{JSON.stringify(fact.value)}</span>
                <span className="fact-kind">{fact.kind}</span>
                <span className="mono fact-source">
                  {fact.source.kind}:{fact.source.ref} · {fact.sourceEventId}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="ledger-section" aria-labelledby="ledger-events">
          <h3 id="ledger-events">Recent events</h3>
          {recent.length === 0 ? (
            <p className="note-muted">No events yet.</p>
          ) : (
            <ol className="event-list">
              {recent.map((event) => (
                <li key={event.eventId}>
                  <span className="mono event-seq">{String(event.sequenceNo).padStart(3, '0')}</span>
                  <span className="event-type">{event.type}</span>
                  <span className="mono event-meta">{timelineName(event.branchId)} · {event.sourceId}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="ledger-section ledger-actions" aria-labelledby="ledger-save">
          <h3 id="ledger-save">Session</h3>
          <div className="button-row">
            <button type="button" className="btn" onClick={onSave} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Saving…' : 'Snapshot to memory'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={onRestart}>
              Restart street
            </button>
          </div>
          <p className="mono session-note" role="status" aria-live="polite">
            {saveState === 'saved'
              ? 'Write hit InMemoryPersistence. Refreshing still discards it.'
              : saveState === 'error'
                ? 'Snapshot failed — see console.'
                : 'Persistence is in memory only. Refreshing restarts the street.'}
          </p>
        </section>
      </aside>
    </div>
  );
}
