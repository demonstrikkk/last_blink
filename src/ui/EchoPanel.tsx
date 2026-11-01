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
import {
  fetchMekoAdvisory,
  type MekoAdvisoryResponse,
} from '../session/cloudRuntime.js';

interface EchoPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly session: DeterministicGameSession;
  readonly content: GameContent;
  readonly branches: readonly BranchSummary[];
  readonly activeBranchId: string;
}

type Mode =
  | 'situation'
  | 'fact'
  | 'decision'
  | 'morrow'
  | 'ending'
  | 'hypothesis'
  | 'compare'
  | 'acrossLoops'
  | 'archive';

const MODES: readonly { readonly id: Mode; readonly label: string }[] = [
  { id: 'situation', label: 'Situation' },
  { id: 'fact', label: 'Fact' },
  { id: 'decision', label: 'Decision' },
  { id: 'morrow', label: 'MORROW audit' },
  { id: 'ending', label: 'Ending' },
  { id: 'hypothesis', label: 'Test theory' },
  { id: 'compare', label: 'Compare' },
  { id: 'acrossLoops', label: 'Across loops' },
  { id: 'archive', label: 'Meko archive' },
];

/**
 * ECHO is an investigative console over canonical records. It never dispatches an action
 * and never writes a fact; the panel only asks EchoService a query.
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
  const [hypothesis, setHypothesis] = useState('MORROW altered the witness memory');
  const [otherBranchId, setOtherBranchId] = useState<string>('');
  const [answer, setAnswer] = useState<EchoAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiveQuery, setArchiveQuery] = useState('Relay 7 zeroing charge ward protocol');
  const [archive, setArchive] = useState<MekoAdvisoryResponse | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

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
      case 'hypothesis':
        return hypothesis.trim() ? { kind: 'hypothesis', text: hypothesis.trim() } : null;
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
      case 'acrossLoops':
        return {
          kind: 'acrossLoops',
          ...(factKey.trim() ? { evidenceKey: factKey.trim() } : {}),
        };
      default:
        return null;
    }
  };

  const ask = () => {
    setError(null);
    const query = buildQuery();
    if (!query) {
      setAnswer(null);
      setError('This query needs a valid target parameter first.');
      return;
    }
    try {
      setAnswer(service.ask(query));
    } catch (cause) {
      setAnswer(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const askArchive = async () => {
    setArchiveError(null);
    setArchiveBusy(true);
    try {
      const state = session.getState();
      setArchive(
        await fetchMekoAdvisory({
          sessionId: String(state.sessionId),
          branchId: String(state.branchId),
          query: archiveQuery,
        }),
      );
    } catch (cause) {
      setArchive(null);
      setArchiveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setArchiveBusy(false);
    }
  };

  return (
    <div className="echo-layer">
      <button type="button" className="ledger-backdrop" aria-label="Close ECHO" onClick={onClose} />
      <aside className="echo-panel crt-frame" role="dialog" aria-modal="true" aria-labelledby="echo-title">
        <div className="echo-scanlines" aria-hidden="true" />
        <header className="echo-terminal-head">
          <div>
            <p className="micro terminal-tag">
              <span className="terminal-dot" /> SYSTEM // ECHO INVESTIGATION CONSOLE v2.4
            </p>
            <h2 id="echo-title" className="terminal-title">
              What the record can support
            </h2>
          </div>
          <button type="button" className="icon-btn console-close" onClick={onClose} aria-label="Close ECHO">
            ✕
          </button>
        </header>

        <p className="echo-intro mono">
          &gt; READ-ONLY PROVENANCE ARCHIVE: ECHO explains canonical facts, events, rules and
          MORROW audit records within timeline isolation. ECHO cannot command MORROW,
          alter surveillance, change evidence, or write game state.
        </p>

        <div className="echo-modes" role="group" aria-label="Query mode selection">
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
              <span className="echo-led" aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>

        {mode === 'fact' ? (
          <label className="echo-field">
            <span className="mono">&gt; FACT KEY</span>
            <input
              value={factKey}
              onChange={(event) => setFactKey(event.target.value)}
              placeholder="evidence.relay_7"
              className="mono"
            />
          </label>
        ) : null}

        {mode === 'acrossLoops' ? (
          <label className="echo-field">
            <span className="mono">&gt; EVIDENCE KEY ACROSS LOOPS (OPTIONAL)</span>
            <input
              value={factKey}
              onChange={(event) => setFactKey(event.target.value)}
              placeholder="evidence.vendor_testimony"
              className="mono"
            />
          </label>
        ) : null}

        {mode === 'archive' ? (
          <label className="echo-field">
            <span className="mono">&gt; MEKO ARCHIVE QUERY (ADVISORY ONLY)</span>
            <input
              value={archiveQuery}
              onChange={(event) => setArchiveQuery(event.target.value)}
              placeholder="Relay 7 zeroing charge ward protocol"
              className="mono"
            />
          </label>
        ) : null}

        {mode === 'decision' ? (
          <label className="echo-field">
            <span className="mono">&gt; DECISION NODE</span>
            <select value={nodeId} onChange={(event) => setNodeId(event.target.value)} className="mono">
              {content.choices.map((node) => (
                <option key={node.nodeId} value={node.nodeId}>
                  {node.nodeId}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {mode === 'hypothesis' ? (
          <label className="echo-field">
            <span className="mono">&gt; THEORY TO TEST</span>
            <input value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} className="mono" />
          </label>
        ) : null}

        {mode === 'compare' && otherBranches.length > 0 ? (
          <label className="echo-field">
            <span className="mono">&gt; TARGET TIMELINE</span>
            <select
              value={otherBranchId || fallbackOther}
              onChange={(event) => setOtherBranchId(event.target.value)}
              className="mono"
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
          <p className="echo-empty mono">
            [NOTICE] No secondary timeline discovered. Set an anchor on Relay Street, then BLINK to fork one.
          </p>
        ) : null}

        {mode === 'archive' ? (
          <button
            type="button"
            className="btn echo-ask"
            onClick={() => void askArchive()}
            disabled={archiveBusy || archiveQuery.trim().length < 2}
          >
            {archiveBusy ? 'Querying Meko…' : 'Query Meko archive'}
          </button>
        ) : (
          <button type="button" className="btn echo-ask" onClick={ask}>
            Execute Query ⏎
          </button>
        )}

        {archiveError ? <p className="echo-error mono">{archiveError}</p> : null}

        {mode === 'archive' && archive ? (
          <section className="echo-answer echo-archive" aria-live="polite">
            <div className="echo-answer-head">
              <span className="state-chip echo-status echo-status-unknown mono">
                ADVISORY: NOT CANONICAL
              </span>
              <span className="mono echo-scope">
                [SOURCE: {archive.source === 'remote' ? 'MEKO / YUGABASE' : 'LOCAL FALLBACK'}]
              </span>
            </div>
            <p className="echo-summary">
              External archive recall for “{archive.query}”. These excerpts can suggest where to
              look, but they cannot create evidence, change a fact, or decide an ending.
            </p>
            {archive.hits.length > 0 ? (
              <ul className="echo-archive-hits">
                {archive.hits.map((hit) => (
                  <li key={hit.id}>
                    <span className="mono echo-citation-kind">{hit.source.toUpperCase()}</span>
                    <p>{hit.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="echo-empty mono">
                [EMPTY] Meko returned no archive passage. The canonical Case Board is unchanged.
              </p>
            )}
            {archive.memories.length > 0 ? (
              <div className="echo-archive-memories">
                <p className="mono">&gt; NPC MEMORY RECALL</p>
                {archive.memories.map((memory, index) => (
                  <p key={`memory-${index}`}>{memory}</p>
                ))}
              </div>
            ) : null}
            <p className="echo-missing mono">
              &gt; MEKO STATUS: {archive.diagnostics.configured ? 'CONFIGURED' : 'NOT CONFIGURED'} ·{' '}
              {archive.diagnostics.online ? 'ONLINE' : 'FALLBACK'} · DATAPACK{' '}
              {archive.diagnostics.datapackId ?? 'NONE'}
            </p>
          </section>
        ) : null}

        {error ? <p className="echo-error mono">{error}</p> : null}

        {answer ? (
          <section className={`echo-answer echo-${answer.status}`} aria-live="polite">
            <div className="echo-answer-head">
              <span className={`state-chip echo-status echo-status-${answer.status} mono`}>
                STATUS: {answer.status.toUpperCase()}
              </span>
              <span className="mono echo-scope">[BRANCH: {answer.branchLabel ?? 'unscoped'}]</span>
            </div>
            <p className="echo-summary">{answer.summary}</p>

            {answer.claims.map((claim, index) => (
              <article key={`${claim.kind}-${index}`} className={`echo-claim echo-claim-${claim.kind}`}>
                <p className="mono echo-claim-kind">CLAIM // {claim.kind.replace('_', ' ').toUpperCase()}</p>
                <p className="echo-claim-body">{claim.text}</p>
                {claim.citations.length > 0 ? (
                  <ul className="echo-citations">
                    {claim.citations.map((citation) => (
                      <li key={`${citation.kind}-${citation.id}-${citation.sequenceNo ?? 0}`}>
                        <span className="mono echo-citation-kind">{citation.kind.toUpperCase()}</span>
                        <span className="mono echo-citation-id">
                          {citation.id}
                          {citation.sequenceNo !== null ? ` #${citation.sequenceNo}` : ''}
                        </span>
                        <span className="echo-citation-label">{citation.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mono echo-plain-label">
                  {claim.kind === 'recorded_fact' || claim.kind === 'recorded_event'
                    ? 'RECORDED: this is what the canonical log establishes.'
                    : claim.kind === 'derived_conclusion'
                      ? 'DERIVED: this follows from recorded rules and facts.'
                      : claim.kind === 'inference'
                        ? 'HYPOTHESIS: plausible, but not proof.'
                        : 'UNKNOWN: the current records cannot establish this.'}
                </p>
              </article>
            ))}

            {answer.missing.length > 0 ? (
              <p className="echo-missing mono">&gt; MISSING CAUSAL PREREQUISITES: {answer.missing.join(', ')}</p>
            ) : null}
          </section>
        ) : null}
      </aside>
    </div>
  );
}
