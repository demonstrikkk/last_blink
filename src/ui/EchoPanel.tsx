import { useMemo, useState } from 'react';
import {
  EchoService,
  type BranchSummary,
  type BranchId,
  type EchoAnswer,
  type EchoQuery,
  type GameContent,
} from '../engine/index.js';
import type { DeterministicGameSession } from '../engine/index.js';

interface EchoPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly session: DeterministicGameSession;
  readonly content: GameContent;
  readonly branches: readonly BranchSummary[];
  readonly activeBranchId: string;
}

type Mode = 'situation' | 'fact' | 'decision' | 'morrow' | 'ending' | 'compare';

const MODES: readonly { readonly id: Mode; readonly label: string }[] = [
  { id: 'situation', label: 'Situation' },
  { id: 'fact', label: 'Fact' },
  { id: 'decision', label: 'Decision' },
  { id: 'morrow', label: 'MORROW' },
  { id: 'ending', label: 'Ending' },
  { id: 'compare', label: 'Compare' },
];

/**
 * ECHO is a viewer over canonical records. It never dispatches an action and
 * never writes a fact; the panel only asks EchoService a question.
 */
export function EchoPanel({
  open,
  onClose,
  session,
  content,
  branches,
  activeBranchId,
}: EchoPanelProps) {
  const service = useMemo(() => new EchoService(session, content), [session, content]);
  const [mode, setMode] = useState<Mode>('situation');
  const [factKey, setFactKey] = useState('evidence.relay_7');
  const [nodeId, setNodeId] = useState('node.sable.relay');
  const [otherBranchId, setOtherBranchId] = useState<string>('');
  const [answer, setAnswer] = useState<EchoAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const otherBranches = branches.filter((branch) => branch.branchId !== activeBranchId);
  const fallbackOther = otherBranches[0]?.branchId ?? '';

  const buildQuery = (): EchoQuery | null => {
    switch (mode) {
      case 'situation':
        return { kind: 'situation' };
      case 'fact':
        return factKey.trim() ? { kind: 'fact', key: factKey.trim() } : null;
      case 'decision':
        return nodeId.trim() ? { kind: 'decision', nodeId: nodeId.trim() } : null;
      case 'morrow':
        return { kind: 'morrow' };
      case 'ending':
        return { kind: 'ending' };
      case 'compare': {
        const other = otherBranchId || fallbackOther;
        return other
          ? {
              kind: 'compare',
              baseBranchId: activeBranchId as BranchId,
              otherBranchId: other as BranchId,
            }
          : null;
      }
      default:
        return null;
    }
  };

  const ask = () => {
    setError(null);
    const query = buildQuery();
    if (!query) {
      setAnswer(null);
      setError('This query needs a scope first.');
      return;
    }
    try {
      setAnswer(service.ask(query));
    } catch (cause) {
      setAnswer(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="echo-layer">
      <button type="button" className="ledger-backdrop" aria-label="Close ECHO" onClick={onClose} />
      <aside className="echo-panel" role="dialog" aria-modal="true" aria-labelledby="echo-title">
        <header className="ledger-head">
          <div>
            <p className="micro">ECHO / GROUNDED RETRIEVAL</p>
            <h2 id="echo-title">What the record can support</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close ECHO">
            x
          </button>
        </header>

        <p className="echo-intro">
          ECHO answers only from canonical facts, events, choices, anchors and rules in one
          branch. It never consults another timeline except through an explicit comparison.
        </p>

        <div className="echo-modes" role="group" aria-label="Query type">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`btn btn-quiet echo-mode${mode === item.id ? ' echo-mode-active' : ''}`}
              aria-pressed={mode === item.id}
              onClick={() => {
                setMode(item.id);
                setAnswer(null);
                setError(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {mode === 'fact' ? (
          <label className="echo-field">
            <span>Fact key</span>
            <input
              value={factKey}
              onChange={(event) => setFactKey(event.target.value)}
              placeholder="evidence.relay_7"
            />
          </label>
        ) : null}

        {mode === 'decision' ? (
          <label className="echo-field">
            <span>Decision node</span>
            <select value={nodeId} onChange={(event) => setNodeId(event.target.value)}>
              {content.choices.map((node) => (
                <option key={node.nodeId} value={node.nodeId}>
                  {node.nodeId}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {mode === 'compare' && otherBranches.length > 0 ? (
          <label className="echo-field">
            <span>Compare with</span>
            <select
              value={otherBranchId || fallbackOther}
              onChange={(event) => setOtherBranchId(event.target.value)}
            >
              {otherBranches.map((branch) => (
                <option key={branch.branchId} value={branch.branchId}>
                  V{branch.timelineIndex + 1} {branch.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {mode === 'compare' && otherBranches.length === 0 ? (
          <p className="echo-empty">
            There is no second timeline yet. Record an anchor, then BLINK to fork one.
          </p>
        ) : null}

        <button type="button" className="btn echo-ask" onClick={ask}>
          Ask ECHO
        </button>

        {error ? <p className="echo-error">{error}</p> : null}

        {answer ? (
          <section className={`echo-answer echo-${answer.status}`} aria-live="polite">
            <div className="echo-answer-head">
              <span className={`state-chip echo-status echo-status-${answer.status}`}>
                {answer.status.toUpperCase()}
              </span>
              <span className="mono echo-scope">{answer.branchLabel ?? 'unscoped'}</span>
            </div>
            <p className="echo-summary">{answer.summary}</p>

            {answer.claims.map((claim, index) => (
              <article key={`${claim.kind}-${index}`} className={`echo-claim echo-claim-${claim.kind}`}>
                <p className="mono echo-claim-kind">{claim.kind.replace('_', ' ')}</p>
                <p>{claim.text}</p>
                {claim.citations.length > 0 ? (
                  <ul className="echo-citations">
                    {claim.citations.map((citation) => (
                      <li key={`${citation.kind}-${citation.id}-${citation.sequenceNo ?? 0}`}>
                        <span className="mono echo-citation-kind">{citation.kind}</span>
                        <span className="mono echo-citation-id">
                          {citation.id}
                          {citation.sequenceNo !== null ? ` #${citation.sequenceNo}` : ''}
                        </span>
                        <span className="echo-citation-label">{citation.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}

            {answer.missing.length > 0 ? (
              <p className="echo-missing mono">Missing: {answer.missing.join(', ')}</p>
            ) : null}
          </section>
        ) : null}
      </aside>
    </div>
  );
}
