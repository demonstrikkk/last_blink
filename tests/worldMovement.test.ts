import { describe, expect, it } from 'vitest';
import {
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
    let slow = createMovement({ x: 100, y: 15 * TILE + 15 });
    let fast = createMovement({ x: 100, y: 15 * TILE + 15 });

    for (let i = 0; i < 60; i += 1) slow = stepMovement(slow, right, 1000 / 60);
    for (let i = 0; i < 16; i += 1) fast = stepMovement(fast, right, 62.5);

    expect(slow.x).toBeCloseTo(fast.x, 5);
    expect(slow.x - 100).toBeCloseTo(WALK_SPEED, 1);
  });

  it('carries a sub-step remainder instead of dropping it', () => {
    let state = createMovement({ x: 100, y: 15 * TILE + 15 });
    state = stepMovement(state, right, STEP_MS / 2);
    expect(state.x).toBe(100);
    state = stepMovement(state, right, STEP_MS / 2 + 0.01);
    expect(state.x).toBeGreaterThan(100);
    expect(state.x).toBeLessThan(100 + stepPx + 0.2);
  });

  it('does not move without input and keeps facing', () => {
    const start = createMovement({ x: 100, y: 15 * TILE + 15 });
    const next = stepMovement(start, still, 100);
    expect(next.x).toBe(start.x);
    expect(next.y).toBe(start.y);
    expect(next.facing).toBe('down');
    expect(next.moving).toBe(false);
  });

  it('normalises diagonal speed', () => {
    const start = createMovement({ x: 24 * TILE + 8, y: 10 * TILE + 8 });
    const diagonal = inputFromKeys({ right: true, down: true });
    let state = start;
    for (let i = 0; i < 60; i += 1) state = stepMovement(state, diagonal, 1000 / 60);
    const distance = Math.hypot(state.x - start.x, state.y - start.y);
    expect(distance).toBeCloseTo(WALK_SPEED, 1);
  });

  it('sets facing from input even when a wall blocks movement', () => {
    // Feet just above the solid row 17.
    const start = createMovement({ x: 11 * TILE + 8, y: 17 * TILE });
    const next = stepMovement(start, inputFromKeys({ down: true }), 200);
    expect(next.facing).toBe('down');
    expect(next.y).toBeLessThanOrEqual(17 * TILE);
  });
});

describe('collision', () => {
  it('blocks the solid south building row', () => {
    let state = createMovement({ x: 11 * TILE + 8, y: 16 * TILE + 10 });
    for (let i = 0; i < 120; i += 1) state = stepMovement(state, inputFromKeys({ down: true }), 1000 / 60);
    expect(state.y).toBeLessThanOrEqual(17 * TILE);
    expect(collidesAt(state.x, state.y)).toBe(false);
  });

  it('blocks a barrier but slides along the free axis', () => {
    // Barrier occupies tiles (7,8)..(7,9); approach from the left moving right.
    let state = createMovement({ x: 6 * TILE + 8, y: 8 * TILE + 8 });
    const downRight = inputFromKeys({ right: true, down: true });
    for (let i = 0; i < 10; i += 1) state = stepMovement(state, downRight, 1000 / 60);

    // The wall stops horizontal progress at the tile edge...
    expect(state.x).toBeLessThan(7 * TILE);
    // ...while vertical movement still happens.
    expect(state.y).toBeGreaterThan(8 * TILE + 8);
    expect(collidesAt(state.x, state.y)).toBe(false);
  });

  it('never lets the feet box leave the world', () => {
    let state = createMovement({ x: TILE + 8, y: 15 * TILE + 15 });
    const left = inputFromKeys({ left: true });
    for (let i = 0; i < 120; i += 1) state = stepMovement(state, left, 1000 / 60);
    const rect = feetRect(state.x, state.y);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(WORLD_WIDTH);
    expect(rect.y + rect.height).toBeLessThanOrEqual(WORLD_HEIGHT);
  });

  it('treats the props and buildings as solid', () => {
    expect(collidesAt(30 * TILE + 8, 16 * TILE + 15)).toBe(true); // Sable
    expect(collidesAt(20 * TILE + 8, 4 * TILE + 15)).toBe(true); // relay terminal
    expect(collidesAt(10 * TILE + 8, 15 * TILE + 15)).toBe(false); // spawn
  });
});
