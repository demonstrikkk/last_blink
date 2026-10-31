import {
  MAX_MORROW_ESCALATION,
  type MorrowResponse,
} from '../contracts/morrow.js';
import type { GameState } from '../contracts/index.js';

/**
 * Bounded escalation ladder. The engine is the authority: a policy may propose
 * any response, but only a response reachable from the current one is applied.
 * `observe` is always legal, so MORROW can always stand down.
 */
const TRANSITIONS: Record<MorrowResponse, readonly MorrowResponse[]> = {
  observe: ['observe', 'warn', 'release'],
  warn: ['observe', 'warn', 'restrict', 'release'],
  restrict: ['observe', 'restrict', 'escalate', 'release'],
  escalate: ['observe', 'escalate', 'release'],
  redirect: ['observe', 'redirect', 'release'],
  release: ['observe', 'release', 'warn'],
};

export function isMorrowTransitionAllowed(
  from: MorrowResponse | null,
  to: MorrowResponse,
): boolean {
  // First contact may stand down as well as observe or warn: if the story has
  // already ended, MORROW must be able to release immediately.
  if (from === null) return to === 'observe' || to === 'warn' || to === 'release';
  return TRANSITIONS[from].includes(to);
}

export function morrowResponseOf(state: GameState): MorrowResponse | null {
  const value = state.facts['morrow.response']?.value;
  if (typeof value !== 'string') return null;
  return (['observe', 'warn', 'restrict', 'redirect', 'escalate', 'release'] as const).includes(
    value as MorrowResponse,
  )
    ? (value as MorrowResponse)
    : null;
}

export function morrowEscalationOf(state: GameState): number {
  const value = state.facts['morrow.escalation']?.value;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? Math.min(value, MAX_MORROW_ESCALATION)
    : 0;
}

/** Escalation is monotonic and capped; releasing does not reset the counter. */
export function nextMorrowEscalation(current: number, response: MorrowResponse): number {
  const next = response === 'escalate' ? current + 1 : current;
  return Math.min(next, MAX_MORROW_ESCALATION);
}
