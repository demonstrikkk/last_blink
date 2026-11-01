import { useState } from 'react';
import type { BranchSummary, GameEvent, GameState } from '../engine/index.js';
import type { WorldView } from '../world/worldView.js';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'restored';

interface LedgerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly state: GameState;
  readonly view: WorldView;
  readonly hash: string;
  readonly events: readonly GameEvent[];
  readonly branches: readonly BranchSummary[];
  readonly saveState: SaveState;
  readonly lastSavedAt?: string | null;
  readonly lastSaveId?: string | null;
  readonly saveErrorMessage?: string | null;
  readonly isDurable?: boolean;
  readonly onSave: () => void;
  readonly onRestart: () => void;
  readonly onUpdateCaseLink: (params: { linkId: string; leftEvidenceId: string; rightEvidenceId: string; relation: 'supports' | 'contradicts' | 'corroborates' | 'uncertain'; note: string }) => void;
  readonly onUpdateHypothesis: (params: { hypothesisId: string; text: string; supportingEvidenceIds: string[]; opposingEvidenceIds: string[] }) => void;
  readonly onMakeCaseChoice: (nodeId: string, optionId: string) => void;
  readonly onCompleteChallenge: (params: { challengeId: string; challengeType: 'timeline_reconstruction' | 'contradiction_questioning'; answer: { order: string[] } | { question: 'ask_route_seal' | 'declare_slip_definitive' } }) => void;
}

