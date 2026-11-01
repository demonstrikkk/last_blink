import { useEffect, useRef } from 'react';
import type { DialogueLine, DialogueScript } from '../content/stage5Dialogue.js';
import type { ChoiceView, WorldView } from '../world/worldView.js';

export type DialoguePhase = 'lines' | 'choice' | 'resolved' | 'blocked';

interface DialogueSheetProps {
  readonly phase: DialoguePhase;
  readonly script: DialogueScript;
  readonly line: DialogueLine | null;
  readonly lineIndex: number;
  readonly lineCount: number;
  readonly node: ChoiceView | null;
  readonly view: WorldView;
  readonly choiceIndex: number;
  readonly onAdvance: () => void;
  readonly onChoose: (optionId: string) => void;
  readonly onHighlight: (index: number) => void;
  readonly onClose: () => void;
  readonly presentedEvidenceId: string | null;
  readonly onPresentEvidence: (evidenceId: string) => void;
}

function portraitForSpeaker(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('sable')) return '/assets/characters/oldwoman/1.png';
  if (lower.includes('ivo')) return '/assets/characters/sage/1.png';
  if (lower.includes('lyra')) return '/assets/characters/girl/1.png';
  if (lower.includes('vane')) return '/assets/characters/woman/1.png';
  if (lower.includes('castor')) return '/assets/characters/miner/1.png';
  if (lower.includes('aster') || lower.includes('rin')) return '/assets/characters/cap/1.png';
  if (
    lower.includes('dispatch') ||
    lower.includes('relay') ||
    lower.includes('terminal') ||
    lower.includes('board') ||
    lower.includes('call') ||
    lower.includes('ward')
  ) {
    return '/assets/characters/miner/1.png';
  }
  return '/assets/characters/cap/1.png';
}

