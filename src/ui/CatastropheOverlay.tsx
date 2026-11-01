import { useEffect, useRef } from 'react';
import type { WorldView } from '../world/worldView.js';

interface CatastropheOverlayProps {
  readonly view: WorldView;
  readonly onReset: () => void;
  readonly onOpenEcho: () => void;
}

/**
 * The 18:00 catastrophe. The failed timeline is never erased: the overlay keeps
 * its observable sequence and the leads that were still missing, then offers the
 * only forward move, which is back to 08:00 on a new branch.
 */
export function CatastropheOverlay({ view, onReset, onOpenEcho }: CatastropheOverlayProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  return (
    <section
      className="catastrophe-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catastrophe-title"
      aria-describedby="catastrophe-body"
    >
      <div className="catastrophe-card">
        <p className="micro catastrophe-kicker mono">
          18:00 // RELAY 7 // TIMELINE {view.timeline.index + 1} CLOSED
        </p>
        <h2 id="catastrophe-title" className="catastrophe-title">
          The lights go out from the north kerb.
        </h2>
        <p id="catastrophe-body" className="catastrophe-cause">
          {view.catastrophe.cause ??
            'The zeroing order executed unanswered. The street went dark outward from Relay 7.'}
        </p>

        <div className="catastrophe-grid">
          <div>
            <p className="micro mono">WHAT HAPPENED</p>
            <ol className="catastrophe-sequence">
              {(view.catastrophe.sequence.length > 0
                ? view.catastrophe.sequence
                : [
                    '17:52 · The Relay 7 carrier slips away from 434.8 MHz.',
                    '17:58 · The district exchange accepts the zeroing token without a countermand.',
                    '18:00 · Relay 7 arcs. The street goes dark outward from the north kerb.',
                  ]
              ).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </div>
          <div>
            <p className="micro mono">WHAT WAS STILL MISSING</p>
            {view.catastrophe.missing.length > 0 ? (
              <ul className="catastrophe-missing">
                {view.catastrophe.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="catastrophe-note">
                Every lead was on the record. No countermand was committed before the order
                executed.
              </p>
            )}
          </div>
        </div>

        <p className="catastrophe-note mono">
          This timeline is preserved. ECHO keeps its records, and MORROW will remember what
          worked here.
        </p>

        <div className="catastrophe-actions">
          <button ref={primaryRef} type="button" className="btn btn-primary" onClick={onReset}>
            Return to 08:00
          </button>
          <button type="button" className="btn btn-quiet" onClick={onOpenEcho}>
            ECHO: compare loops
          </button>
        </div>
      </div>
    </section>
  );
}
