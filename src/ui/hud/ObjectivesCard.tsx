import type { WorldView } from '../../world/worldView.js';

interface ObjectivesCardProps {
  readonly view: WorldView;
}

interface ChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
}

export function ObjectivesCard({ view }: ObjectivesCardProps) {
  const hasRelay7 = view.evidence.find((e) => e.evidenceId === 'relay_7_log')?.collected ?? false;
  const hasRelayChoice = view.sableStance !== null;
  const hasDispatch = view.evidence.find((e) => e.evidenceId === 'ward_dispatch')?.collected ?? false;
  const hasTestimony = view.evidence.find((e) => e.evidenceId === 'vendor_testimony')?.collected ?? false;
  const hasWardCall = view.endingId !== null;

  const checklist: readonly ChecklistItem[] = [
    { id: 'relay', label: 'Read Relay 7', done: hasRelay7 },
    { id: 'sable', label: 'Talk to Sable', done: hasRelayChoice },
    { id: 'dispatch', label: 'Check dispatch board', done: hasDispatch },
    { id: 'ivo', label: 'Hear Ivo’s account', done: hasTestimony },
    { id: 'call', label: 'Make the ward call', done: hasWardCall },
  ];

  return (
    <aside className="hud-card hud-objectives-card" aria-label="Investigation Objectives">
      <header className="hud-card-head">
        <span className="hud-pulse-dot" aria-hidden="true" />
        <h2 className="hud-card-title">
          {view.ending ? 'Investigation Concluded' : 'Investigate the Relay 7 incident'}
        </h2>
      </header>
      <ul className="hud-checklist">
        {checklist.map((item) => (
          <li key={item.id} className={`hud-check-item${item.done ? ' item-done' : ''}`}>
            <span className="hud-checkbox" aria-hidden="true">
              {item.done ? '✓' : ''}
            </span>
            <span className="hud-check-label">{item.label}</span>
          </li>
        ))}
      </ul>
      {view.currentObjective ? (
        <footer className="hud-card-footer mono">
          Active: {view.currentObjective.label}
        </footer>
      ) : null}
    </aside>
  );
}
