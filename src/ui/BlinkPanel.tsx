import { useEffect, useRef } from 'react';
import type { BranchComparison, BranchSummary } from '../engine/index.js';
import type { WorldView } from '../world/worldView.js';

export interface BlinkPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly view: WorldView;
  readonly branches: readonly BranchSummary[];
  readonly activeBranchId: string;
  readonly comparison: BranchComparison | null;
  readonly compareTargetId: string | null;
  readonly onCompare: (branchId: string | null) => void;
  readonly onFork: (anchorId: string) => void;
  readonly onSwitch: (branchId: string) => void;
}

function timelineName(branch: BranchSummary): string {
  return `V${branch.timelineIndex + 1}`;
}

function factList(keys: readonly string[], empty: string): string {
  return keys.length === 0 ? empty : keys.join(', ');
}

/**
 * BLINK is an interface over canonical branch state, not a rewind effect. Every
 * number here comes from GameSession: branch summaries are engine projections and
 * the comparison is computed from the two canonical states.
 */
export function BlinkPanel({
  open,
  onClose,
  view,
  branches,
  activeBranchId,
  comparison,
  compareTargetId,
  onCompare,
  onFork,
  onSwitch,
}: BlinkPanelProps) {
  const comparisonRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!comparison || !open) return;
    comparisonRef.current?.scrollIntoView({ block: 'nearest' });
  }, [comparison, open]);

  if (!open) return null;

  const active = branches.find((branch) => branch.branchId === activeBranchId) ?? null;
  const nameOf = (branchId: string | null): string => {
    if (!branchId) return '—';
    const found = branches.find((branch) => branch.branchId === branchId);
    return found ? timelineName(found) : '—';
  };
  const forkedAnchors = new Set(
    branches
      .map((branch) => branch.checkpoint?.anchorId)
      .filter((anchorId): anchorId is string => Boolean(anchorId)),
  );

  return (
    <div className="blink-layer">
      <button type="button" className="ledger-backdrop" aria-label="Close BLINK" onClick={onClose} />
      <aside className="blink-panel" role="dialog" aria-modal="true" aria-labelledby="blink-title">
        <header className="ledger-head">
          <div>
            <p className="micro">BLINK / TIMELINE CONTROL</p>
            <h2 id="blink-title">Two versions of the street</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close BLINK">
            ✕
          </button>
        </header>

        <p className="blink-intro">
          BLINK forks from a recorded anchor. The new timeline starts at that checkpoint; the
          original keeps everything it has already lived. Only scar memory crosses.
        </p>

        <section className="ledger-section" aria-labelledby="blink-timelines">
          <h3 id="blink-timelines">Timelines ({branches.length})</h3>
          <ul className="timeline-list">
            {branches.map((branch) => {
              const isActive = branch.branchId === activeBranchId;
              return (
                <li key={branch.branchId} className={`timeline-card${isActive ? ' timeline-active' : ''}`}>
                  <div className="timeline-card-head">
                    <span className="mono timeline-tag">{timelineName(branch)}</span>
                    <span className="timeline-label">{branch.label}</span>
                    {isActive ? <span className="state-chip state-verified">ACTIVE</span> : null}
                  </div>
                  <dl className="timeline-stats">
                    <div>
                      <dt>State</dt>
                      <dd className="mono">v{branch.stateVersion}</dd>
                    </div>
                    <div>
                      <dt>Tick</dt>
                      <dd className="mono">{branch.tick}</dd>
                    </div>
                    <div>
                      <dt>Facts</dt>
                      <dd className="mono">{branch.facts}</dd>
                    </div>
                    <div>
                      <dt>Events</dt>
                      <dd className="mono">{branch.eventCount}</dd>
                    </div>
                    <div>
                      <dt>Ending</dt>
                      <dd className="mono">{branch.endingId ?? '—'}</dd>
                    </div>
                  </dl>
                  <p className="mono timeline-hash">hash {branch.stateHash}</p>
                  {branch.checkpoint ? (
                    <p className="mono timeline-checkpoint">
                      fork · anchor {branch.checkpoint.anchorId} · checkpoint v
                      {branch.checkpoint.stateVersion} · event {branch.checkpoint.eventSequenceNo} ·
                      hash {branch.checkpoint.stateHash}
                    </p>
                  ) : (
                    <p className="mono timeline-checkpoint">root timeline · no fork point</p>
                  )}
                  <div className="button-row">
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => onSwitch(branch.branchId)}
                      disabled={isActive}
                    >
                      {isActive ? 'Current' : `Switch to ${timelineName(branch)}`}
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-small"
                      onClick={() => onCompare(branch.branchId === activeBranchId ? null : branch.branchId)}
                      disabled={isActive}
                      aria-pressed={compareTargetId === branch.branchId}
                    >
                      Compare
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="ledger-section" aria-labelledby="blink-anchors">
          <h3 id="blink-anchors">Anchors on {active ? timelineName(active) : 'this timeline'}</h3>
          {view.anchors.length === 0 ? (
            <p className="note-muted">
              No anchor yet. Walk to the cyan lamp post and record one before blinking.
            </p>
          ) : (
            <ul className="blink-anchor-list">
              {view.anchors.map((anchor) => {
                const forked = forkedAnchors.has(anchor.anchorId);
                return (
                  <li key={anchor.anchorId}>
                    <div>
                      <p className="anchor-label">{anchor.label}</p>
                      <p className="mono anchor-hash">
                        checkpoint v{anchor.stateVersion} · tick {anchor.tick} · event{' '}
                        {anchor.eventSequenceNo} · {anchor.stateHash}
                      </p>
                      {anchor.forkedInto ? (
                        <p className="mono blink-forked">already forked into {anchor.forkedInto}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => onFork(anchor.anchorId)}
                      disabled={forked}
                    >
                      {forked ? 'Forked' : 'BLINK from here'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {comparison ? (
          <section className="ledger-section" aria-labelledby="blink-compare" ref={comparisonRef}>
            <h3 id="blink-compare">
              {timelineName(comparison.base)} vs {timelineName(comparison.other)}
            </h3>
            <p className="mono comparison-line">
              common ancestor {nameOf(comparison.commonAncestorBranchId)}
              {comparison.forkPoint
                ? ` · fork at ${comparison.forkPoint.anchorId} (v${comparison.forkPoint.stateVersion}, event ${comparison.forkPoint.eventSequenceNo})`
                : ''}
            </p>
            <dl className="comparison-grid">
              <div>
                <dt>Shared facts</dt>
                <dd className="mono">{comparison.sharedFactKeys.length}</dd>
              </div>
              <div>
                <dt>Only {timelineName(comparison.base)}</dt>
                <dd className="mono">{comparison.onlyInBase.length}</dd>
              </div>
              <div>
                <dt>Only {timelineName(comparison.other)}</dt>
                <dd className="mono">{comparison.onlyInOther.length}</dd>
              </div>
              <div>
                <dt>Changed values</dt>
                <dd className="mono">{comparison.changedFacts.length}</dd>
              </div>
              <div>
                <dt>Shared events</dt>
                <dd className="mono">{comparison.events.shared}</dd>
              </div>
              <div>
                <dt>Divergent events</dt>
                <dd className="mono">
                  {comparison.events.baseOnly} / {comparison.events.otherOnly}
                </dd>
              </div>
            </dl>

            <div className="comparison-block">
              <p className="micro">FACTS</p>
              <p className="mono comparison-text">
                only {timelineName(comparison.base)}: {factList(comparison.onlyInBase, 'none')}
              </p>
              <p className="mono comparison-text">
                only {timelineName(comparison.other)}: {factList(comparison.onlyInOther, 'none')}
              </p>
              {comparison.changedFacts.map((difference) => (
                <p key={difference.key} className="mono comparison-text comparison-changed">
                  {difference.key}: {JSON.stringify(difference.base)} →{' '}
                  {JSON.stringify(difference.other)}
                </p>
              ))}
            </div>

            <div className="comparison-block">
              <p className="micro">DECISIONS</p>
              {comparison.choices.map((choice) => (
                <p
                  key={choice.nodeId}
                  className={`mono comparison-text${choice.divergent ? ' comparison-changed' : ''}`}
                >
                  {choice.nodeId}: {choice.baseOptionId ?? 'undecided'} |{' '}
                  {choice.otherOptionId ?? 'undecided'}
                </p>
              ))}
            </div>

            <div className="comparison-block">
              <p className="micro">OUTCOMES</p>
              <p className="mono comparison-text">
                ending: {comparison.endings.base ?? 'open'} | {comparison.endings.other ?? 'open'}
              </p>
              <p className="mono comparison-text">
                scars: {factList(comparison.scars.base, 'none')} |{' '}
                {factList(comparison.scars.other, 'none')}
              </p>
            </div>
          </section>
        ) : (
          <p className="note-muted blink-compare-hint">
            Choose Compare on another timeline to see canonical differences.
          </p>
        )}
      </aside>
    </div>
  );
}
