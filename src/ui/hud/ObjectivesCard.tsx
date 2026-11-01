import type { WorldView } from '../../world/worldView.js';

interface ObjectivesCardProps {
  readonly view: WorldView;
}

export function ObjectivesCard({ view }: ObjectivesCardProps) {
  return (
    <aside className="hud-card hud-objectives-card" aria-label="Investigation Roadmap">
      <header className="hud-card-head">
        <span className="hud-pulse-dot" aria-hidden="true" />
        <h2 className="hud-card-title">
          {view.ending ? 'Investigation Concluded' : 'Investigation Roadmap'}
        </h2>
      </header>
      <ul className="hud-roadmap">
        {view.roadmap.map((item) => (
          <li key={item.id} className={`hud-roadmap-item roadmap-${item.kind}`}>
            <span className="hud-roadmap-kind">{item.kind}</span>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </li>
        ))}
      </ul>
      {view.roadmap.length === 0 ? (
        <footer className="hud-card-footer mono">
          No open leads. Explore the district or revisit the record.
        </footer>
      ) : null}
    </aside>
  );
}
