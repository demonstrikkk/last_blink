import { useEffect, useState } from 'react';
import {
  loadTimelineShowcase,
  type ShowcaseTimeline,
} from '../showcase/timelineShowcase.js';

interface TimelineShowcaseProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

function TimelineCard({
  timeline,
  index,
  active,
  onSelect,
}: {
  readonly timeline: ShowcaseTimeline;
  readonly index: number;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <article className={`showcase-card${active ? ' showcase-card-active' : ''}`}>
      <button type="button" className="showcase-card-head" onClick={onSelect}>
        <span className="micro mono">TIMELINE {String(index + 1).padStart(2, '0')}</span>
        <strong>{timeline.name}</strong>
        <span
          className={`showcase-chip mono${timeline.committed ? ' chip-ok' : ' chip-warn'}`}
        >
          {timeline.committed ? 'ENGINE VERIFIED' : 'ROUTE REFUSED'}
        </span>
      </button>

      <p className="showcase-premise">{timeline.premise}</p>

      <div className="showcase-result">
        <p className="micro mono">ENDING · {timeline.clockLabel}</p>
        <h4>{timeline.endingTitle}</h4>
        <p>{timeline.endingSummary}</p>
      </div>

      <dl className="showcase-stats">
        <div>
          <dt>Records</dt>
          <dd className="mono">{timeline.evidence.length}</dd>
        </div>
        <div>
          <dt>Decisions</dt>
          <dd className="mono">{timeline.decisions.length}</dd>
        </div>
        <div>
          <dt>Challenges</dt>
          <dd className="mono">{timeline.challenges.length}</dd>
        </div>
        <div>
          <dt>Tick</dt>
          <dd className="mono">{timeline.tick}</dd>
        </div>
      </dl>

      {timeline.evidence.length > 0 ? (
        <div className="showcase-list">
          <p className="micro mono">RECOVERED</p>
          <ul>
            {timeline.evidence.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {timeline.decisions.length > 0 ? (
        <div className="showcase-list">
          <p className="micro mono">DECIDED</p>
          <ul>
            {timeline.decisions.map((decision) => (
              <li key={decision}>{decision}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="showcase-proves">
        <span className="micro mono">WHAT IT PROVES</span> {timeline.proves}
      </p>

      {timeline.notes.length > 0 ? (
        <p className="showcase-note mono">{timeline.notes.join(' ')}</p>
      ) : null}
    </article>
  );
}

/**
 * A showcase of timelines the deterministic engine actually played. The routes
 * run once per browser session through the same session class the game uses;
 * the panel is a projection, not a marketing mock.
 */
export function TimelineShowcase({ open, onClose }: TimelineShowcaseProps) {
  const [timelines, setTimelines] = useState<readonly ShowcaseTimeline[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    void loadTimelineShowcase()
      .then((result) => {
        if (!cancelled) setTimelines(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="echo-layer showcase-layer">
      <button type="button" className="ledger-backdrop" aria-label="Close timeline showcase" onClick={onClose} />
      <aside
        className="echo-panel showcase-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="showcase-title"
      >
        <header className="ledger-head">
          <div>
            <p className="micro mono">ECHO / RETAINED TIMELINES</p>
            <h2 id="showcase-title">Three ways the day actually ends</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close showcase">
            ✕
          </button>
        </header>

        <p className="showcase-intro">
          Each card below is a complete route dispatched through the canonical engine —
          evidence, decisions, challenges and clock included. Nothing here is scripted prose:
          if a route breaks, the card says so.
        </p>

        {error ? <p className="showcase-error mono">SHOWCASE ERROR // {error}</p> : null}

        {!timelines && !error ? (
          <p className="showcase-loading mono" role="status">
            Replaying three canonical routes…
          </p>
        ) : null}

        {timelines ? (
          <>
            <div className="showcase-tabs" role="tablist" aria-label="Showcase timelines">
              {timelines.map((timeline, index) => (
                <button
                  key={timeline.id}
                  type="button"
                  role="tab"
                  aria-selected={active === index}
                  className={`btn btn-quiet${active === index ? ' choice-active' : ''}`}
                  onClick={() => setActive(index)}
                >
                  {String(index + 1).padStart(2, '0')} · {timeline.endingTitle}
                </button>
              ))}
            </div>

            <div className="showcase-grid">
              {timelines.map((timeline, index) => (
                <TimelineCard
                  key={timeline.id}
                  timeline={timeline}
                  index={index}
                  active={active === index}
                  onSelect={() => setActive(index)}
                />
              ))}
            </div>
          </>
        ) : null}

        <p className="mono showcase-footer">
          ECHO preserves provenance. MORROW can change testimony; it cannot change these
          records. Model output never writes canonical state.
        </p>
      </aside>
    </div>
  );
}
