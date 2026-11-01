import type { PulseReadout } from '../../world/pulse.js';

interface PulseCardProps {
  readonly readout: PulseReadout;
  readonly onClose: () => void;
}

/**
 * PULSE is free orientation, never a walkthrough. This card shows where the
 * nearest actionable work is, how much of the day remains, and how many
 * contradictions are live — never what a clue means or who is lying.
 */
export function PulseCard({ readout, onClose }: PulseCardProps) {
  return (
    <aside className="pulse-card" role="status" aria-live="polite">
      <header className="pulse-card-head">
        <div>
          <p className="micro mono">PULSE / FREE SCAN</p>
          <strong>{readout.remaining} to 18:00</strong>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Dismiss pulse readout">
          ✕
        </button>
      </header>

      <dl className="pulse-stats">
        <div>
          <dt>Leads</dt>
          <dd className="mono">{readout.openLeads}</dd>
        </div>
        <div>
          <dt>Records missing</dt>
          <dd className="mono">{readout.missingEvidence}</dd>
        </div>
        <div>
          <dt>Challenges</dt>
          <dd className="mono">{readout.openChallenges}</dd>
        </div>
        <div>
          <dt>Contradictions</dt>
          <dd className="mono">{readout.openContradictions}</dd>
        </div>
      </dl>

      {readout.leads.length > 0 ? (
        <ol className="pulse-leads">
          {readout.leads.map((lead) => (
            <li key={lead.targetId}>
              <span className="pulse-lead-direction mono">
                {lead.distanceTiles <= 1 ? 'HERE' : `${lead.direction} ${lead.distanceTiles}`}
              </span>
              <span className="pulse-lead-body">
                <strong>{lead.label}</strong>
                <span>{lead.prompt}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="pulse-empty">
          No reachable lead. Open ECHO to test a contradiction, or BLINK and walk a
          different route.
        </p>
      )}

      <p className="pulse-pressure">
        <span className="micro mono">PRESSURE</span>{' '}
        {readout.pressure ?? 'No active MORROW countermeasure detected.'}
      </p>
    </aside>
  );
}