export function Ledger({
  open,
  onClose,
  state,
  view,
  hash,
  events,
  branches,
  saveState,
  lastSavedAt,
  lastSaveId,
  saveErrorMessage,
  isDurable = true,
  onSave,
  onRestart,
  onUpdateCaseLink,
  onUpdateHypothesis,
  onMakeCaseChoice,
  onCompleteChallenge,
}: LedgerProps) {
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [relation, setRelation] = useState<'supports' | 'contradicts' | 'corroborates' | 'uncertain'>('uncertain');
  const [linkNote, setLinkNote] = useState('');
  const [hypothesisText, setHypothesisText] = useState('');
  const [hypothesisId, setHypothesisId] = useState('theory_morrow');
  const [supporting, setSupporting] = useState<string[]>([]);
  const [opposing, setOpposing] = useState<string[]>([]);
  const [signalAnswer, setSignalAnswer] = useState('');
  const [signalFeedback, setSignalFeedback] = useState<string | null>(null);
  const [timelineOrder, setTimelineOrder] = useState(['relay_7_log', 'ward_dispatch', 'vendor_testimony']);
  const [timelineFeedback, setTimelineFeedback] = useState<string | null>(null);
  const [contradictionFeedback, setContradictionFeedback] = useState<string | null>(null);
  if (!open) return null;

  const timelineCompleted = state.challengeResults.some((result) => result.challengeId === 'challenge_timeline_relay7');
  const contradictionCompleted = state.challengeResults.some((result) => result.challengeId === 'challenge_dispatch_contradiction');
  const signalCompleted = state.choices.some((choice) => choice.nodeId === 'node.frequency.puzzle');
  const facts = Object.entries(state.facts).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const recent = [...events].slice(-12).reverse();
  const timelineName = (branchId: string): string => {
    const found = branches.find((branch) => String(branch.branchId) === branchId);
    return found ? `V${found.timelineIndex + 1}` : 'V?';
  };
  const lineage = new Map<string, BranchSummary>(
    branches.map((branch) => [String(branch.branchId), branch]),
  );
  const chain: string[] = [];
  let cursor: string | null = String(state.branchId);
  while (cursor && lineage.has(cursor) && chain.length < 16) {
    chain.unshift(cursor);
    const parent: BranchSummary['parentBranchId'] | undefined = lineage.get(cursor)?.parentBranchId;
    cursor = parent ? String(parent) : null;
  }
  const selectedLink = view.caseAssessment.links.find(
    (link) => selectedEvidence.includes(link.leftEvidenceId) && selectedEvidence.includes(link.rightEvidenceId),
  );

  return (
    <div className="ledger-layer">
      <button type="button" className="ledger-backdrop" aria-label="Close ledger" onClick={onClose} />
      <aside className="ledger" role="dialog" aria-modal="true" aria-labelledby="ledger-title">
        <header className="ledger-head">
          <div>
            <p className="micro">ENGINE LEDGER</p>
            <h2 id="ledger-title">Canonical state</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close ledger">
            ✕
          </button>
        </header>

        <dl className="ledger-stats">
          <div>
            <dt>State version</dt>
            <dd className="mono">v{state.stateVersion}</dd>
          </div>
          <div>
            <dt>Tick</dt>
            <dd className="mono">{state.tick}</dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd className="mono">{state.player.progress.evidenceFound}</dd>
          </div>
          <div>
            <dt>Choices</dt>
            <dd className="mono">{state.player.progress.choicesMade}</dd>
          </div>
          <div>
            <dt>Anchors</dt>
            <dd className="mono">{state.anchors.length}</dd>
          </div>
          <div className="ledger-stat-ending">
            <dt>Ending</dt>
            <dd className="mono">{state.endingId ?? '—'}</dd>
          </div>
        </dl>

        <div className="ledger-hash">
          <p className="micro">STATE HASH</p>
          <p className="mono">{hash}</p>
          <p className="micro">SESSION</p>
          <p className="mono">{state.sessionId}</p>
        </div>

        <section className="ledger-section" aria-labelledby="ledger-lineage">
          <h3 id="ledger-lineage">Timeline lineage</h3>
          <ol className="lineage-list">
            {chain.map((branchId) => {
              const branch = lineage.get(branchId);
              if (!branch) return null;
              const active = branchId === String(state.branchId);
              return (
                <li key={branchId} className={active ? 'lineage-active' : undefined}>
                  <span className="mono lineage-tag">{timelineName(branchId)}</span>
                  <span className="lineage-label">{branch.label}</span>
                  <span className="mono lineage-meta">
                    {branch.branchId} · v{branch.stateVersion} · {branch.stateHash}
                  </span>
                  {branch.checkpoint ? (
                    <span className="mono lineage-meta">
                      forked at {branch.checkpoint.anchorId} · checkpoint v
                      {branch.checkpoint.stateVersion} · event {branch.checkpoint.eventSequenceNo}
                    </span>
                  ) : (
                    <span className="mono lineage-meta">root timeline</span>
                  )}
                </li>
              );
            })}
          </ol>
          {branches.length > chain.length ? (
            <p className="mono lineage-meta">
              {branches.length - chain.length} other timeline
              {branches.length - chain.length === 1 ? '' : 's'} in this session.
            </p>
          ) : null}
        </section>

        <section className="ledger-section" aria-labelledby="ledger-facts">
          <h3 id="ledger-facts">Facts ({facts.length})</h3>
          <ul className="fact-list">
            {facts.map(([key, fact]) => (
              <li key={key}>
                <span className="mono fact-key">{key}</span>
                <span className="mono fact-value">{JSON.stringify(fact.value)}</span>
                <span className="fact-kind">{fact.kind}</span>
                <span className="mono fact-source">
                  {fact.source.kind}:{fact.source.ref} · {fact.sourceEventId}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="ledger-section" aria-labelledby="ledger-evidence">
          <h3 id="ledger-evidence">Evidence ledger ({view.evidence.length})</h3>
          <p className="note-muted">
            Canonical discoveries remain branch-scoped. Testimony is a claim; technical records
            are not automatically proof of who caused the discrepancy.
          </p>
          <ul className="evidence-ledger-list">
            {view.evidence.map((evidence) => (
              <li
                key={evidence.evidenceId}
                className={`evidence-ledger-item${evidence.collected ? ' evidence-collected' : ''}`}
              >
                <div className="evidence-ledger-head">
                  <strong>{evidence.label}</strong>
                  <span className="mono state-chip">
                    {evidence.collected ? evidence.verificationStatus.replace('_', ' ') : 'UNCOLLECTED'}
                  </span>
                </div>
                <p>{evidence.summary}</p>
                <dl className="evidence-ledger-meta">
                  <div>
                    <dt>Source</dt>
                    <dd className="mono">{evidence.sourceKind} · {evidence.provenance}</dd>
                  </div>
                  <div>
                    <dt>Discovery</dt>
                    <dd>{evidence.discoveryContext}</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd className="mono">{Math.round(evidence.confidence * 100)}%</dd>
                  </div>
                  <div>
                    <dt>Timeline</dt>
                    <dd className="mono">{evidence.timelineBranch}</dd>
                  </div>
                </dl>
                {evidence.contradictionNote ? (
                  <p className="evidence-contradiction">
                    <span className="micro">CONTRADICTION</span> {evidence.contradictionNote}
                  </p>
                ) : null}
                <p className="mono evidence-related">RELATED // {evidence.relatedRef}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="ledger-section" aria-labelledby="case-board">
          <h3 id="case-board">Case board</h3>
          <p className="note-muted">
            Select two collected records to test a meaningful connection. The engine only recognizes
            relationships grounded in the authored evidence model; an unknown pair remains unproven.
          </p>
           <div className="case-board-verdict">
             <span className="micro">MORROW JUDGMENT</span>
             <strong>{view.caseAssessment.title}</strong>
             <p>{view.caseAssessment.explanation}</p>
             <dl className="verdict-citations">
               <div><dt>Supports assessment</dt><dd>{view.caseAssessment.supportingEvidenceIds.length > 0 ? view.caseAssessment.supportingEvidenceIds.join(', ') : 'none established'}</dd></div>
               <div><dt>Contradicts / harms</dt><dd>{view.caseAssessment.contradictoryEvidenceIds.length > 0 ? view.caseAssessment.contradictoryEvidenceIds.join(', ') : 'none established'}</dd></div>
               <div><dt>Still unknown</dt><dd>{view.caseAssessment.missingEvidenceIds.length > 0 ? view.caseAssessment.missingEvidenceIds.join(', ') : 'no material gaps in this projection'}</dd></div>
             </dl>
           </div>
           {state.challengeResults.length > 0 ? (
             <ul className="case-link-list" aria-label="Validated challenge outcomes">
               {state.challengeResults.map((result) => (
                 <li key={result.challengeId}>
                   <span className="mono">{result.outcome}</span> {result.establishes}
                   <span className="mono"> · unknown: {result.remainsUnknown}</span>
                 </li>
               ))}
             </ul>
           ) : null}
          <div className="case-board-picks" role="group" aria-label="Evidence to connect">
            {view.collectedEvidence.map((evidence) => {
              const selected = selectedEvidence.includes(evidence.evidenceId);
              return (
                <button
                  key={evidence.evidenceId}
                  type="button"
                  className={`btn btn-quiet${selected ? ' choice-active' : ''}`}
                  onClick={() => setSelectedEvidence((current) => {
                    if (selected) return current.filter((id) => id !== evidence.evidenceId);
                    return current.length >= 2 ? [current[1]!, evidence.evidenceId] : [...current, evidence.evidenceId];
                  })}
                >
                  {selected ? '✓ ' : ''}{evidence.label}
                </button>
              );
            })}
          </div>
           {selectedEvidence.length === 2 ? (
             <>
               <div className="case-board-result" role="status">
                 {selectedLink ? (
                   <>
                     <p className="micro">{selectedLink.relation.toUpperCase()} // ESTABLISHED</p>
                     <p>{selectedLink.explanation}</p>
                   </>
                 ) : (
                   <>
                     <p className="micro">NO AUTHORED CONNECTION // UNKNOWN</p>
                     <p>These records can remain in the case, but the available evidence does not justify linking them yet.</p>
                   </>
                 )}
               </div>
           {selectedEvidence.length === 2 ? (
             <form className="case-board-editor" onSubmit={(event) => {
               event.preventDefault();
               onUpdateCaseLink({
                 linkId: `link_${selectedEvidence.slice().sort().join('_')}`,
                 leftEvidenceId: selectedEvidence[0]!,
                 rightEvidenceId: selectedEvidence[1]!,
                 relation,
                 note: linkNote || 'Player comparison recorded without an additional note.',
               });
             }}>
               <label>Relationship<select value={relation} onChange={(event) => setRelation(event.target.value as typeof relation)}><option value="supports">Supports</option><option value="contradicts">Contradicts</option><option value="corroborates">Corroborates</option><option value="uncertain">Uncertain</option></select></label>
               <label>Why connect them<textarea value={linkNote} onChange={(event) => setLinkNote(event.target.value)} placeholder="Record your inference; canonical facts remain separate." /></label>
               <button type="submit" className="btn">Save connection to {timelineName(String(state.branchId))}</button>
             </form>
           ) : null}
           <form className="case-board-editor" onSubmit={(event) => {
             event.preventDefault();
             if (!hypothesisText.trim()) return;
             onUpdateHypothesis({ hypothesisId, text: hypothesisText, supportingEvidenceIds: supporting, opposingEvidenceIds: opposing });
           }}>
             <h4>Player hypotheses</h4>
             <label>Hypothesis ID<input value={hypothesisId} onChange={(event) => setHypothesisId(event.target.value)} /></label>
             <label>Working theory<textarea value={hypothesisText} onChange={(event) => setHypothesisText(event.target.value)} placeholder="What do you think MORROW knew or chose?" /></label>
             <div className="case-board-picks"><span className="micro">Attach supporting / opposing evidence</span>{view.collectedEvidence.map((evidence) => <button key={`support-${evidence.evidenceId}`} type="button" className={`btn btn-quiet${supporting.includes(evidence.evidenceId) ? ' choice-active' : ''}`} onClick={() => setSupporting((items) => items.includes(evidence.evidenceId) ? items.filter((id) => id !== evidence.evidenceId) : [...items, evidence.evidenceId])}>+ {evidence.label}</button>)}{view.collectedEvidence.map((evidence) => <button key={`oppose-${evidence.evidenceId}`} type="button" className={`btn btn-quiet${opposing.includes(evidence.evidenceId) ? ' choice-active' : ''}`} onClick={() => setOpposing((items) => items.includes(evidence.evidenceId) ? items.filter((id) => id !== evidence.evidenceId) : [...items, evidence.evidenceId])}>− {evidence.label}</button>)}</div>
             <button type="submit" className="btn">Save / revise hypothesis</button>
           </form>
            {state.hypotheses.length > 0 ? <ul className="case-link-list">{state.hypotheses.map((hypothesis) => <li key={hypothesis.hypothesisId}><strong>{hypothesis.status.toUpperCase()}</strong> {hypothesis.text}<span className="mono"> · {timelineName(String(hypothesis.branchId))} · support {hypothesis.supportingEvidenceIds.length} / oppose {hypothesis.opposingEvidenceIds.length}</span></li>)}</ul> : null}
              </>
            ) : (
              <p className="mono evidence-related">Choose two collected records to compare.</p>
            )}

              <section className="challenge-grid" aria-labelledby="case-challenges">
             <h4 id="case-challenges">Investigation challenges</h4>
             <article className="challenge-card">
               <span className="micro">SIGNAL RECONSTRUCTION · V{view.timeline.index + 1}</span>
               <p>Read the diner guestbook fragment and reconstruct the ward channel. The answer must match the recorded frequency; it does not prove who issued the command.</p>
               <div className="button-row"><button type="button" className={`btn btn-quiet${signalAnswer === '434.8MHz' ? ' choice-active' : ''}`} onClick={() => setSignalAnswer('434.8MHz')}>434.8 MHz</button><button type="button" className={`btn btn-quiet${signalAnswer === '433.2MHz' ? ' choice-active' : ''}`} onClick={() => setSignalAnswer('433.2 MHz')}>433.2 MHz</button><button type="button" className="btn" disabled={signalCompleted} onClick={() => { if (signalCompleted) return; if (signalAnswer === '434.8MHz') { setSignalFeedback('Correct: the 434.8 MHz fragment matches clue_guestbook. This establishes the surveillance channel, not the author of the order.'); onMakeCaseChoice('node.frequency.puzzle', 'tune'); } else setSignalFeedback('Not established: compare the number in clue_guestbook again. The wrong frequency cannot identify the channel.'); }}>Reconstruct signal</button></div>
               {signalFeedback ? <p className="challenge-feedback" role="status">{signalFeedback}</p> : null}
             </article>
             <article className="challenge-card">
               <span className="micro">TIMELINE RECONSTRUCTION · RECORDED EVENTS</span>
               <p>Arrange the dispatch evidence before the witness recollection. Use the arrows to test the order; a plausible order still leaves the clock discrepancy unresolved.</p>
               <ol className="challenge-order">{timelineOrder.map((id, index) => <li key={id}><span className="mono">{id}</span><button type="button" className="btn btn-quiet" disabled={index === 0} onClick={() => setTimelineOrder((items) => { const next = [...items]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next; })}>↑</button><button type="button" className="btn btn-quiet" disabled={index === timelineOrder.length - 1} onClick={() => setTimelineOrder((items) => { const next = [...items]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; return next; })}>↓</button></li>)}</ol>
               <button type="button" className="btn" disabled={timelineCompleted} onClick={() => { if (timelineCompleted) return; const correct = timelineOrder.join(',') === 'relay_7_log,ward_dispatch,vendor_testimony'; setTimelineFeedback(correct ? 'Plausible order: Relay 7 record → ward dispatch → vendor testimony. This establishes sequence only; the eight-minute clock conflict remains an unknown.' : 'That order conflicts with the recorded context. Start with the Relay 7 technical record, then the dispatch record, then the witness recollection.'); if (correct) onCompleteChallenge({ challengeId: 'challenge_timeline_relay7', challengeType: 'timeline_reconstruction', answer: { order: timelineOrder } }); }}>{timelineCompleted ? 'Timeline result recorded' : 'Check recorded order'}</button>
               {timelineFeedback ? <p className="challenge-feedback" role="status">{timelineFeedback}</p> : null}
             </article>
             <article className="challenge-card">
               <span className="micro">CONTRADICTION QUESTIONING · WITNESS CLAIM VS RECORD</span>
               <p>Present the ward dispatch slip against the vendor testimony. Choose a follow-up that tests the contradiction rather than assuming either source is complete.</p>
               <div className="button-row"><button type="button" className="btn btn-quiet" disabled={contradictionCompleted} onClick={() => { if (contradictionCompleted) return; setContradictionFeedback('Useful follow-up: ask who sealed the route and when. The testimony undermines the authorized-route claim, but does not establish who altered the slip.'); onCompleteChallenge({ challengeId: 'challenge_dispatch_contradiction', challengeType: 'contradiction_questioning', answer: { question: 'ask_route_seal' } }); }}>Ask who sealed the route</button><button type="button" className="btn btn-quiet" onClick={() => setContradictionFeedback('Weak inference: treating the dispatch slip as conclusive ignores the vendor testimony. Compare provenance before assigning blame.')}>Declare the slip definitive</button></div>
               {contradictionFeedback ? <p className="challenge-feedback" role="status">{contradictionFeedback}</p> : null}
             </article>
              </section>
          <ul className="case-link-list">
            {view.caseAssessment.links.filter((link) => link.established).map((link) => (
              <li key={`${link.leftEvidenceId}:${link.rightEvidenceId}`}>
                <span className="mono">{link.relation}</span> {link.leftEvidenceId} ↔ {link.rightEvidenceId}
              </li>
            ))}
          </ul>
          {view.caseAssessment.missingEvidenceIds.length > 0 ? (
            <p className="note-muted">
              Missing material checks: {view.caseAssessment.missingEvidenceIds.join(', ')}
            </p>
          ) : null}
        </section>

        <section className="ledger-section" aria-labelledby="ledger-events">
            <h3 id="ledger-events">Recent canonical events</h3>
          {recent.length === 0 ? (
            <p className="note-muted">No events yet.</p>
          ) : (
            <ol className="event-list">
              {recent.map((event) => (
                <li key={event.eventId}>
                  <span className="mono event-seq">{String(event.sequenceNo).padStart(3, '0')}</span>
                  <span className="event-type">{event.type}</span>
                  <span className="mono event-meta">{timelineName(event.branchId)} · {event.sourceId}</span>
                  <span className="mono event-id">{event.eventId}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="ledger-section ledger-actions" aria-labelledby="ledger-save">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 id="ledger-save" style={{ margin: 0 }}>Persistence & Session</h3>
            <span className="mono phase-chip" style={{ fontSize: '0.75rem' }}>
              {saveState === 'saving'
                ? 'SAVING…'
                : saveState === 'saved'
                  ? 'SAVED'
                  : saveState === 'restored'
                    ? 'RESTORED'
                    : saveState === 'error'
                      ? 'SAVE FAILED'
                      : isDurable
                        ? 'DURABLE (IDB)'
                        : 'IN-MEMORY'}
            </span>
          </div>
          <div className="button-row" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn" onClick={onSave} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Saving…' : isDurable ? 'Save to IndexedDB' : 'Snapshot to memory'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={onRestart}>
              New session
            </button>
          </div>
          <p className="mono session-note" role="status" aria-live="polite">
            {saveState === 'saving'
              ? 'Writing atomic snapshot, branch runtimes, and event logs to IndexedDB…'
              : saveState === 'saved'
                ? `Saved to IndexedDB (${lastSaveId ?? 'envelope'} · ${lastSavedAt ?? 'just now'}). Session survives browser reload.`
                : saveState === 'restored'
                  ? `Restored from IndexedDB (${lastSaveId ?? 'envelope'}). V1/V2 branch runtimes and logs intact.`
                  : saveState === 'error'
                    ? `Save failed: ${saveErrorMessage ?? 'Transaction error. Previous save remains untouched.'}`
                    : isDurable
                      ? `IndexedDB persistence active. ${lastSavedAt ? `Last save: ${lastSavedAt}` : 'No save written yet this session.'}`
                      : 'Persistence is in memory only. Refreshing restarts the street.'}
          </p>
        </section>
      </aside>
    </div>
  );
}
