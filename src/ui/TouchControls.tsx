import type { MoveInput } from '../world/movement.js';

type Direction = keyof MoveInput;

interface TouchControlsProps {
  readonly active: Record<Direction, boolean>;
  readonly onPress: (direction: Direction, pressed: boolean) => void;
  readonly onInteract: () => void;
  readonly interactDisabled: boolean;
  /** Pulse Scan is free and read-only, so touch players need their own button. */
  readonly onPulse?: () => void;
}

const PAD: Array<{ direction: Direction; label: string; glyph: string; className: string }> = [
  { direction: 'up', label: 'Move up', glyph: '▲', className: 'pad-up' },
  { direction: 'left', label: 'Move left', glyph: '◀', className: 'pad-left' },
  { direction: 'right', label: 'Move right', glyph: '▶', className: 'pad-right' },
  { direction: 'down', label: 'Move down', glyph: '▼', className: 'pad-down' },
];

export function TouchControls({
  active,
  onPress,
  onInteract,
  interactDisabled,
  onPulse,
}: TouchControlsProps) {
  return (
    <div className="touch-controls">
      <div className="dpad" role="group" aria-label="Movement">
        {PAD.map((pad) => (
          <button
            key={pad.direction}
            type="button"
            className={`pad-btn ${pad.className}${active[pad.direction] ? ' pad-active' : ''}`}
            aria-label={pad.label}
            aria-pressed={active[pad.direction]}
            onPointerDown={(event) => {
              event.preventDefault();
              onPress(pad.direction, true);
            }}
            onPointerUp={() => onPress(pad.direction, false)}
            onPointerLeave={() => onPress(pad.direction, false)}
            onPointerCancel={() => onPress(pad.direction, false)}
          >
            {pad.glyph}
          </button>
        ))}
      </div>
      <div className="touch-actions">
        <button
          type="button"
          className="btn btn-primary interact-btn"
          onClick={onInteract}
          disabled={interactDisabled}
        >
          Interact <kbd>E</kbd>
        </button>
        {onPulse ? (
          <button type="button" className="btn touch-pulse-btn" onClick={onPulse}>
            Pulse <kbd>Q</kbd>
          </button>
        ) : null}
      </div>
    </div>
  );
}
