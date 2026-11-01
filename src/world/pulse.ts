import { ALL_WORLD_TARGETS, type WorldTarget } from './district.js';
import { targetAvailable, type WorldView } from './worldView.js';

export interface PulseLead {
  readonly targetId: string;
  readonly label: string;
  readonly prompt: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly distanceTiles: number;
  readonly direction: string;
}

export interface PulseReadout {
  readonly openLeads: number;
  readonly missingEvidence: number;
  readonly remaining: string;
  readonly pressure: string | null;
  readonly nearest: PulseLead | null;
  /** One line suitable for the HUD toast. */
  readonly summary: string;
}

function collected(view: WorldView, evidenceId: string): boolean {
  return view.evidence.some((item) => item.evidenceId === evidenceId && item.collected);
}

function challengeDone(view: WorldView, challengeId: string): boolean {
  return view.challengeResults.some((result) => result.challengeId === challengeId);
}

function choiceDone(view: WorldView, nodeId: string): boolean {
  return view.choices.some((choice) => choice.nodeId === nodeId && choice.resolvedOptionId !== null);
}

/**
 * A puzzle is a live lead only when the player can act on it now. Showing a
 * locked console as "nearest" would send the player to a dead interaction, so
 * the readout prefers reachable work.
 */
function puzzleIsOpen(view: WorldView, target: WorldTarget): boolean {
  if (target.puzzle === 'signal') {
    return collected(view, 'clue_guestbook') && !choiceDone(view, 'node.frequency.puzzle');
  }
  if (target.puzzle === 'timeline') {
    return (
      collected(view, 'relay_7_log') &&
      collected(view, 'ward_dispatch') &&
      collected(view, 'vendor_testimony') &&
      !challengeDone(view, 'challenge_timeline_relay7')
    );
  }
  if (target.puzzle === 'contradiction') {
    return (
      collected(view, 'ward_dispatch') &&
      collected(view, 'vendor_testimony') &&
      !challengeDone(view, 'challenge_dispatch_contradiction')
    );
  }
  return view.attackPlan.disarmReady;
}

function isOpenLead(view: WorldView, target: WorldTarget): boolean {
  if (!targetAvailable(view, target.id)) return false;
  if (target.kind === 'evidence') {
    const item = view.evidence.find((candidate) => candidate.evidenceId === target.id);
    return Boolean(item && !item.collected);
  }
  if (target.kind === 'puzzle') return puzzleIsOpen(view, target);
  if (target.kind === 'decision') {
    const nodeByTarget: Readonly<Record<string, string>> = {
      ward_call: 'node.ward.call',
      morrow_analysis: 'node.morrow.analysis',
      morrow_terminate: 'node.morrow.terminate',
    };
    const nodeId = nodeByTarget[target.id];
    return nodeId ? !choiceDone(view, nodeId) : true;
  }
  return false;
}

function compass(dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return 'here';
  const vertical = dy < 0 ? 'N' : dy > 0 ? 'S' : '';
  const horizontal = dx > 0 ? 'E' : dx < 0 ? 'W' : '';
  return `${vertical}${horizontal}`;
}

export function buildPulseReadout(
  view: WorldView,
  playerTile: { readonly x: number; readonly y: number },
): PulseReadout {
  const leads = ALL_WORLD_TARGETS.filter((target) => isOpenLead(view, target));
  const ranked = leads
    .map((target) => ({
      target,
      distanceTiles: Math.round(
        Math.hypot(target.tileX - playerTile.x, target.tileY - playerTile.y),
      ),
    }))
    .sort(
      (left, right) =>
        left.distanceTiles - right.distanceTiles ||
        right.target.priority - left.target.priority ||
        left.target.id.localeCompare(right.target.id),
    );

  const nearest = ranked[0]
    ? {
        targetId: ranked[0].target.id,
        label: ranked[0].target.label,
        prompt: ranked[0].target.prompt,
        tileX: ranked[0].target.tileX,
        tileY: ranked[0].target.tileY,
        distanceTiles: ranked[0].distanceTiles,
        direction: compass(
          ranked[0].target.tileX - playerTile.x,
          ranked[0].target.tileY - playerTile.y,
        ),
      }
    : null;

  const missingEvidence = view.evidence.filter((item) => !item.collected).length;
  const pressure = view.threats[0] ?? null;
  const remaining = view.clock.remainingLabel;

  const leadLine = nearest
    ? nearest.distanceTiles <= 1
      ? `Nearest lead: ${nearest.label} — within reach. ${nearest.prompt}.`
      : `Nearest lead: ${nearest.label} — ${nearest.distanceTiles} tiles ${nearest.direction}. ${nearest.prompt}.`
    : 'No reachable lead. Test a contradiction in ECHO, or BLINK and try another route.';

  const openLeads = ranked.length;
  const summary = [
    `PULSE // ${openLeads} open lead${openLeads === 1 ? '' : 's'} · ${missingEvidence} record${
      missingEvidence === 1 ? '' : 's'
    } still missing · ${remaining} to 18:00.`,
    leadLine,
    pressure ? `Pressure: ${pressure}` : 'Pressure: no active MORROW countermeasure detected.',
  ].join(' ');

  return {
    openLeads,
    missingEvidence,
    remaining,
    pressure,
    nearest,
    summary,
  };
}
