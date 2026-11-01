/**
 * Presentation-only art lookup. Canonical content ids stay unchanged; the UI
 * resolves a stable path so the pixel assets can be swapped without touching
 * the engine or the saved state. Missing art returns null and the card keeps
 * its text-first layout.
 */

const EVIDENCE_ART: Readonly<Record<string, string>> = {
  relay_7_log: '/assets/items/relay_7_log.svg',
  ward_dispatch: '/assets/items/ward_dispatch.svg',
  vendor_testimony: '/assets/items/vendor_testimony.svg',
  clue_conduit: '/assets/items/clue_conduit.svg',
  clue_guestbook: '/assets/items/clue_guestbook.svg',
  surveillance_frequency: '/assets/items/surveillance_frequency.svg',
  archive_record: '/assets/items/archive_record.svg',
  human_cost: '/assets/items/human_cost.svg',
  freight_log: '/assets/items/freight_log.svg',
  plaza_terminal: '/assets/items/plaza_terminal.svg',
  clue_locker: '/assets/items/clue_locker.svg',
  depot_terminal: '/assets/items/depot_terminal.svg',
  zeroing_order: '/assets/items/zeroing_order.svg',
  detonator_schematic: '/assets/items/detonator_schematic.svg',
  bomb_core: '/assets/items/bomb_core.svg',
};

const PUZZLE_ART = {
  signal: '/assets/puzzles/puzzle_signal.svg',
  timeline: '/assets/puzzles/puzzle_timeline.svg',
  contradiction: '/assets/puzzles/puzzle_contradiction.svg',
  bomb: '/assets/puzzles/puzzle_bomb.svg',
} as const;

export type PuzzleArtKey = keyof typeof PUZZLE_ART;

export function evidenceArt(evidenceId: string): string | null {
  return EVIDENCE_ART[evidenceId] ?? null;
}

export function puzzleArt(key: PuzzleArtKey): string {
  return PUZZLE_ART[key];
}
