import type { GameState } from '../contracts/index.js';
import { clockLabel, DEADLINE_TICK } from '../time/clock.js';

/**
 * The catastrophe is the invariant spine of the day. Tests, testimony and
 * MORROW's plan may vary; at 18:00 the causal chain either has a committed
 * countermand or it fires. This module is pure so the same state always yields
 * the same observable sequence and the same missing-pieces list.
 */
export interface CatastropheAssessment {
  readonly prevented: boolean;
  readonly cause: string;
  readonly missing: readonly string[];
  readonly sequence: readonly string[];
}

const CAUSAL_PIECES: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'evidence.relay_7', label: 'the Relay 7 hardware counter was never read' },
  {
    key: 'evidence.surveillance_frequency',
    label: 'the 434.8 MHz carrier was never confirmed',
  },
  {
    key: 'story.frequency_resolved',
    label: 'the frequency countermand was never resolved',
  },
  { key: 'evidence.zeroing_order', label: 'the 18:00 zeroing order was never recovered' },
  {
    key: 'evidence.detonator_schematic',
    label: 'the charge schematic was never recovered',
  },
  { key: 'story.attack_chain', label: 'the zeroing device was never reconstructed' },
  { key: 'story.ward_call', label: 'the ward line was never answered' },
];

function hasCausalPiece(state: GameState, key: string): boolean {
  const fact = state.facts[key];
  if (!fact) return false;
  if (key === 'story.frequency_resolved') return fact.value === true;
  return true;
}

export function evaluateCatastrophe(state: GameState): CatastropheAssessment {
  const missing = CAUSAL_PIECES.filter((piece) => !hasCausalPiece(state, piece.key)).map(
    (piece) => piece.label,
  );
  const prevented = state.endingId !== null;
  const cause =
    missing.length > 0
      ? `By ${clockLabel(DEADLINE_TICK)}, ${missing[0]}. The zeroing order executed unanswered.`
      : 'Every lead was on the record, but no countermand was committed before the zeroing order executed.';

  return {
    prevented,
    cause,
    missing,
    sequence: [
      '17:52 · The Relay 7 carrier slips away from 434.8 MHz.',
      '17:58 · The district exchange accepts the zeroing token without a countermand.',
      '18:00 · Relay 7 arcs. The street goes dark outward from the north kerb.',
    ],
  };
}
