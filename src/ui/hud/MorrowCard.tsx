import type { WorldView } from '../../world/worldView.js';

interface MorrowCardProps {
  readonly view: WorldView;
  readonly notice: string | null;
  readonly onTriggerReview: () => void;
}

export function MorrowCard({ view, notice, onTriggerReview }: MorrowCardProps) {
  const scrutiny = view.morrowScrutiny ?? 'low';
  const riskLabel = scrutiny === 'critical' ? 'HIGH' : scrutiny === 'elevated' ? 'MEDIUM' : 'LOW';
  const riskClass = scrutiny === 'critical' ? 'risk-high' : scrutiny === 'elevated' ? 'risk-med' : 'risk-low';

  const actionText =
    scrutiny === 'critical'
      ? 'Authorize Inquiry'
      : scrutiny === 'elevated'
        ? 'Increase Surveillance'
        : 'Monitor Frequencies';

  const reasonText =
    notice ??
    (scrutiny === 'critical'
      ? 'Witness exposed on official ward docket. Heightened oversight active.'
      : scrutiny === 'elevated'
        ? 'Key evidence involved in Relay 7 outage. Ward attention drawn.'
        : 'Curfew enforcement standard protocol. Curfew active.');

  return (
    <aside className="hud-card hud-morrow-card" aria-label="MORROW Policy Assistant">
      <header className="hud-card-head">
        <div className="hud-card-brand">
          <span className="hud-brand-glyph" aria-hidden="true">⩚</span>
          <div>
            <h2 className="hud-card-title">MORROW</h2>
            <p className="hud-card-subtitle mono">Policy Assistant</p>
          </div>
        </div>
      </header>

      <div className="hud-card-body">
        <div className="hud-risk-row mono">
          <span className="hud-risk-label">Investigation Risk:</span>
          <span className={`hud-risk-badge ${riskClass}`}>● {riskLabel}</span>
        </div>

        <div className="hud-proposed-section">
          <p className="hud-proposed-label mono">Proposed Action:</p>
          <button
            type="button"
            className="hud-action-pill"
            onClick={onTriggerReview}
            title="Evaluate MORROW policy directive"
          >
            <span className="hud-eye-icon" aria-hidden="true">👁</span>
            <span>{actionText}</span>
          </button>
        </div>

        <p className="hud-reason-text">
          <span className="mono hud-reason-prefix">Reason:</span> {reasonText}
        </p>
      </div>
    </aside>
  );
}
