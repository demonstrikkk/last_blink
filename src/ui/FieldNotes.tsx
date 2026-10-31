import type { WorldView } from '../world/worldView.js';

interface FieldNotesProps {
  readonly view: WorldView;
  readonly objective: string;
}

function FactRow({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly tone?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={`mono${tone ? ` ${tone}` : ''}`}>{value ?? '—'}</dd>
    </div>
  );
}

export function FieldNotes({ view, objective }: FieldNotesProps) {
  const latestAnchor = view.anchors.at(-1) ?? null;

  return (
    <aside className="field-notes" aria-label="Field notes">
      <header className="notes-head">
        <p className="micro">FIELD NOTES</p>
        <span className="mono notes-count">
          {view.evidenceFound}/{view.evidenceTotal}
        </span>
      </header>

      <section className="note-block" aria-labelledby="note-timeline">
        <h2 id="note-timeline" className="note-title">
          Timeline
        </h2>
        <p className="timeline-current mono">
          V{view.timeline.index + 1} / {view.timeline.total} · {view.timeline.label}
        </p>
        <p className="note-muted">
          {view.timeline.parentLabel
            ? `Forked from ${view.timeline.parentLabel} at ${view.timeline.forkedFromAnchorId}.`
            : 'Original timeline. Record an anchor, then BLINK to fork it.'}
        </p>
      </section>

      <section className="note-block" aria-labelledby="note-objectives">
        <h2 id="note-objectives" className="note-title">
          Investigation
        </h2>
        <ol className="objective-list">
          {view.objectives.map((item) => (
            <li
              key={item.objectiveId}
              className={`objective-item${item.done ? ' objective-done' : ''}`}
            >
              <span className="objective-glyph" aria-hidden="true">
                {item.done ? '▣' : '▢'}
              </span>
              <span>
                <span className="objective-label">{item.label}</span>
                <span className="objective-detail">{item.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="note-block" aria-labelledby="note-evidence">
        <h2 id="note-evidence" className="note-title">
          Evidence
        </h2>
        {view.evidence.map((item) => (
          <article
            key={item.evidenceId}
            className={`evidence-card${item.collected ? ' evidence-found' : ''}`}
          >
            <div className="evidence-top">
              <span className="evidence-glyph" aria-hidden="true">
                {item.collected ? '▣' : '▢'}
              </span>
              <div>
                <p className="evidence-label">{item.label}</p>
                <p className="mono evidence-key">{item.factKey}</p>
              </div>
              <span className={`state-chip${item.collected ? ' state-verified' : ''}`}>
                {item.collected ? 'VERIFIED' : item.available ? 'NEW' : 'SEALED'}
              </span>
            </div>
            <p className="evidence-summary">
              {item.collected
                ? item.summary
                : !item.available && item.requires.length > 0
                  ? `Requires ${item.requires.join(', ')}.`
                  : 'Not yet inspected. The street is still holding this one.'}
            </p>
            <p className="mono provenance-line">
              {item.sourceKind.toUpperCase()} · {item.provenance} ·{' '}
              {Math.round(item.confidence * 100)}% confidence
            </p>
          </article>
        ))}
      </section>

      <section className="note-block" aria-labelledby="note-decision">
        <h2 id="note-decision" className="note-title">
          Decisions
        </h2>
        {view.choices.map((node) => (
          <div key={node.nodeId} className="decision-entry">
            <p className="decision-prompt">{node.prompt}</p>
            <p className={`mono decision-status${node.resolvedOptionId ? ' status-resolved' : ''}`}>
              {node.resolvedOptionLabel
                ? `● ${node.resolvedOptionLabel}`
                : node.available
                  ? '○ available'
                  : `◌ locked · ${node.missing.join(', ')}`}
            </p>
          </div>
        ))}
        {view.choiceResolved ? <p className="decision-text">{view.consequence}</p> : null}
      </section>

      <section className="note-block" aria-labelledby="note-causal">
        <h2 id="note-causal" className="note-title">
          Causal state
        </h2>
        <dl className="causal-grid">
          <FactRow label="story.phase" value={view.phase} />
          <FactRow label="world.ward_alert" value={view.wardAlert} />
          <FactRow label="npc.sable.trust" value={view.sableTrust} />
          <FactRow label="npc.ivo.stance" value={view.ivoStance} />
          <FactRow label="world.dispatch_continuity" value={view.dispatchContinuity} />
          <FactRow label="world.vendor_confidence" value={view.vendorConfidence} />
          <FactRow label="world.morrow_scrutiny" value={view.morrowScrutiny} />
        </dl>
      </section>

      {view.ending ? (
        <section className="note-block ending-panel" aria-labelledby="note-ending">
          <p className="micro">ENDING REACHED</p>
          <h2 id="note-ending" className="ending-title">
            {view.ending.title}
          </h2>
          <p className="ending-summary">{view.ending.summary}</p>
        </section>
      ) : null}

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
              <p className="mono anchor-hash">
                {latestAnchor.anchorId} · v{latestAnchor.stateVersion} · event{' '}
                {latestAnchor.eventSequenceNo}
              </p>
              <p className="mono anchor-hash">{latestAnchor.stateHash}</p>
              {latestAnchor.forkedInto ? (
                <p className="mono anchor-forked">forked into {latestAnchor.forkedInto}</p>
              ) : null}
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
