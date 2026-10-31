/**
 * Aster, Relay Street. Authored as a char grid rather than a Tiled file: the
 * district is small, the grid is reviewable in a diff, and it keeps the world
 * layer free of a map-editor dependency.
 *
 * Coordinates are world pixels. A position is the character's feet point. The
 * camera and all sprite positions are whole pixels.
 */

export const TILE = 16;
export const VIEW_W = 512;
export const VIEW_H = 288;

export const GRID_WIDTH = 48;
export const GRID_HEIGHT = 22;
export const WORLD_WIDTH = GRID_WIDTH * TILE;
export const WORLD_HEIGHT = GRID_HEIGHT * TILE;

export type Cell =
  | '#'
  | '.'
  | ','
  | '-'
  | 'B'
  | 'L'
  | 'T'
  | 'A'
  | 'N'
  | 'R'
  | 'D'
  | 'C'
  | ' ';

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Solid cells. Everything not listed here is walkable. */
const SOLID: ReadonlySet<Cell> = new Set(['#', 'B', 'L', 'T', 'A', 'N', 'R', 'D', 'C', ' ']);

export const SPAWN: Point = { x: 10 * TILE + 8, y: 15 * TILE + 15 };

function baseCell(x: number, y: number): Cell {
  if (y <= 3 || y >= 17) return '#';
  if (y >= 7 && y <= 13) return ',';
  if (x === 0 || x === GRID_WIDTH - 1) return '#';
  return '.';
}

function buildGrid(): Cell[][] {
  const grid: Cell[][] = Array.from({ length: GRID_HEIGHT }, (_, y) =>
    Array.from({ length: GRID_WIDTH }, (_, x) => baseCell(x, y)),
  );

  const stamp = (x: number, y: number, cell: Cell): void => {
    const row = grid[y];
    if (!row) throw new Error(`district stamp out of bounds: ${x},${y}`);
    row[x] = cell;
  };

  // Road furniture. Every prop is solid and occupies exactly one tile.
  for (const [x, y] of [
    [5, 4],
    [15, 4],
    [35, 4],
    [44, 4],
    [8, 16],
    [24, 16],
    [40, 16],
  ] as const) {
    stamp(x, y, 'L');
  }

  for (const [x, y] of [
    [7, 8],
    [8, 8],
    [7, 9],
  ] as const) {
    stamp(x, y, 'B');
  }

  // Street trees along the building side of each walk. They frame the street
  // without narrowing the walkable three-tile pavement.
  for (const [x, y] of [
    [5, 4],
    [14, 4],
    [27, 4],
    [38, 4],
    [44, 4],
    [6, 16],
    [18, 16],
    [23, 16],
    [36, 16],
    [44, 16],
  ] as const) {
    stamp(x, y, 'R');
  }

  // Parked cars do not survive the single-tile prop projection; the street is
  // dressed with lamps, barriers and trees instead.

  // The evidence terminal, the ward dispatch board, the anchor lamp, Sable,
  // Ivo's stall and the ward call-box.
  stamp(20, 4, 'T');
  stamp(34, 4, 'D');
  stamp(12, 16, 'A');
  stamp(30, 16, 'N');
  stamp(42, 16, 'C');

  return grid;
}

const GRID: readonly (readonly Cell[])[] = buildGrid();

export function cellAt(x: number, y: number): Cell {
  if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) return ' ';
  return GRID[y]?.[x] ?? ' ';
}

export function isSolidCell(cell: Cell): boolean {
  return SOLID.has(cell);
}

export function isSolidTile(tileX: number, tileY: number): boolean {
  return isSolidCell(cellAt(tileX, tileY));
}

/** Ground tile index for the environment sheet (37 columns). */
export function groundTileFor(cell: Cell, x: number, y: number): number {
  if (cell === '#' || y <= 3 || y >= 17) {
    // Rooftops: one palette per building block so the blocks read as separate
    // structures instead of one continuous wall.
    const block = Math.floor(x / 7) % 3;
    const wear = (x * 2 + y * 3) % 3;
    const detail = (x * 11 + y * 7) % 13 === 0;
    if (block === 0) return detail ? 16 + (x % 2) : 40 + wear;
    if (block === 1) return detail ? 76 + (x % 2) : 74 + wear;
    return detail ? 4 + (x % 2) : 0 + wear;
  }
  if (y >= 7 && y <= 13) return 754;
  return 703 + ((x * 5 + y * 3) % 3);
}

