import type { WorldView } from '../world/worldView.js';

interface FieldNotesProps {
  readonly view: WorldView;
  readonly objective: string;
}

export function FieldNotes({ view, objective }: FieldNotesProps) {
  const latestAnchor = view.anchors.at(-1) ?? null;

  return (
    <aside className="field-notes" aria-label="Field notes">
      <header className="notes-head">
        <p className="micro">FIELD NOTES</p>
        <span className="mono notes-count">{view.evidenceFound}/1</span>
      </header>

      <section className="note-block" aria-labelledby="note-evidence">
        <h2 id="note-evidence" className="note-title">
          Evidence
        </h2>
        {view.evidence.map((item) => (
          <article key={item.evidenceId} className={`evidence-card${item.collected ? ' evidence-found' : ''}`}>
            <div className="evidence-top">
              <span className="evidence-glyph" aria-hidden="true">
                {item.collected ? '▣' : '▢'}
              </span>
              <div>
                <p className="evidence-label">{item.label}</p>
                <p className="mono evidence-key">{item.factKey}</p>
              </div>
              <span className={`state-chip${item.collected ? ' state-verified' : ''}`}>
                {item.collected ? 'VERIFIED' : 'NEW'}
              </span>
            </div>
            <p className="evidence-summary">
              {item.collected
                ? item.summary
                : 'Sealed terminal at the north kerb. The relay kept counting while the street forgot.'}
            </p>
          </article>
        ))}
      </section>

      <section className="note-block" aria-labelledby="note-decision">
        <h2 id="note-decision" className="note-title">
          Decision
        </h2>
        {view.choiceResolved ? (
          <div className="decision-card">
            <p className="mono decision-option">{view.choice?.resolvedOptionId}</p>
            <p className="decision-label">{view.choice?.resolvedOptionLabel}</p>
            <p className="decision-text">{view.consequence}</p>
            <dl className="decision-facts">
              <div>
                <dt>world.ward_alert</dt>
                <dd className="mono">{view.wardAlert ?? '—'}</dd>
              </div>
              <div>
                <dt>npc.sable.stance</dt>
                <dd className="mono">{view.sableStance ?? '—'}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="note-muted">
            No decision recorded. Sable is waiting by the relay terminal on the south walk.
          </p>
        )}
      </section>

      <section className="note-block" aria-labelledby="note-anchor">
        <h2 id="note-anchor" className="note-title">
          Anchor
        </h2>
        {latestAnchor ? (
          <div className="anchor-card">
            <p className="anchor-ring" aria-hidden="true">
              ◯
            </p>
            <div>
              <p className="anchor-label">{latestAnchor.label}</p>
              <p className="mono anchor-hash">{latestAnchor.stateHash}</p>
            </div>
          </div>
        ) : (
          <p className="note-muted">
            No anchor set. The cyan lamp post by the south walk checkpoints canonical state.
          </p>
        )}
      </section>

      <section className="note-block note-objective" aria-labelledby="note-objective">
        <h2 id="note-objective" className="note-title">
          Objective
        </h2>
        <p className="note-muted">{objective}</p>
      </section>
    </aside>
  );
}
