import type { WorldView } from '../../world/worldView.js';

interface EchoCardProps {
  readonly view: WorldView;
  readonly onOpenEcho: () => void;
}

export function EchoCard({ view, onOpenEcho }: EchoCardProps) {
  const sourcesCount = view.collectedEvidence.length;

  let explanation = 'Aster district curfew is active. Relay 7 hardware status awaits investigation.';
  if (view.ending) {
    explanation = `Investigation concluded in timeline V${view.timeline.index + 1}: ${view.ending.summary}`;
  } else if (view.ivoStance && view.sableStance) {
    explanation = 'Relay 7 incident drew attention due to conflicting accounts from Sable and Ivo under curfew.';
  } else if (view.sableStance) {
    explanation = `Relay log decision (${view.sableStance}) altered ward alert to ${view.wardAlert ?? 'unresolved'}.`;
  } else if (view.evidence.some((e) => e.collected)) {
    explanation = 'Initial hardware count confirmed eight missing minutes during city-wide midnight blackout.';
  }

  return (
    <aside className="hud-card hud-echo-card" aria-label="ECHO Explanation Engine">
      <header className="hud-card-head">
        <div className="hud-card-brand">
          <span className="hud-echo-glyph" aria-hidden="true">◎</span>
          <div>
            <h2 className="hud-card-title">ECHO</h2>
            <p className="hud-card-subtitle mono">Explanation Engine</p>
          </div>
        </div>
      </header>

      <div className="hud-card-body">
        <p className="hud-echo-prompt mono">Why this happened:</p>
        <p className="hud-echo-text">{explanation}</p>
        <button
          type="button"
          className="hud-sources-btn mono"
          onClick={onOpenEcho}
          title="Open ECHO explanation console with grounded source citations"
        >
          <span>Show Sources ({sourcesCount})</span>
          <span aria-hidden="true">⌵</span>
        </button>
      </div>
    </aside>
  );
}
