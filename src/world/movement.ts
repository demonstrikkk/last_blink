import { SPAWN, collidesAt, type Facing, type Point } from './district.js';

export interface MoveInput {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

export interface MovementState {
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  readonly moving: boolean;
  /** Leftover time below one fixed step, carried to the next frame. */
  readonly accumulatorMs: number;
}

export const WALK_SPEED = 92; // world px per second
export const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 100;

export const NEUTRAL_INPUT: MoveInput = {
  up: false,
  down: false,
  left: false,
  right: false,
};

export function createMovement(spawn: Point = SPAWN): MovementState {
  return { x: spawn.x, y: spawn.y, facing: 'down', moving: false, accumulatorMs: 0 };
}

function axis(input: MoveInput): { dx: number; dy: number; facing: Facing | null } {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx === 0 && dy === 0) return { dx: 0, dy: 0, facing: null };

  // Vertical facing wins on a diagonal; the art has one facing with a flip.
  const facing: Facing = dx !== 0 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  const length = Math.hypot(dx, dy);
  return { dx: dx / length, dy: dy / length, facing };
}

/**
 * Advance player presentation state by a frame delta. Movement is simulated in
 * fixed 1/60 s steps and leftover time is carried, so the same input produces
 * the same distance at any render frame rate. Collision is axis-separated,
 * which gives wall sliding without Arcade Physics.
 */
export function stepMovement(
  state: MovementState,
  input: MoveInput,
  dtMs: number,
  speed = WALK_SPEED,
): MovementState {
  const clamped = Math.min(MAX_FRAME_MS, Math.max(0, dtMs));
  let accumulator = state.accumulatorMs + clamped;
  let x = state.x;
  let y = state.y;
  let moved = false;

  const direction = axis(input);

  while (accumulator + 1e-6 >= STEP_MS) {
    accumulator -= STEP_MS;
    if (direction.dx === 0 && direction.dy === 0) continue;

    const stepPx = (speed * STEP_MS) / 1000;
    const nextX = x + direction.dx * stepPx;
    if (!collidesAt(nextX, y)) {
      x = nextX;
      moved = true;
    }

    const nextY = y + direction.dy * stepPx;
    if (!collidesAt(x, nextY)) {
      y = nextY;
      moved = true;
    }
  }

  return {
    x,
    y,
    facing: direction.facing ?? state.facing,
    moving: direction.facing !== null && moved,
    accumulatorMs: accumulator,
  };
}

/** Read-only keyboard/touch input shape used by the scene and touch pad. */
export function inputFromKeys(keys: Partial<Record<string, boolean>>): MoveInput {
  return {
    up: Boolean(keys.up),
    down: Boolean(keys.down),
    left: Boolean(keys.left),
    right: Boolean(keys.right),
  };
}
