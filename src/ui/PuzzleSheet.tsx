import type { GameState } from '../engine/index.js';
import type { WorldView } from '../world/worldView.js';
import type { WorldPuzzleId } from '../world/district.js';
import type { DialogueScript } from '../content/stage5Dialogue.js';
import { PUZZLE_META, PuzzleBody } from './PuzzleBody.js';

interface PuzzleSheetProps {
  readonly open: boolean;
  readonly puzzle: WorldPuzzleId | null;
  readonly onClose: () => void;
  readonly state: GameState;
  readonly view: WorldView;
  /** The terminal or witness that explains the puzzle in-world. */
  readonly context: DialogueScript | null;
  readonly onMakeCaseChoice: (nodeId: string, optionId: string) => void;
  readonly onCompleteChallenge: (params: {
    challengeId: string;
    challengeType: 'timeline_reconstruction' | 'contradiction_questioning';
    answer: { order: string[] } | { question: 'ask_route_seal' | 'declare_slip_definitive' };
  }) => void;
}

export function PuzzleSheet({
  open,
  puzzle,
  onClose,
  state,
  view,
  context,
  onMakeCaseChoice,
  onCompleteChallenge,
}: PuzzleSheetProps) {
  if (!open || !puzzle) return null;
  const meta = PUZZLE_META[puzzle];

  return (
    <div className="echo-layer">
      <button
        type="button"
        className="ledger-backdrop"
        aria-label={`Close ${meta.title}`}
        onClick={onClose}
      />
      <aside
        className="echo-panel puzzle-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="puzzle-title"
      >
        <header className="ledger-head">
          <div>
            <p className="micro mono">{meta.location}</p>
            <h2 id="puzzle-title">{meta.title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close puzzle">
            ✕
          </button>
        </header>

        <PuzzleBody
          kind={puzzle}
          state={state}
          view={view}
          onMakeCaseChoice={onMakeCaseChoice}
          onCompleteChallenge={onCompleteChallenge}
        />

        {context ? (
          <details className="puzzle-context">
            <summary className="puzzle-context-summary mono">
              CASE CONTEXT // {context.displayName} · {context.role}
            </summary>
            {context.lines.map((line, index) => (
              <p key={`${context.scriptId}-${index}`}>
                <strong>{line.speaker}:</strong> {line.text}
              </p>
            ))}
            <p className="puzzle-gate mono">{context.gate}</p>
          </details>
        ) : null}

        <p className="note-muted">
          The same console is on the Case Board under Challenges. Solving it here commits the
          canonical result; the brief only mirrors it.
        </p>
      </aside>
    </div>
  );
}
