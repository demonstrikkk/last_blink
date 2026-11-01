import type { ActionType } from '../contracts/index.js';
import {
  CLOCK_DEADLINE_MINUTE,
  CLOCK_START_MINUTE,
  DEADLINE_TICK,
} from '../contracts/loop.js';

export {
  CLOCK_DEADLINE_MINUTE,
  CLOCK_START_MINUTE,
  DEADLINE_TICK,
} from '../contracts/loop.js';

/**
 * Engine-owned time policy. Time is only ever spent by meaningful investigation,
 * never by opening a panel, moving the camera or pressing a dead key. The table
 * is the single source of truth for `GameSession.dispatch`.
 */
export const ACTION_TIME_COST: Readonly<Record<ActionType, number>> = {
  'session.noop': 0,
  'session.advance_tick': 0,
  'fact.assert': 0,
  'anchor.record': 0,
  'branch.fork': 0,
  // The day is short on purpose. Each substantive act moves the clock by a
  // visible hour (or more), so a focused run reaches the 18:00 zeroing in ten
  // to twelve moves while a thorough run runs out of daylight and has to BLINK.
  // Opening panels, walking the district and Pulse scans stay free.
  'evidence.collect': 60,
  'choice.make': 60,
  'case.link': 15,
  'case.hypothesis': 15,
  'challenge.complete': 90,
  'morrow.intervene': 0,
  'morrow.plan': 0,
  'npc.propose': 0,
  'loop.reset': 0,
};

export function timeCostForAction(actionType: ActionType): number {
  return ACTION_TIME_COST[actionType] ?? 0;
}

/** 08:00 is minute 480; the HUD never shows a minute past 18:00. */
export function minuteOfDay(tick: number): number {
  return Math.min(CLOCK_DEADLINE_MINUTE, CLOCK_START_MINUTE + Math.max(0, tick));
}

export function formatMinute(minute: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minute)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function clockLabel(tick: number): string {
  return formatMinute(minuteOfDay(tick));
}

export function remainingTicks(tick: number): number {
  return Math.max(0, DEADLINE_TICK - tick);
}

export function remainingLabel(tick: number): string {
  const remaining = remainingTicks(tick);
  const hours = Math.floor(remaining / 60);
  const minutes = remaining % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function isDeadlineReached(tick: number): boolean {
  return tick >= DEADLINE_TICK;
}

/** Never moves backwards and never passes the deadline in a single action. */
export function advanceTowardsDeadline(fromTick: number, cost: number): number {
  return Math.min(DEADLINE_TICK, fromTick + Math.max(0, Math.round(cost)));
}
