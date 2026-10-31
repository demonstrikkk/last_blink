/**
 * Aster, Relay Street. Authored as a char grid rather than a Tiled file: the
 * district is small, the grid is reviewable in a diff, and it keeps the world
 * layer free of a map-editor dependency.
 *
 * Coordinates are world pixels. A position is the character's feet point. The
 * camera and all sprite positions are whole pixels.
 */

export const TILE = 16;
export const VIEW_W = 960;
export const VIEW_H = 540;

export const GRID_WIDTH = 96;
export const GRID_HEIGHT = 44;
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
  // World border boundaries
  if (x === 0 || x === GRID_WIDTH - 1 || y === 0 || y === GRID_HEIGHT - 1) return '#';

  // 1. Enterable Building Interiors
  // Relay 7 Substation Room (x: 19..23, y: 1..3 with door at x: 21, y: 4)
  if (x >= 19 && x <= 23 && y >= 1 && y <= 3) return '.';
  // Nocturne Diner Interior (x: 66..72, y: 1..3 with door at x: 68, y: 4)
  if (x >= 66 && x <= 72 && y >= 1 && y <= 3) return '.';
  // Freight Depot Office Interior (x: 76..82, y: 39..41 with door at x: 78, y: 38)
  if (x >= 76 && x <= 82 && y >= 39 && y <= 41) return '.';

  // North Rooftops & Storefront Tops
  if (y <= 3) return '#';

  // 2. Circular Street Grid: Vertical Avenue Connectors
  // East Connector Avenue (Connecting Central/East to South Market)
  if (x >= 48 && x <= 53 && y >= 7 && y <= 33) return ',';
  // West Connector Alleyway (Completing the circular loop around the city)
  if (x >= 2 && x <= 5 && y >= 14 && y <= 33) return ',';

  // Central Relay Street & East Commercial Plaza (North District)
  if (y <= 21) {
    if (y >= 7 && y <= 13) return ','; // Main thoroughfare
    if (y >= 4 && y <= 6) return '.';  // North sidewalk
    if (y >= 14 && y <= 16) return '.'; // South sidewalk
    // South building row for north district
    return '#';
  }

  // Divider buildings between North and South districts
  if (y <= 24) return '#';

  // South District Market & Freight Yard
  if (y >= 25 && y <= 27) return '.'; // Market north walkway
  if (y >= 28 && y <= 33) return ','; // Freight road
  if (y >= 34 && y <= 37) return '.'; // Market south walkway
  return '#'; // South boundary warehouses
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

  // Road furniture: Central Relay Street
  for (const [x, y] of [
    [5, 4],
    [15, 4],
    [35, 4],
    [44, 4],
    [8, 16],
    [24, 16],
    [40, 16],
    // East Commercial Plaza Lamps
    [58, 4],
    [72, 4],
    [86, 4],
    [62, 16],
    [78, 16],
    [90, 16],
    // South District Market Lamps
    [24, 25],
    [44, 25],
    [66, 25],
    [86, 25],
    [32, 37],
    [56, 37],
    [78, 37],
  ] as const) {
    stamp(x, y, 'L');
  }

  // Police checkpoint barriers
  for (const [x, y] of [
    [7, 8],
    [8, 8],
    [7, 9],
    // Freight depot barriers
    [52, 28],
    [52, 29],
  ] as const) {
    stamp(x, y, 'B');
  }

  // Street trees
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
    // East Plaza trees
    [60, 4],
    [75, 4],
    [88, 4],
    [64, 16],
    [80, 16],
    // South Market trees
    [22, 25],
    [42, 25],
    [70, 25],
    [30, 37],
    [68, 37],
  ] as const) {
    stamp(x, y, 'R');
  }

  // Canonical interactive targets (Central Relay Street)
  stamp(20, 4, 'T'); // Relay 7 terminal
  stamp(34, 4, 'D'); // Ward dispatch board
  stamp(12, 16, 'A'); // Anchor lamp
  stamp(30, 16, 'N'); // Sable
  stamp(42, 16, 'C'); // Ward call-box

  // Expanded targets (East Plaza & South Market)
  stamp(68, 16, 'N'); // Lyra (Nocturne Diner)
  stamp(60, 4, 'T');  // Plaza Customer Terminal
  stamp(86, 16, 'A'); // East Plaza Anchor Lamp
  stamp(42, 34, 'N'); // Vane (Ward Courier)
  stamp(78, 34, 'N'); // Castor (Dispatch Enforcer)
  stamp(70, 25, 'D'); // Freight Manifest Board
  stamp(26, 37, 'A'); // Freight Yard Anchor Post

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
  // Open doorways for enterable buildings
  if ((x === 21 && y === 3) || (x === 68 && y === 3) || (x === 78 && y === 38)) {
    return 703;
  }
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
  // Expanded targets: East Commercial Plaza & South Freight District
  {
    id: 'lyra',
    kind: 'npc',
    label: 'Lyra',
    prompt: 'Talk to Lyra (Diner)',
    tileX: 68,
    tileY: 16,
    x: 68 * TILE + 8,
    y: 16 * TILE + 8,
    radius: 28,
    priority: 3,
  },
  {
    id: 'vane',
    kind: 'npc',
    label: 'Courier Vane',
    prompt: 'Question Courier Vane',
    tileX: 42,
    tileY: 34,
    x: 42 * TILE + 8,
    y: 34 * TILE + 8,
    radius: 28,
    priority: 3,
  },
  {
    id: 'castor',
    kind: 'npc',
    label: 'Enforcer Castor',
    prompt: 'Confront Enforcer Castor',
    tileX: 78,
    tileY: 34,
    x: 78 * TILE + 8,
    y: 34 * TILE + 8,
    radius: 28,
    priority: 3,
  },
  {
    id: 'plaza_terminal',
    kind: 'evidence',
    label: 'Nocturne Diner Terminal',
    prompt: 'Scan guest register',
    tileX: 60,
    tileY: 4,
    x: 60 * TILE + 8,
    y: 4 * TILE + 8,
    radius: 28,
    priority: 2,
  },
  {
    id: 'freight_log',
    kind: 'evidence',
    label: 'Freight Manifest Board',
    prompt: 'Inspect shipping manifest',
    tileX: 70,
    tileY: 25,
    x: 70 * TILE + 8,
    y: 25 * TILE + 8,
    radius: 28,
    priority: 2,
  },
  {
    id: 'anchor_plaza',
    kind: 'anchor',
    label: 'Plaza Anchor Post',
    prompt: 'Set timeline anchor',
    tileX: 86,
    tileY: 16,
    x: 86 * TILE + 8,
    y: 16 * TILE + 8,
    radius: 26,
    priority: 1,
  },
  {
    id: 'anchor_market',
    kind: 'anchor',
    label: 'Freight Yard Anchor',
    prompt: 'Set timeline anchor',
    tileX: 26,
    tileY: 37,
    x: 26 * TILE + 8,
    y: 37 * TILE + 8,
    radius: 26,
    priority: 1,
  },
  // Interactive Clues & Search Spots
  {
    id: 'clue_conduit',
    kind: 'evidence',
    label: 'Gutter Conduit Wire',
    prompt: 'Inspect optical wire in gutter',
    tileX: 14,
    tileY: 14,
    x: 14 * TILE + 8,
    y: 14 * TILE + 8,
    radius: 26,
    priority: 2,
  },
  {
    id: 'clue_guestbook',
    kind: 'evidence',
    label: 'Nocturne Diner Counter',
    prompt: 'Search counter guestbook',
    tileX: 70,
    tileY: 2,
    x: 70 * TILE + 8,
    y: 2 * TILE + 8,
    radius: 26,
    priority: 2,
  },
  {
    id: 'clue_locker',
    kind: 'evidence',
    label: 'Enforcer Locker',
    prompt: 'Crack enforcer frequency locker',
    tileX: 80,
    tileY: 40,
    x: 80 * TILE + 8,
    y: 40 * TILE + 8,
    radius: 26,
    priority: 2,
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
