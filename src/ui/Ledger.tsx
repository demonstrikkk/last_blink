import type { GameEvent, GameState } from '../engine/index.js';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface LedgerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly state: GameState;
  readonly hash: string;
  readonly events: readonly GameEvent[];
  readonly saveState: SaveState;
  readonly onSave: () => void;
  readonly onRestart: () => void;
}

export function Ledger({ open, onClose, state, hash, events, saveState, onSave, onRestart }: LedgerProps) {
  if (!open) return null;

  const facts = Object.entries(state.facts).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const recent = [...events].slice(-12).reverse();

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
                  <span className="mono event-meta">{event.sourceId}</span>
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
