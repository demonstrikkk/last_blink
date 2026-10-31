import type { WorldTarget } from './district.js';
import { WORLD_TARGETS } from './district.js';

export interface PlayerPoint {
  readonly x: number;
  readonly y: number;
}

export function distanceToTarget(player: PlayerPoint, target: WorldTarget): number {
  return Math.hypot(target.x - player.x, target.y - player.y);
}

export function isInRange(player: PlayerPoint, target: WorldTarget): boolean {
  return distanceToTarget(player, target) <= target.radius;
}

/**
 * Generic proximity selection. The player controller never knows what an NPC or
 * a terminal is: it asks for the nearest available target in range. Ties are
 * resolved by priority (NPC > evidence > anchor), then by id, so the result is
 * deterministic.
 */
export function findInteractionTarget(
  player: PlayerPoint,
  targets: readonly WorldTarget[] = WORLD_TARGETS,
  isAvailable: (target: WorldTarget) => boolean = () => true,
): WorldTarget | null {
  let best: WorldTarget | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    if (!isAvailable(target)) continue;
    const distance = distanceToTarget(player, target);
    if (distance > target.radius) continue;

    if (best === null || distance < bestDistance) {
      best = target;
      bestDistance = distance;
      continue;
    }

    if (
      Math.abs(distance - bestDistance) < 0.001 &&
      (target.priority > best.priority ||
        (target.priority === best.priority && target.id < best.id))
    ) {
      best = target;
    }
  }

  return best;
}
