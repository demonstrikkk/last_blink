import type { WorldView } from '../../world/worldView.js';

interface BranchCardProps {
  readonly view: WorldView;
  readonly totalBranches: number;
  readonly onOpenBlink: () => void;
}

export function BranchCard({ view, totalBranches, onOpenBlink }: BranchCardProps) {
  const currentIndex = view.timeline.index + 1;
  const isForked = view.timeline.parentLabel !== null || totalBranches > 1;

  const sharedCount = Math.max(3, view.evidenceFound + (view.sableStance ? 2 : 0));
  const uniqueCount = isForked ? Math.max(1, view.choicesMade) : 0;

  return (
    <aside className="hud-card hud-branch-card" aria-label="Branch Comparison">
      <header className="hud-card-head">
        <span className="hud-branch-glyph" aria-hidden="true">⋔</span>
        <h2 className="hud-card-title">Branch Comparison</h2>
      </header>

      <div className="hud-card-body">
        <div className="hud-timeline-diagram" aria-hidden="true">
          <div className="hud-branch-node node-v1">
            <span className="node-label mono">V1</span>
            <span className="node-dot dot-v1" />
          </div>
          <div className="hud-branch-line" />
          <div className={`hud-branch-node node-v2${totalBranches > 1 ? ' active' : ' ghost'}`}>
            <span className="node-dot dot-v2" />
            <span className="node-label mono">{totalBranches > 1 ? `V${totalBranches}` : 'V2'}</span>
          </div>
        </div>

        <div className="hud-branch-stats mono">
          <span>Shared: {sharedCount} events</span>
          <span>{totalBranches > 1 ? `V${currentIndex} only: ${uniqueCount} events` : 'Single branch'}</span>
        </div>

        <button
          type="button"
          className="hud-details-btn mono"
          onClick={onOpenBlink}
          title="Open BLINK timeline control to compare or fork branches"
        >
          <span>View Details</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </aside>
  );
}
