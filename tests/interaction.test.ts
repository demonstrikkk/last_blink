import { describe, expect, it } from 'vitest';
import { WORLD_TARGETS, type WorldTarget } from '../src/world/district.js';
import {
  distanceToTarget,
  findInteractionTarget,
  isInRange,
} from '../src/world/interaction.js';

const anchor = WORLD_TARGETS.find((target) => target.id === 'anchor_lamp')!;
const relay = WORLD_TARGETS.find((target) => target.id === 'relay_7_log')!;
const sable = WORLD_TARGETS.find((target) => target.id === 'sable')!;

describe('interaction proximity', () => {
  it('selects the nearest target in range', () => {
    const standingNextToAnchor = { x: 12 * 16 + 8, y: 15 * 16 + 15 };
    expect(findInteractionTarget(standingNextToAnchor)?.id).toBe('anchor_lamp');
  });

  it('returns null when nothing is in range', () => {
    expect(findInteractionTarget({ x: 24 * 16, y: 10 * 16 })).toBeNull();
  });

  it('respects per-target range', () => {
    expect(isInRange({ x: anchor.x, y: anchor.y + anchor.radius + 1 }, anchor)).toBe(false);
    expect(isInRange({ x: anchor.x, y: anchor.y + anchor.radius - 1 }, anchor)).toBe(true);
  });

  it('excludes unavailable targets such as collected evidence', () => {
    const atRelay = { x: relay.x, y: relay.y + 20 };
    expect(findInteractionTarget(atRelay)?.id).toBe('relay_7_log');
    expect(findInteractionTarget(atRelay, WORLD_TARGETS, (target) => target.id !== 'relay_7_log')).toBeNull();
  });

  it('breaks exact ties by priority and then id', () => {
    const make = (id: string, priority: number): WorldTarget => ({
      ...anchor,
      id,
      priority,
      x: 100,
      y: 100,
      radius: 40,
    });
    const targets = [make('low', 1), make('high', 3), make('same_b', 3), make('same_a', 3)];
    expect(findInteractionTarget({ x: 100, y: 100 }, targets)?.id).toBe('high');
    expect(distanceToTarget({ x: 100, y: 100 }, targets[0]!)).toBe(0);
  });

  it('keeps NPC, evidence and anchor targets distinct', () => {
    expect(sable.kind).toBe('npc');
    expect(relay.kind).toBe('evidence');
    expect(anchor.kind).toBe('anchor');
  });
});