/** Storefront band tiles for the two rows that face the street. */
export function facadeTileFor(x: number, y: number): number {
  const block = Math.floor(x / 6) % 4;
  const wear = (x * 7 + y) % 2;
  if (block === 0) return 148 + wear;
  if (block === 1) return 152 + wear;
  if (block === 2) return 172 + wear;
  return 180 + wear;
}

/** Prop sprite tile index, or null when the cell is plain ground. */
export function propTileFor(cell: Cell): number | null {
  switch (cell) {
    case 'L':
      return 500;
    case 'A':
      return 503;
    case 'T':
      return 714;
    case 'D':
      return 714;
    case 'C':
      return 681;
    case 'B':
      return 681;
    case 'R':
      return 515;
    default:
      return null;
  }
}

export type InteractionKind = 'npc' | 'evidence' | 'anchor' | 'decision';

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
}

export const WORLD_TARGETS: readonly WorldTarget[] = [
  {
    id: 'sable',
    kind: 'npc',
    label: 'Sable',
    prompt: 'Talk to Sable',
    tileX: 30,
    tileY: 16,
    x: 30 * TILE + 8,
    y: 16 * TILE + 8,
    radius: 28,
    priority: 3,
  },
  {
    id: 'ivo',
    kind: 'npc',
    label: 'Ivo',
    prompt: "Hear Ivo's account",
    tileX: 37,
    tileY: 16,
    x: 37 * TILE + 8,
    y: 16 * TILE + 8,
    radius: 28,
    priority: 3,
  },
  {
    id: 'ward_call',
    kind: 'decision',
    label: 'Ward call-box',
    prompt: 'Make the ward call',
    tileX: 42,
    tileY: 16,
    x: 42 * TILE + 8,
    y: 16 * TILE + 8,
    radius: 28,
    priority: 3,
  },
  {
    id: 'relay_7_log',
    kind: 'evidence',
    label: 'Relay 7 terminal',
    prompt: 'Read the relay log',
    tileX: 20,
    tileY: 4,
    x: 20 * TILE + 8,
    y: 4 * TILE + 8,
    radius: 28,
    priority: 2,
  },
  {
    id: 'ward_dispatch',
    kind: 'evidence',
    label: 'Ward dispatch board',
    prompt: 'Read the dispatch slip',
    tileX: 34,
    tileY: 4,
    x: 34 * TILE + 8,
    y: 4 * TILE + 8,
    radius: 28,
    priority: 2,
  },
  {
    id: 'anchor_lamp',
    kind: 'anchor',
    label: 'Lamp post',
    prompt: 'Set an anchor',
    tileX: 12,
    tileY: 16,
    x: 12 * TILE + 8,
    y: 16 * TILE + 8,
    radius: 26,
    priority: 1,
  },
];

export const WORLD_BOUNDS: Rect = {
  x: 0,
  y: 0,
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
};

/** Feet collision box, inset from the 16 px sprite. */
export const FEET_WIDTH = 10;
export const FEET_HEIGHT = 6;

export function feetRect(x: number, y: number): Rect {
  return {
    x: x - FEET_WIDTH / 2,
    y: y - FEET_HEIGHT,
    width: FEET_WIDTH,
    height: FEET_HEIGHT,
  };
}

/** True when the feet box overlaps a solid tile or leaves the world. */
export function collidesAt(x: number, y: number): boolean {
  const rect = feetRect(x, y);
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > WORLD_WIDTH ||
    rect.y + rect.height > WORLD_HEIGHT
  ) {
    return true;
  }
  const minX = Math.floor(rect.x / TILE);
  const maxX = Math.floor((rect.x + rect.width - 0.001) / TILE);
  const minY = Math.floor(rect.y / TILE);
  const maxY = Math.floor((rect.y + rect.height - 0.001) / TILE);

  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      if (isSolidTile(tx, ty)) return true;
    }
  }
  return false;
}

export function clampToWorld(x: number, y: number): Point {
  return {
    x: Math.min(WORLD_WIDTH - FEET_WIDTH / 2, Math.max(FEET_WIDTH / 2, x)),
    y: Math.min(WORLD_HEIGHT, Math.max(FEET_HEIGHT, y)),
  };
}
