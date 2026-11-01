/**
 * Veyra world surface. The tile map lives in `cityMap.ts`; this module adds the
 * authored interaction targets and re-exports the stable map/geometry contract
 * used by movement, the renderer and the HUD.
 */

export {
  TILE,
  VIEW_W,
  VIEW_H,
  GRID_WIDTH,
  GRID_HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SPAWN,
  BUILDINGS,
  ROOMS,
  ZONES,
  ROAD_RECTS,
  CROSSWALKS,
  INTERIOR_PROPS,
  STREET_LAMPS,
  FLOOR_TILES,
  WALL_TILE,
  DOOR_TILE,
  cellAt,
  isSolidCell,
  isSolidTile,
  groundTileAt,
  groundTileFor,
  facadeTileFor,
  propTileFor,
  roomAt,
  buildingAt,
  isFacadeAt,
  zoneAt,
  feetRect,
  collidesAt,
  clampToWorld,
  reachableTiles,
  FEET_WIDTH,
  FEET_HEIGHT,
  type Cell,
  type Facing,
  type Point,
  type Rect,
  type RoomDefinition,
  type BuildingDefinition,
  type PropPlacement,
  type ZoneDefinition,
  type RoomLight,
} from './cityMap.js';

import { TILE, GRID_WIDTH, GRID_HEIGHT } from './cityMap.js';
import { CITY_NPCS, COMPANION_NPC } from '../content/cityNpcs.js';

export type InteractionKind = 'npc' | 'evidence' | 'anchor' | 'decision' | 'puzzle';

/** Stable ids for the map-anchored investigations. */
export type WorldPuzzleId = 'signal' | 'timeline' | 'contradiction' | 'bomb';

export interface WorldTarget {
  readonly id: string;
  readonly kind: InteractionKind;
  readonly label: string;
  readonly prompt: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly priority: number;
  /** Present only for `kind: 'puzzle'` targets. */
  readonly puzzle?: WorldPuzzleId;
}

function makeTarget(
  id: string,
  kind: InteractionKind,
  label: string,
  prompt: string,
  tileX: number,
  tileY: number,
  priority = 2,
  radius = 30,
): WorldTarget {
  return {
    id,
    kind,
    label,
    prompt,
    tileX,
    tileY,
    x: tileX * TILE + 8,
    y: tileY * TILE + 8,
    radius,
    priority,
  };
}

const NPC_TARGETS: readonly WorldTarget[] = CITY_NPCS.map((npc) =>
  makeTarget(npc.targetId, 'npc', npc.name, npc.prompt, npc.tileX, npc.tileY, 3, 30),
);

export const COMPANION_TARGET: WorldTarget = {
  id: COMPANION_NPC.targetId,
  kind: 'npc',
  label: COMPANION_NPC.name,
  prompt: COMPANION_NPC.prompt,
  tileX: COMPANION_NPC.tileX,
  tileY: COMPANION_NPC.tileY,
  x: COMPANION_NPC.tileX * TILE + 8,
  y: COMPANION_NPC.tileY * TILE + 8,
  radius: 34,
  priority: 4,
};

