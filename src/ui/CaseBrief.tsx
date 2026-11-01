import { useEffect, useRef, useState } from 'react';
import type { WorldView } from '../world/worldView.js';

interface CaseBriefProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly view: WorldView;
}

/**
 * The onboarding brief. It explains the story, the day, the investigator's job
 * and the system boundaries in plain language. It never reveals a MORROW target
 * or a hidden fact: every line is either authored premise or current HUD data.
 */
export function CaseBrief({ open, onClose, view }: CaseBriefProps) {
  const [beat, setBeat] = useState(0);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const isLastBeat = beat === 2;

  useEffect(() => {
    if (open) {
      setBeat(0);
      primaryRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const next = () => {
    if (isLastBeat) onClose();
    else setBeat((current) => current + 1);
  };

  return (
    <div className="brief-layer">
      <button type="button" className="ledger-backdrop" aria-label="Close case brief" onClick={onClose} />
      <section className="brief-modal brief-onboarding" role="dialog" aria-modal="true" aria-labelledby="case-brief-title">
        <header className="brief-modal-head">
          <div>
            <p className="micro mono">THE LAST BLINK // {String(beat + 1).padStart(2, '0')} / 03</p>
            <h2 id="case-brief-title">
              {beat === 0 ? 'Aster has one day left.' : beat === 1 ? 'The record does not agree with itself.' : 'Your instruments are not answers.'}
            </h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close case brief">✕</button>
        </header>

        <div className="brief-modal-body brief-onboarding-body">
          {beat === 0 ? <section><p className="micro mono">THE DEADLINE</p><p>At 18:00, the Second Settlement names someone responsible for eight missing minutes at Relay 7. It will not wait for certainty.</p><p>Records, decisions and challenges spend time. Walking, reading, PULSE and ECHO do not. You are at <strong>{view.clock.label}</strong>, with <strong>{view.clock.remainingLabel}</strong> left.</p></section> : null}
          {beat === 1 ? <section><p className="micro mono">THE JOB</p><p>Relay hardware logged through the blackout. The city clock says no blackout happened. Neither statement is automatically a lie.</p><p>Read physical records first. Treat testimony as a claim with a source, a time and a reason to change. The Case Board keeps contradictions visible; it never declares a winner for you.</p></section> : null}
          {beat === 2 ? <section><p className="micro mono">TWO TOOLS</p><p><strong>PULSE [Q]</strong> is free orientation: it points to a reachable lead, missing records and current pressure. It does not tell you what a clue means.</p><p><strong>ECHO [C]</strong> preserves provenance across timelines. BLINK can fork from an anchor, but every branch is a cost: use it when a different decision would teach you something.</p><p className="mono brief-controls">WASD move · E interact · Q PULSE · C ECHO · B BLINK · L Case Board</p></section> : null}
        </div>

        <footer className="brief-modal-actions">
          <div className="brief-beat-dots" aria-label={`Brief step ${beat + 1} of 3`}>{[0, 1, 2].map((step) => <span key={step} className={step === beat ? 'is-current' : undefined} />)}</div>
          <button ref={primaryRef} type="button" className="btn btn-primary" onClick={next}>{isLastBeat ? 'Enter Relay Street' : 'Continue'}</button>
        </footer>
      </section>
    </div>
  );
}
