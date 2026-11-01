import { describe, expect, it } from 'vitest';
import {
  SPAWN,
  TILE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  collidesAt,
  feetRect,
} from '../src/world/district.js';
import {
  STEP_MS,
  WALK_SPEED,
  createMovement,
  inputFromKeys,
  stepMovement,
} from '../src/world/movement.js';

const right = inputFromKeys({ right: true });
const still = inputFromKeys({});
const stepPx = (WALK_SPEED * STEP_MS) / 1000;

describe('fixed-step movement', () => {
  it('moves the same distance regardless of render frame rate', () => {
    let slow = createMovement(SPAWN);
    let fast = createMovement(SPAWN);

    for (let i = 0; i < 60; i += 1) slow = stepMovement(slow, right, 1000 / 60);
    for (let i = 0; i < 16; i += 1) fast = stepMovement(fast, right, 62.5);

    expect(slow.x).toBeCloseTo(fast.x, 5);
    expect(slow.x - SPAWN.x).toBeCloseTo(WALK_SPEED, 1);
  });

  it('carries a sub-step remainder instead of dropping it', () => {
    let state = createMovement(SPAWN);
    state = stepMovement(state, right, STEP_MS / 2);
    expect(state.x).toBe(SPAWN.x);
    state = stepMovement(state, right, STEP_MS / 2 + 0.01);
    expect(state.x).toBeGreaterThan(SPAWN.x);
    expect(state.x).toBeLessThan(SPAWN.x + stepPx + 0.2);
  });

  it('does not move without input and keeps facing', () => {
    const start = createMovement(SPAWN);
    const next = stepMovement(start, still, 100);
    expect(next.x).toBe(start.x);
    expect(next.y).toBe(start.y);
    expect(next.facing).toBe('down');
    expect(next.moving).toBe(false);
  });

  it('normalises diagonal speed', () => {
    const start = createMovement({ x: 24 * TILE + 8, y: 45 * TILE + 8 });
    const diagonal = inputFromKeys({ right: true, down: true });
    let state = start;
    for (let i = 0; i < 60; i += 1) state = stepMovement(state, diagonal, 1000 / 60);
    const distance = Math.hypot(state.x - start.x, state.y - start.y);
    expect(distance).toBeCloseTo(WALK_SPEED, 1);
  });

  it('sets facing from input even when a wall blocks movement', () => {
    // Feet just above the Relay 7 north wall (row 27).
    const start = createMovement({ x: 30 * TILE + 8, y: 27 * TILE });
    const next = stepMovement(start, inputFromKeys({ down: true }), 200);
    expect(next.facing).toBe('down');
    expect(next.y).toBeLessThanOrEqual(27 * TILE);
  });
});

describe('collision', () => {
  it('blocks the solid Relay 7 street-facing wall', () => {
    let state = createMovement({ x: 32 * TILE + 8, y: 41 * TILE + 8 });
    for (let i = 0; i < 120; i += 1) state = stepMovement(state, inputFromKeys({ up: true }), 1000 / 60);
    expect(state.y).toBeGreaterThanOrEqual(41 * TILE);
    expect(collidesAt(state.x, state.y)).toBe(false);
  });

  it('blocks a building wall but slides along a free alley axis', () => {
    // Relay 7 east wall occupies tile column 44; column 45 is an open alley.
    let state = createMovement({ x: 45 * TILE + 8, y: 30 * TILE + 8 });
    const downLeft = inputFromKeys({ left: true, down: true });
    for (let i = 0; i < 10; i += 1) state = stepMovement(state, downLeft, 1000 / 60);

    // The wall stops horizontal progress at the tile edge...
    expect(state.x).toBeGreaterThanOrEqual(45 * TILE);
    // ...while vertical movement still happens along the alley.
    expect(state.y).toBeGreaterThan(30 * TILE + 8);
    expect(collidesAt(state.x, state.y)).toBe(false);
  });

  it('never lets the feet box leave the world', () => {
    let state = createMovement({ x: 9 * TILE + 8, y: 45 * TILE + 8 });
    const left = inputFromKeys({ left: true });
    for (let i = 0; i < 120; i += 1) state = stepMovement(state, left, 1000 / 60);
    const rect = feetRect(state.x, state.y);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(WORLD_WIDTH);
    expect(rect.y + rect.height).toBeLessThanOrEqual(WORLD_HEIGHT);
  });

  it('treats building shells as solid and interiors as walkable', () => {
    expect(collidesAt(30 * TILE + 8, 30 * TILE + 8)).toBe(true); // Relay 7 shell
    expect(collidesAt(41 * TILE + 8, 29 * TILE + 8)).toBe(false); // Relay 7 interior
    expect(collidesAt(SPAWN.x, SPAWN.y)).toBe(false); // Central Relay Street spawn
  });
});
