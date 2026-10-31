import { useEffect, useRef } from 'react';
import type { DialogueLine } from '../content/stage4Dialogue.js';
import type { WorldView } from '../world/worldView.js';

export type DialoguePhase = 'lines' | 'choice' | 'resolved';

interface DialogueSheetProps {
  readonly phase: DialoguePhase;
  readonly line: DialogueLine | null;
  readonly lineIndex: number;
  readonly lineCount: number;
  readonly view: WorldView;
  readonly choiceIndex: number;
  readonly onAdvance: () => void;
  readonly onChoose: (optionId: string) => void;
  readonly onHighlight: (index: number) => void;
  readonly onClose: () => void;
}

export function DialogueSheet({
  phase,
  line,
  lineIndex,
  lineCount,
  view,
  choiceIndex,
  onAdvance,
  onChoose,
  onHighlight,
  onClose,
}: DialogueSheetProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [phase, lineIndex]);

  return (
    <section
      className="dialogue-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialogue-speaker"
      aria-describedby="dialogue-body"
    >
      {phase === 'lines' && line ? (
        <>
          <header className="dialogue-head">
            <div>
              <p className="micro">CONVERSATION</p>
              <h2 id="dialogue-speaker" className="dialogue-speaker">
                {line.speaker}
              </h2>
            </div>
            <p className="mono dialogue-progress">
              {lineIndex + 1} / {lineCount}
            </p>
          </header>
          <p id="dialogue-body" className="dialogue-text">
            {line.text}
          </p>
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

      {phase === 'choice' && view.choice ? (
        <>
          <header className="dialogue-head">
            <div>
              <p className="micro">DECISION · CANONICAL</p>
              <h2 id="dialogue-speaker" className="dialogue-speaker">
                Sable
              </h2>
            </div>
            <p className="mono dialogue-progress">choice</p>
          </header>
          <p id="dialogue-body" className="dialogue-text">
            {view.choice.prompt}
          </p>
          <div className="choice-list" role="radiogroup" aria-label="How to handle the relay log">
            {view.choice.options.map((option, index) => (
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
            ↑ ↓ choose · Enter confirm · Esc step away. This decision is written to the engine once.
          </p>
        </>
      ) : null}

      {phase === 'resolved' ? (
        <>
          <header className="dialogue-head">
            <div>
              <p className="micro">CONSEQUENCE · DERIVED BY RULES</p>
              <h2 id="dialogue-speaker" className="dialogue-speaker">
                The street answers
              </h2>
            </div>
            <p className="mono dialogue-progress">recorded</p>
          </header>
          <p id="dialogue-body" className="dialogue-text">
            {view.consequence}
          </p>
          <dl className="consequence-grid">
            <div>
              <dt>Ward alert</dt>
              <dd className="mono">{view.wardAlert ?? 'unresolved'}</dd>
            </div>
            <div>
              <dt>Sable</dt>
              <dd className="mono">{view.sableStance ?? 'unreadable'}</dd>
            </div>
            <div>
              <dt>Decision</dt>
              <dd className="mono">{view.choice?.resolvedOptionId ?? 'none'}</dd>
            </div>
          </dl>
          <div className="dialogue-actions">
            <button ref={primaryRef} type="button" className="btn btn-primary" onClick={onClose}>
              Continue exploring <kbd>Esc</kbd>
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
