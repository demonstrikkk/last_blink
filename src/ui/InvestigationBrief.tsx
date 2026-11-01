import { useMemo } from 'react';
import type { GameState } from '../engine/index.js';
import type { EvidenceView, WorldView } from '../world/worldView.js';
import { evidenceArt, puzzleArt } from './investigationArt.js';
import { PuzzleBody } from './PuzzleBody.js';

interface InvestigationBriefProps {
  readonly state: GameState;
  readonly view: WorldView;
  readonly loopSnapshots: readonly GameState[];
  readonly onMakeCaseChoice: (nodeId: string, optionId: string) => void;
  readonly onCompleteChallenge: (params: {
    challengeId: string;
    challengeType: 'timeline_reconstruction' | 'contradiction_questioning';
    answer: { order: string[] } | { question: 'ask_route_seal' | 'declare_slip_definitive' };
  }) => void;
  readonly onOpenEcho?: () => void;
  readonly onOpenLedger?: () => void;
}

const TACTIC_LABEL: Readonly<Record<string, string>> = {
  discredit_witness: 'Discredit a witness',
  redirect_attention: 'Redirect attention',
  seed_rumour: 'Seed a rumour',
  erase_detail: 'Erase a detail',
  reinforce_confidence: 'Reinforce a false certainty',
};

function evidenceRow(item: EvidenceView) {
  const art = evidenceArt(item.evidenceId);
  return (
    <li key={item.evidenceId} className="brief-record">
      {art ? <img src={art} alt="" width={40} height={40} loading="lazy" /> : null}
      <div>
        <strong>{item.label}</strong>
        <p>{item.summary}</p>
        <p className="mono brief-record-meta">
          {item.sourceKind} · {Math.round(item.confidence * 100)}% · {item.provenance}
        </p>
      </div>
    </li>
  );
}

function snapshotLabel(snapshot: GameState): string {
  const branch = snapshot.branches.find((item) => item.branchId === snapshot.branchId);
  return `V${(branch?.timelineIndex ?? 0) + 1} · LOOP ${snapshot.loop.index}`;
}

function snapshotOutcome(snapshot: GameState): string {
  if (snapshot.endingId) return snapshot.endingId.replace('ending.', '').replace(/_/g, ' ');
  if (snapshot.catastrophe.status === 'occurred') return '18:00 catastrophe';
  if (snapshot.catastrophe.status === 'averted') return 'averted';
  return `${snapshot.tick}/600`;
}