export function DialogueSheet({
  phase,
  script,
  line,
  lineIndex,
  lineCount,
  node,
  view,
  choiceIndex,
  onAdvance,
  onChoose,
  onHighlight,
  onClose,
  presentedEvidenceId,
  onPresentEvidence,
}: DialogueSheetProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [phase, lineIndex]);

  const speakerName =
    phase === 'lines' && line ? line.speaker : script.displayName;
  const portraitUrl = portraitForSpeaker(speakerName);

  return (
    <section
      className="dialogue-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialogue-speaker"
      aria-describedby="dialogue-body"
    >
      <div className="dialogue-card">
        {phase === 'lines' && line ? (
          <>
            <header className="dialogue-head">
              <div className="dialogue-speaker-wrap">
                <div className="dialogue-portrait-frame">
                  <img
                    src={portraitUrl}
                    alt=""
                    className="dialogue-portrait pixelated"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="micro">
                    {script.contextNote
                      ? `INVESTIGATION // ${script.contextNote.toUpperCase()}`
                      : 'INVESTIGATION // WITNESS TESTIMONY'}
                  </p>
                  <h2 id="dialogue-speaker" className="dialogue-speaker">
                    {line.speaker}
                  </h2>
                  <p className="dialogue-role mono">{script.role}</p>
                </div>
              </div>
              <div className="dialogue-meta">
                <span className="mono dialogue-progress">
                  LINE {lineIndex + 1} / {lineCount}
                </span>
              </div>
            </header>
            <p id="dialogue-body" className="dialogue-text">
              {line.text}
            </p>
            {view.collectedEvidence.length > 0 ? (
              <details className="dialogue-evidence-presentation">
                <summary>Present collected evidence</summary>
                <div className="button-row">
                  {view.collectedEvidence.map((evidence) => (
                    <button
                      key={evidence.evidenceId}
                      type="button"
                      className={`btn btn-quiet${presentedEvidenceId === evidence.evidenceId ? ' choice-active' : ''}`}
                      onClick={() => onPresentEvidence(evidence.evidenceId)}
                    >
                      {evidence.label}
                    </button>
                  ))}
                </div>
                {presentedEvidenceId ? (
                  <p className="dialogue-evidence-note mono">Presented record remains a claim or observation; it does not rewrite the witness account.</p>
                ) : null}
              </details>
            ) : null}
            <div className="dialogue-actions">
              <button ref={primaryRef} type="button" className="btn btn-primary" onClick={onAdvance}>
                {lineIndex + 1 === lineCount ? 'Hear the question' : 'Continue'}
                <kbd>Space</kbd>
              </button>
              <button type="button" className="btn btn-quiet" onClick={onClose}>
                Step away <kbd>Esc</kbd>
              </button>
            </div>
          </>
        ) : null}

        {phase === 'choice' && node ? (
          <>
            <header className="dialogue-head">
              <div className="dialogue-speaker-wrap">
                <div className="dialogue-portrait-frame">
                  <img
                    src={portraitUrl}
                    alt=""
                    className="dialogue-portrait pixelated"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="micro alert-micro">DECISION // CANONICAL DISPATCH</p>
                  <h2 id="dialogue-speaker" className="dialogue-speaker">
                    {script.displayName}
                  </h2>
                  <p className="dialogue-role mono">{script.role}</p>
                </div>
              </div>
              <div className="dialogue-meta">
                <span className="mono dialogue-progress dialogue-choice-tag">CRITICAL CHOICE</span>
              </div>
            </header>
            <p id="dialogue-body" className="dialogue-text choice-prompt">
              {node.prompt}
            </p>
            <div className="choice-list" role="radiogroup" aria-label="Decision options">
              {node.options.map((option, index) => (
                <button
                  key={option.optionId}
                  type="button"
                  role="radio"
                  aria-checked={choiceIndex === index}
                  className={`choice${choiceIndex === index ? ' choice-active' : ''}`}
                  onClick={() => onChoose(option.optionId)}
                  onMouseEnter={() => onHighlight(index)}
                  onFocus={() => onHighlight(index)}
                >
                  <span className="choice-key mono">{index + 1}</span>
                  <span className="choice-copy">
                    <span className="choice-label">{option.label}</span>
                    <span className="choice-detail">{option.detail}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="dialogue-hint mono">
              ↑ ↓ select · Enter / [1-9] confirm · Esc step away · Committed to canonical timeline.
            </p>
          </>
        ) : null}

        {phase === 'blocked' ? (
          <>
            <header className="dialogue-head">
              <div className="dialogue-speaker-wrap">
                <div className="dialogue-portrait-frame">
                  <img
                    src={portraitUrl}
                    alt=""
                    className="dialogue-portrait pixelated"
                    aria-hidden="true"
                  />
                </div>
                <div>
                 <p className="micro">DECISION READINESS // MORE EVIDENCE NEEDED</p>
                  <h2 id="dialogue-speaker" className="dialogue-speaker">
                    {script.displayName}
                  </h2>
                  <p className="dialogue-role mono">{script.role}</p>
                </div>
              </div>
              <div className="dialogue-meta">
                <span className="mono dialogue-progress dialogue-blocked-tag">PARTIAL / RETURN</span>
              </div>
            </header>
            <p id="dialogue-body" className="dialogue-text">
              {script.gate}
            </p>
            {node && node.missing.length > 0 ? (
              <p className="dialogue-requirements mono">
                Missing for this decision, not for exploration: {node.missing.join(', ')}
              </p>
            ) : null}
            <div className="dialogue-actions">
              <button ref={primaryRef} type="button" className="btn btn-primary" onClick={onClose}>
                Step away <kbd>Esc</kbd>
              </button>
            </div>
          </>
        ) : null}

        {phase === 'resolved' ? (
          <>
            <header className="dialogue-head">
              <div className="dialogue-speaker-wrap">
                <div className="dialogue-portrait-frame">
                  <img
                    src={portraitUrl}
                    alt=""
                    className="dialogue-portrait pixelated"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="micro">CONSEQUENCE // ENGINE CAUSAL STATE</p>
                  <h2 id="dialogue-speaker" className="dialogue-speaker">
                    {view.ending ? view.ending.title : 'The street answers'}
                  </h2>
                  <p className="dialogue-role mono">{script.displayName}</p>
                </div>
              </div>
              <div className="dialogue-meta">
                <span className="mono dialogue-progress dialogue-resolved-tag">COMMITTED</span>
              </div>
            </header>
            <p id="dialogue-body" className="dialogue-text">
              {view.ending ? view.ending.summary : view.consequence}
            </p>
            {script.stanceNote ? (
              <div className="dialogue-stance-callout">
                <p className="micro">WHY THIS CHARACTER RESPONDED</p>
                <p className="stance-text">{script.stanceNote}</p>
              </div>
            ) : null}
            {!view.ending ? (
              <div className="dialogue-uncertainty-callout">
                <p className="micro">WHAT REMAINS UNCERTAIN</p>
                <p className="uncertainty-text mono">
                  {view.dispatchContinuity === 'unknown'
                    ? 'Ward dispatch continuity is unconfirmed until the physical slip is located.'
                    : !view.ivoStance
                      ? 'Ivo’s fate and witness testimony remain open until addressed at his stall.'
                      : 'The full account has not yet reached Aster ward desk. East call-box will decide the ending.'}
                </p>
              </div>
            ) : null}
            <dl className="consequence-grid">
              <div>
                <dt>Decision</dt>
                <dd className="mono">{node?.resolvedOptionId ?? 'none'}</dd>
              </div>
              <div>
                <dt>Ward alert</dt>
                <dd className="mono">{view.wardAlert ?? 'unresolved'}</dd>
              </div>
              <div>
                <dt>Sable</dt>
                <dd className="mono">{view.sableStance ?? 'unreadable'}</dd>
              </div>
              <div>
                <dt>Ivo</dt>
                <dd className="mono">{view.ivoStance ?? 'unresolved'}</dd>
              </div>
              <div>
                <dt>Dispatch chain</dt>
                <dd className="mono">{view.dispatchContinuity ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>Scrutiny</dt>
                <dd className="mono">{view.morrowScrutiny ?? 'unknown'}</dd>
              </div>
            </dl>
            <div className="dialogue-actions">
              <button ref={primaryRef} type="button" className="btn btn-primary" onClick={onClose}>
                Continue exploring <kbd>Esc</kbd>
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
