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
              <p className="dialogue-role mono">{script.role}</p>
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

      {phase === 'choice' && node ? (
        <>
          <header className="dialogue-head">
            <div>
              <p className="micro">DECISION · CANONICAL</p>
              <h2 id="dialogue-speaker" className="dialogue-speaker">
                {script.displayName}
              </h2>
              <p className="dialogue-role mono">{script.role}</p>
            </div>
            <p className="mono dialogue-progress">choice</p>
          </header>
          <p id="dialogue-body" className="dialogue-text">
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
            ↑ ↓ choose · Enter confirm · Esc step away. This decision is written to the engine once.
          </p>
        </>
      ) : null}

      {phase === 'blocked' ? (
        <>
          <header className="dialogue-head">
            <div>
              <p className="micro">EVIDENCE GATE</p>
              <h2 id="dialogue-speaker" className="dialogue-speaker">
                {script.displayName}
              </h2>
              <p className="dialogue-role mono">{script.role}</p>
            </div>
            <p className="mono dialogue-progress">blocked</p>
          </header>
          <p id="dialogue-body" className="dialogue-text">
            {script.gate}
          </p>
          {node && node.missing.length > 0 ? (
            <p className="dialogue-requirements mono">
              Required before this decision: {node.missing.join(', ')}
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
            <div>
              <p className="micro">CONSEQUENCE · DERIVED BY RULES</p>
              <h2 id="dialogue-speaker" className="dialogue-speaker">
                {view.ending ? view.ending.title : 'The street answers'}
              </h2>
              <p className="dialogue-role mono">{script.displayName}</p>
            </div>
            <p className="mono dialogue-progress">recorded</p>
          </header>
          <p id="dialogue-body" className="dialogue-text">
            {view.ending ? view.ending.summary : view.consequence}
          </p>
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
    </section>
  );
}
