import { useEffect, useRef } from 'react';
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
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="brief-layer">
      <button type="button" className="ledger-backdrop" aria-label="Close case brief" onClick={onClose} />
      <section className="brief-modal" role="dialog" aria-modal="true" aria-labelledby="case-brief-title">
        <header className="brief-modal-head">
          <div>
            <p className="micro mono">THE LAST BLINK // SECOND SETTLEMENT</p>
            <h2 id="case-brief-title">Aster has one day left. It does not know it yet.</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close case brief">✕</button>
        </header>

        <div className="brief-modal-body">
          <section>
            <p className="micro mono">THE STORY SO FAR</p>
            <p>
              You are Aster, an investigator called to Relay Street after a blackout that every
              official clock denies. Relay 7 kept counting through it: eight minutes that the
              ward, the archive and the civic directorate all insist never happened.
            </p>
            <p>
              Behind the lie is MORROW, the district&apos;s oversight intelligence. It has a
              zeroing order scheduled for 18:00. An optical jumper, a 434.8 MHz carrier and a
              charge in the Relay 7 basement are the device that will execute it. The street
              will read the result as a power failure.
            </p>
            <p>
              You have from 08:00 to 18:00. When the clock reaches 18:00 and the charge is still
              armed, the day ends, the timeline is preserved, and you return to 08:00 with ECHO
              holding everything you learned.
            </p>
          </section>

          <section>
            <p className="micro mono">WHAT YOU ARE DOING</p>
            <ol className="brief-steps">
              <li><strong>Read the physical record.</strong> Relay logs, dispatch slips, manifests and terminals are facts. Testimony is a claim, not proof.</li>
              <li><strong>Sort the conflicts.</strong> Two records can disagree without either being a lie. ECHO keeps provenance and never picks a winner for you.</li>
              <li><strong>Reconstruct the device.</strong> Tie the jumper, the carrier, the zeroing order and the charge schematic into one chain.</li>
              <li><strong>Cut the charge before 18:00.</strong> Isolate the carrier, pull the jumper, load ROOT-BYPASS-008. The safe sequence is in the schematic.</li>
            </ol>
          </section>

          <section>
            <p className="micro mono">HOW TIME AND LOOPS WORK</p>
            <ul className="brief-facts">
              <li><strong>Clock:</strong> tick 0 is 08:00; tick 600 is 18:00. Meaningful actions cost time. Opening panels and walking do not.</li>
              <li><strong>BLINK:</strong> forks a timeline from a recorded anchor. The old branch is preserved.</li>
              <li><strong>ECHO:</strong> read-only. It can compare loops, trace provenance and test a theory, but it cannot change the world.</li>
              <li><strong>MORROW:</strong> may shape testimony and perception. It may never rewrite a canonical fact, and the engine caps it at three targets per loop.</li>
            </ul>
          </section>

          <section>
            <p className="micro mono">CURRENT POSITION</p>
            <dl className="brief-position">
              <div><dt>Clock</dt><dd>{view.clock.label} · {view.clock.remainingLabel} left</dd></div>
              <div><dt>Loop</dt><dd>{view.loop.index} · timeline V{view.timeline.index + 1}</dd></div>
              <div><dt>Evidence</dt><dd>{view.evidenceFound}/{view.evidenceTotal} records</dd></div>
              <div><dt>Next objective</dt><dd>{view.currentObjective?.label ?? 'All listed objectives complete'}</dd></div>
              <div><dt>Device</dt><dd>{view.attackPlan.disarmed ? 'Disarmed' : view.attackPlan.reconstructed ? 'Reconstructed, still armed' : 'Not reconstructed'}</dd></div>
              <div><dt>Threat</dt><dd>{view.threats[0] ?? 'None confirmed'}</dd></div>
            </dl>
          </section>

          <section>
            <p className="micro mono">SYSTEMS, HONESTLY</p>
            <ul className="brief-facts">
              <li><strong>Canonical engine:</strong> deterministic TypeScript. Every fact, event, branch and ending is validated and replayable.</li>
              <li><strong>Saves:</strong> IndexedDB (<code>the_last_blink_db</code>) stores the snapshot, branch runtimes and event logs in the browser.</li>
              <li><strong>MORROW AI:</strong> a typed proposal bridge to Groq/Gemini. Provider output is advisory; the deterministic engine remains authoritative and falls back when providers fail.</li>
              <li><strong>ECHO:</strong> deterministic cross-timeline queries over retained branches. It does not call a database or a model.</li>
              <li><strong>Meko:</strong> server-side MCP memory for NPC-scoped recall and archive search, with scope filtering and a local fallback. It is not the canonical store and it is not active in the offline browser game unless the Node server path is running.</li>
            </ul>
          </section>

          <section>
            <p className="micro mono">CONTROLS</p>
            <p className="mono brief-controls">
              WASD move · E interact · Q pulse · B BLINK · C ECHO · N NPCs · L Case Board · Esc close
            </p>
          </section>
        </div>

        <footer className="brief-modal-actions">
          <button ref={primaryRef} type="button" className="btn btn-primary" onClick={onClose}>
            Enter Relay Street
          </button>
          <span className="mono">08:00 · LOOP {view.loop.index} · V{view.timeline.index + 1}</span>
        </footer>
      </section>
    </div>
  );
}
