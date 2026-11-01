import type { GameState } from '../engine/contracts/gameState.js';
import type { MorrowPlan } from '../engine/contracts/loop.js';
import type { DialogueLine } from '../content/stage5Dialogue.js';

/**
 * Testimony presentation.
 *
 * MORROW never rewrites canon. What it changes is how a shaped mind speaks: a
 * small hesitation, a phrase that repeats itself, a clock reading that drifts
 * by two minutes. These are the fair clues a player can notice, and none of them
 * is a label. Nothing here reads `contaminated` into the HUD or tells the player
 * who MORROW touched.
 */

const NPC_SCRIPT_IDS = new Set([
  'sable',
  'ivo',
  'lyra',
  'vane',
  'castor',
  'mara',
  'ren',
  'nia',
  'vale',
  'orin',
  'kade',
  'suri',
  'tamsin',
  'ward_runner',
]);

const CLOCK_IN_TEXT = /\b([01]\d|2[0-3]):([0-5]\d)\b/;

export function testimonyNpcId(scriptId: string): string | null {
  return NPC_SCRIPT_IDS.has(scriptId) ? `npc_${scriptId}` : null;
}

export function isSpeakerUnderInterference(
  npcId: string | null,
  plan: MorrowPlan | null,
): boolean {
  if (npcId === null || plan === null) return false;
  return plan.targets.some((target) => String(target.npcId) === npcId);
}

function shiftClockReading(text: string): string | null {
  const match = CLOCK_IN_TEXT.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const shifted = (hours * 60 + minutes + 2) % (24 * 60);
  const next = `${String(Math.floor(shifted / 60)).padStart(2, '0')}:${String(shifted % 60).padStart(2, '0')}`;
  return text.slice(0, match.index) + next + text.slice(match.index + match[0].length);
}

/**
 * Line 0 hesitates, line 1 repeats its own opening, line 2 lets a stated clock
 * drift. The pattern is deterministic so the same shaped testimony always looks
 * the same and a test can assert it without a model.
 */
export function shapeTestimonyLine(
  line: DialogueLine | null,
  scriptId: string,
  state: GameState,
): DialogueLine | null {
  if (line === null) return null;
  const npcId = testimonyNpcId(scriptId);
  if (!isSpeakerUnderInterference(npcId, state.morrowPlan)) return line;

  const mode = Math.abs(line.text.length) % 3;
  let text = line.text;

  if (mode === 0) {
    const hesitated = text.replace(/\b(but|and|then|because)\b/i, '— $1 —');
    text =
      hesitated === text
        ? `${text.replace(/[.]\s*$/, '')} — at least, that is how I remember it now.`
        : hesitated;
  } else if (mode === 1) {
    const words = text.split(/\s+/);
    if (words.length > 7) {
      const phrase = words.slice(0, 4).join(' ');
      text = text.replace(phrase, `${phrase} — ${phrase}`);
    } else {
      text = `${text.replace(/[.]\s*$/, '')}, no — that is not the order it came in.`;
    }
  } else {
    text = shiftClockReading(text) ?? `${text.replace(/[.]\s*$/, '')}, and the time keeps slipping by a minute or two.`;
  }

  return { ...line, text };
}