const EVIDENCE_TARGETS: readonly WorldTarget[] = [
  makeTarget('relay_7_log', 'evidence', 'Relay 7 terminal', 'Read the relay hardware log', 41, 29),
  makeTarget('ward_dispatch', 'evidence', 'Ward dispatch board', 'Read the dispatch record', 57, 29),
  makeTarget('clue_conduit', 'evidence', 'Gutter conduit', 'Inspect the optical jumper', 9, 52),
  makeTarget('archive_record', 'evidence', 'Archive incident ledger', 'Inspect the archival incident log', 90, 32),
  makeTarget('human_cost', 'evidence', 'Held medical order', 'Examine the held medical shipment', 28, 57),
  makeTarget('clue_guestbook', 'evidence', 'Diner guestbook', 'Search the counter guestbook', 135, 34),
  makeTarget('clue_locker', 'evidence', 'Enforcer locker', 'Crack the enforcer locker', 109, 66),
  makeTarget('depot_terminal', 'evidence', 'Depot override terminal', 'Recover the root override', 100, 60),
  makeTarget('zeroing_order', 'evidence', 'Sealed archive annex', 'Read the sealed zeroing order', 92, 34),
  makeTarget('detonator_schematic', 'evidence', 'Depot maintenance bay', 'Recover the charge schematic', 112, 68),
  makeTarget('freight_log', 'evidence', 'Freight manifest board', 'Inspect the shipping manifest', 110, 82),
  makeTarget('plaza_terminal', 'evidence', 'Plaza civic terminal', 'Scan the civic terminal', 133, 39),
];

const ANCHOR_TARGETS: readonly WorldTarget[] = [
  makeTarget('anchor_lamp', 'anchor', 'Relay Street anchor', 'Set an anchor', 20, 43, 1, 28),
  makeTarget('anchor_plaza', 'anchor', 'Plaza anchor', 'Set a timeline anchor', 136, 42, 1, 28),
  makeTarget('anchor_market', 'anchor', 'Freight yard anchor', 'Set a timeline anchor', 60, 80, 1, 28),
];

const DECISION_TARGETS: readonly WorldTarget[] = [
  makeTarget('ward_call', 'decision', 'Ward call-box', 'Make the ward call', 124, 43, 3),
  makeTarget('morrow_analysis', 'decision', 'Relay 7 core console', 'Correlate the MORROW mechanism', 32, 29, 2),
  makeTarget('morrow_terminate', 'decision', 'MORROW termination relay', 'Open the termination route', 33, 30, 2),
];

function makePuzzleTarget(
  id: string,
  kind: WorldPuzzleId,
  label: string,
  prompt: string,
  tileX: number,
  tileY: number,
  priority = 2,
  radius = 30,
): WorldTarget {
  return {
    ...makeTarget(id, 'puzzle', label, prompt, tileX, tileY, priority, radius),
    puzzle: kind,
  };
}

/**
 * Puzzles live at the place that supplies their evidence. The diner console
 * holds the ward channel, the depot board holds the dispatch order, Ivo's stall
 * holds the contradiction, and the Relay 7 basement holds the charge.
 */
const PUZZLE_TARGETS: readonly WorldTarget[] = [
  makePuzzleTarget(
    'frequency_console',
    'signal',
    'Diner frequency console',
    'Lock the ward channel',
    139,
    34,
    5,
  ),
  makePuzzleTarget(
    'puzzle_timeline',
    'timeline',
    'Ward sequence board',
    'Reconstruct the dispatch order',
    59,
    31,
    5,
  ),
  makePuzzleTarget(
    'puzzle_contradiction',
    'contradiction',
    "Ivo's stall ledger",
    'Test the testimony against the slip',
    28,
    73,
    5,
  ),
  makePuzzleTarget('relay_disarm', 'bomb', 'Zeroing charge', 'Cut the zeroing charge', 34, 28, 5),
];

export const WORLD_TARGETS: readonly WorldTarget[] = [
  ...NPC_TARGETS,
  ...EVIDENCE_TARGETS,
  ...ANCHOR_TARGETS,
  ...DECISION_TARGETS,
  ...PUZZLE_TARGETS,
];

/** Includes the dynamic companion target at its authored home position. */
export const ALL_WORLD_TARGETS: readonly WorldTarget[] = [...WORLD_TARGETS, COMPANION_TARGET];

export function getWorldTarget(id: string): WorldTarget | null {
  return ALL_WORLD_TARGETS.find((target) => target.id === id) ?? null;
}

export const WORLD_BOUNDS = {
  x: 0,
  y: 0,
  width: TILE * GRID_WIDTH,
  height: TILE * GRID_HEIGHT,
};