export function InvestigationBrief({
  state,
  view,
  loopSnapshots,
  onMakeCaseChoice,
  onCompleteChallenge,
  onOpenEcho,
  onOpenLedger,
}: InvestigationBriefProps) {
  const verified = view.collectedEvidence.filter((item) => item.sourceKind !== 'testimony');
  const claims = view.collectedEvidence.filter((item) => item.sourceKind === 'testimony');
  const conflicts = useMemo(
    () =>
      view.evidence.filter(
        (item) => item.collected && (item.contradictionNote !== null || item.verificationStatus === 'unverified_claim'),
      ),
    [view.evidence],
  );
  const disarmed = view.attackPlan.disarmed;
  const nextStep =
    view.objectives.find((objective) => !objective.done && !objective.optional) ?? null;
  const uniqueSnapshots = useMemo(() => {
    const seen = new Set<string>();
    return [...loopSnapshots]
      .sort((left, right) => left.loop.index - right.loop.index)
      .filter((snapshot) => {
        const key = String(snapshot.branchId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(-6);
  }, [loopSnapshots]);

  return (
    <div className="brief">
      <section className="brief-hero">
        <div>
          <p className="micro mono">CASE BRIEF // LOOP {view.loop.index} // V{view.timeline.index + 1}</p>
          <h3>One day. One device. One chance to cut it.</h3>
          <p>
            Aster wakes at 08:00 with every clock already lying. MORROW has a zeroing order
            scheduled for 18:00 and a charge wired into Relay 7. Follow the physical record,
            separate it from what witnesses claim, and cut the charge before the street goes dark.
          </p>
          <p className="brief-time-note mono">
            TIME RULE // A record or decision costs 1 hour · a challenge costs 1h 30m · walking,
            panels and PULSE [Q] are free. PULSE names the nearest reachable lead, the records
            still missing, and MORROW pressure. It never changes a fact.
          </p>
        </div>
        <div className="brief-clock">
          <span className="mono">{view.clock.label}</span>
          <strong>{view.clock.remainingLabel} left</strong>
          <div className="brief-clock-track" aria-hidden="true">
            <span style={{ width: `${Math.round(view.clock.progress * 100)}%` }} />
          </div>
          <span className="mono">{nextStep ? nextStep.label : 'All listed objectives complete'}</span>
        </div>
      </section>

      <section className="brief-section" aria-labelledby="brief-device">
        <div className="brief-section-head">
          <div>
            <p className="micro mono">MORROW ATTACK PLAN</p>
            <h4 id="brief-device">The Relay 7 zeroing device</h4>
          </div>
          <span className={`state-chip${view.attackPlan.reconstructed ? ' chip-good' : ' chip-warn'}`}>
            {disarmed ? 'DISARMED' : view.attackPlan.reconstructed ? 'RECONSTRUCTED' : 'INCOMPLETE'}
          </span>
        </div>
        <ol className="brief-chain">
          {view.attackPlan.steps.map((step, index) => {
            const art = step.evidenceId ? evidenceArt(step.evidenceId) : null;
            const active = step.stepId === 'countermeasure';
            return (
              <li
                key={step.stepId}
                className={`brief-chain-step${step.found ? ' step-found' : ''}${active ? ' step-counter' : ''}`}
              >
                <span className="mono brief-chain-index">{String(index + 1).padStart(2, '0')}</span>
                {art ? <img src={art} alt="" width={36} height={36} loading="lazy" /> : null}
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.detail}</p>
                </div>
                <span className="mono brief-chain-state">{step.found ? 'FOUND' : 'MISSING'}</span>
              </li>
            );
          })}
        </ol>
        {view.attackPlan.missing.length > 0 ? (
          <p className="brief-hint">
            <span className="micro mono">NEXT LEAD</span> {view.attackPlan.missing[0]}. Use the
            Case Board records to see where each item came from.
          </p>
        ) : (
          <p className="brief-hint">
            <span className="micro mono">DEVICE LEGIBLE</span> Every physical link is on the
            record. The countermeasure is ready at Relay 7.
          </p>
        )}
      </section>

      <section className="brief-section" aria-labelledby="brief-cut">
        <div className="brief-section-head">
          <div>
            <p className="micro mono">COUNTERMEASURE</p>
            <h4 id="brief-cut">Cut the zeroing charge</h4>
          </div>
          <img src={puzzleArt('bomb')} alt="" width={48} height={48} loading="lazy" />
        </div>
        <PuzzleBody
          kind="bomb"
          state={state}
          view={view}
          onMakeCaseChoice={onMakeCaseChoice}
          onCompleteChallenge={onCompleteChallenge}
        />
      </section>

      <section className="brief-section" aria-labelledby="brief-records">
        <div className="brief-section-head">
          <div>
            <p className="micro mono">EVIDENCE SORT</p>
            <h4 id="brief-records">What the record proves, and what it only claims</h4>
          </div>
          {onOpenLedger ? (
            <button type="button" className="btn btn-quiet" onClick={onOpenLedger}>
              Open raw ledger
            </button>
          ) : null}
        </div>
        <div className="brief-columns">
          <div>
            <p className="micro mono brief-col-title">PROVEN RECORDS · {verified.length}</p>
            <ul className="brief-records">
              {verified.length > 0 ? verified.map(evidenceRow) : <li className="brief-empty">No physical record collected yet.</li>}
            </ul>
          </div>
          <div>
            <p className="micro mono brief-col-title">WITNESS CLAIMS · {claims.length}</p>
            <ul className="brief-records">
              {claims.length > 0 ? claims.map(evidenceRow) : <li className="brief-empty">No testimony recorded yet.</li>}
            </ul>
          </div>
          <div>
            <p className="micro mono brief-col-title">UNRESOLVED CONFLICTS · {conflicts.length}</p>
            <ul className="brief-records">
              {conflicts.length > 0 ? (
                conflicts.map((item) => (
                  <li key={`conflict-${item.evidenceId}`} className="brief-record brief-conflict">
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.contradictionNote ?? 'This claim still needs a physical anchor.'}</p>
                      <p className="mono brief-record-meta">
                        {item.verificationStatus.replace('_', ' ')} · {Math.round(item.confidence * 100)}%
                      </p>
                    </div>
                  </li>
                ))
              ) : (
                <li className="brief-empty">No contradiction on the board.</li>
              )}
            </ul>
          </div>
        </div>
      </section>

      <section className="brief-section" aria-labelledby="brief-loops">
        <div className="brief-section-head">
          <div>
            <p className="micro mono">CROSS-TIMELINE SORT</p>
            <h4 id="brief-loops">What survived from earlier loops</h4>
          </div>
          {onOpenEcho ? (
            <button type="button" className="btn btn-quiet" onClick={onOpenEcho}>
              Ask ECHO
            </button>
          ) : null}
        </div>
        {uniqueSnapshots.length <= 1 ? (
          <p className="brief-hint">
            No earlier loop is retained yet. Reach 18:00, then return to 08:00 to compare what
            changed.
          </p>
        ) : (
          <div className="brief-table-wrap">
            <table className="brief-table">
              <thead>
                <tr>
                  <th scope="col">Timeline</th>
                  <th scope="col">Evidence</th>
                  <th scope="col">Zeroing order</th>
                  <th scope="col">Charge cut</th>
                  <th scope="col">MORROW pressure</th>
                  <th scope="col">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {uniqueSnapshots.map((snapshot) => {
                  const facts = snapshot.facts;
                  const count = Object.keys(facts).filter((key) => key.startsWith('evidence.')).length;
                  const active = snapshot.branchId === state.branchId;
                  return (
                    <tr key={String(snapshot.branchId)} className={active ? 'brief-row-active' : undefined}>
                      <th scope="row">
                        {snapshotLabel(snapshot)}
                        {active ? <span className="mono"> · active</span> : null}
                      </th>
                      <td className="mono">{count}/{view.evidence.length}</td>
                      <td className="mono">{facts['evidence.zeroing_order'] ? 'YES' : '—'}</td>
                      <td className="mono">
                        {facts['story.bomb_disarmed'] ? 'CUT' : facts['story.attack_chain'] ? 'ARMED' : '—'}
                      </td>
                      <td className="mono">
                        {snapshot.morrowPlan ? TACTIC_LABEL[snapshot.morrowPlan.tactic] ?? snapshot.morrowPlan.tactic : '—'}
                      </td>
                      <td className="mono">{snapshotOutcome(snapshot)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="brief-hint">
          A difference across timelines is a lead, not proof. ECHO keeps every source attached
          and never decides which version is true.
        </p>
      </section>
    </div>
  );
}
