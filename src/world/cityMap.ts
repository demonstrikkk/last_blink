/**
 * Veyra city layout: authored programmatically so the whole circular city is
 * reviewable, testable and diffable. Coordinates are tiles; world pixels are
 * `tile * TILE`.
 *
 * The city is a wide loop: Central Relay Street (east-west spine), North
 * Avenue (north spur), East Commercial Plaza (east), East Connector Avenue,
 * South Freight Road and the West Connector Alleyway. Every listed district is
 * reachable on foot through pavement and road tiles; buildings are enterable
 * through door tiles into authored interior rooms.
 */

export const TILE = 16;
export const VIEW_W = 960;
export const VIEW_H = 540;

export const GRID_WIDTH = 144;
export const GRID_HEIGHT = 96;
export const WORLD_WIDTH = GRID_WIDTH * TILE;
export const WORLD_HEIGHT = GRID_HEIGHT * TILE;

export type Cell =
  | '#'
  | '.'
  | ','
  | 'B'
  | 'L'
  | 'T'
  | 'A'
  | 'N'
  | 'R'
  | 'D'
  | 'C'
  | '_'
  | '='
  | '+'
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

export interface RoomLight {
  readonly x: number;
  readonly y: number;
  readonly color: number;
  readonly size: number;
}

export interface PropPlacement {
  readonly tile: number;
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  readonly tint?: number;
  readonly label?: string;
}

export interface RoomDefinition {
  readonly roomId: string;
  readonly name: string;
  readonly buildingId: string;
  /** Interior floor area, inclusive bounds. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly floorTile: number;
  readonly wallTile: number;
  readonly door: Point;
  readonly lights: readonly RoomLight[];
}

export interface BuildingDefinition {
  readonly buildingId: string;
  readonly name: string;
  readonly sign: string;
  readonly rect: Rect;
  readonly door: Point;
  readonly roomId: string;
  readonly roofPalette: readonly number[];
  readonly accent: string;
}

export interface ZoneDefinition {
  readonly zoneId: string;
  readonly name: string;
  readonly rect: Rect;
  readonly minimapColor: number;
}

const SOLID: ReadonlySet<Cell> = new Set(['#', '=', 'B', 'L', 'T', 'A', 'N', 'R', 'D', 'C', ' ']);

export function isSolidCell(cell: Cell): boolean {
  return SOLID.has(cell);
}

/** Reserved floor tiles from the licenced modern-city sheet. */
export const FLOOR_TILES = {
  pavement: [740, 741, 742] as const,
  road: [786, 787] as const,
  diner: 814,
  depot: 851,
  office: 823,
  clinic: 826,
  home: 851,
  archive: 814,
  civic: 823,
  relay: 777,
  hall: 740,
} as const;

export const WALL_TILE = 759;
export const DOOR_TILE = 695;

export const ROOFS: readonly (readonly number[])[] = [
  [444, 445, 446, 447, 448],
  [451, 452, 453, 454, 455],
  [458, 459, 460, 461, 462],
  [444, 448, 452, 456, 460],
];

export const BUILDINGS: readonly BuildingDefinition[] = [
  {
    buildingId: 'bldg_relay7',
    name: 'Relay 7 Substation',
    sign: 'RELAY 7',
    rect: { x: 30, y: 27, width: 15, height: 14 },
    door: { x: 37, y: 40 },
    roomId: 'relay7',
    roofPalette: [451, 452, 453, 454, 455],
    accent: '#38e1e8',
  },
  {
    buildingId: 'bldg_dispatch',
    name: 'Ward Dispatch Office',
    sign: 'WARD DISPATCH',
    rect: { x: 48, y: 27, width: 15, height: 14 },
    door: { x: 55, y: 40 },
    roomId: 'dispatch',
    roofPalette: [458, 459, 460, 461, 462],
    accent: '#ffb24d',
  },
  {
    buildingId: 'bldg_archive',
    name: 'Municipal Archive',
    sign: 'ARCHIVE',
    rect: { x: 78, y: 27, width: 15, height: 14 },
    door: { x: 85, y: 40 },
    roomId: 'archive',
    roofPalette: [444, 445, 446, 447, 448],
    accent: '#a8c6e6',
  },
  {
    buildingId: 'bldg_civic',
    name: 'Civic Authority',
    sign: 'CIVIC AUTHORITY',
    rect: { x: 98, y: 27, width: 17, height: 14 },
    door: { x: 106, y: 40 },
    roomId: 'civic',
    roofPalette: [451, 452, 453, 454, 455],
    accent: '#ff7a4d',
  },
  {
    buildingId: 'bldg_clinic',
    name: 'Ward Clinic',
    sign: 'CLINIC',
    rect: { x: 26, y: 55, width: 15, height: 15 },
    door: { x: 33, y: 69 },
    roomId: 'clinic',
    roofPalette: [444, 445, 446, 447, 448],
    accent: '#6ff2a8',
  },
  {
    buildingId: 'bldg_apartments',
    name: 'Relay Terraces',
    sign: 'RELAY TERRACES',
    rect: { x: 48, y: 55, width: 15, height: 15 },
    door: { x: 55, y: 69 },
    roomId: 'apartments',
    roofPalette: [458, 459, 460, 461, 462],
    accent: '#ffb24d',
  },
  {
    buildingId: 'bldg_market',
    name: 'Night Market Hall',
    sign: 'NIGHT MARKET',
    rect: { x: 78, y: 55, width: 15, height: 15 },
    door: { x: 85, y: 69 },
    roomId: 'market',
    roofPalette: [451, 452, 453, 454, 455],
    accent: '#ff5cc8',
  },
  {
    buildingId: 'bldg_depot',
    name: 'Freight Depot Office',
    sign: 'FREIGHT LOGISTICS',
    rect: { x: 98, y: 55, width: 15, height: 15 },
    door: { x: 104, y: 69 },
    roomId: 'depot',
    roofPalette: [444, 445, 446, 447, 448],
    accent: '#6ff2a8',
  },
  {
    buildingId: 'bldg_diner',
    name: 'Nocturne Diner',
    sign: 'NOCTURNE DINER',
    rect: { x: 132, y: 26, width: 10, height: 12 },
    door: { x: 136, y: 37 },
    roomId: 'diner',
    roofPalette: [451, 452, 453, 454, 455],
    accent: '#ff5cc8',
  },
];

export const ROOMS: readonly RoomDefinition[] = [
  {
    roomId: 'relay7',
    name: 'Relay 7 control room',
    buildingId: 'bldg_relay7',
    x: 31,
    y: 28,
    width: 13,
    height: 12,
    floorTile: FLOOR_TILES.relay,
    wallTile: WALL_TILE,
    door: { x: 37, y: 40 },
    lights: [
      { x: 34, y: 31, color: 0x38e1e8, size: 90 },
      { x: 41, y: 34, color: 0xffb24d, size: 72 },
    ],
  },
  {
    roomId: 'dispatch',
    name: 'Ward dispatch floor',
    buildingId: 'bldg_dispatch',
    x: 49,
    y: 28,
    width: 13,
    height: 12,
    floorTile: FLOOR_TILES.office,
    wallTile: WALL_TILE,
    door: { x: 55, y: 40 },
    lights: [
      { x: 52, y: 31, color: 0xffb24d, size: 88 },
      { x: 59, y: 36, color: 0x38e1e8, size: 66 },
    ],
  },
  {
    roomId: 'archive',
    name: 'Municipal archive stacks',
    buildingId: 'bldg_archive',
    x: 79,
    y: 28,
    width: 13,
    height: 12,
    floorTile: FLOOR_TILES.archive,
    wallTile: WALL_TILE,
    door: { x: 85, y: 40 },
    lights: [
      { x: 82, y: 31, color: 0xa8c6e6, size: 80 },
      { x: 89, y: 35, color: 0xffb24d, size: 68 },
    ],
  },
  {
    roomId: 'civic',
    name: 'Civic authority chamber',
    buildingId: 'bldg_civic',
    x: 99,
    y: 28,
    width: 15,
    height: 12,
    floorTile: FLOOR_TILES.civic,
    wallTile: WALL_TILE,
    door: { x: 106, y: 40 },
    lights: [
      { x: 103, y: 31, color: 0xff7a4d, size: 90 },
      { x: 110, y: 35, color: 0xffb24d, size: 78 },
    ],
  },
  {
    roomId: 'clinic',
    name: 'Ward clinic ward',
    buildingId: 'bldg_clinic',
    x: 27,
    y: 56,
    width: 13,
    height: 13,
    floorTile: FLOOR_TILES.clinic,
    wallTile: WALL_TILE,
    door: { x: 33, y: 69 },
    lights: [
      { x: 30, y: 59, color: 0x6ff2a8, size: 82 },
      { x: 36, y: 64, color: 0xffb24d, size: 68 },
    ],
  },
  {
    roomId: 'apartments',
    name: 'Relay Terraces lobby',
    buildingId: 'bldg_apartments',
    x: 49,
    y: 56,
    width: 13,
    height: 13,
    floorTile: FLOOR_TILES.home,
    wallTile: WALL_TILE,
    door: { x: 55, y: 69 },
    lights: [
      { x: 52, y: 59, color: 0xffb24d, size: 84 },
      { x: 59, y: 65, color: 0x38e1e8, size: 62 },
    ],
  },
  {
    roomId: 'market',
    name: 'Night market hall',
    buildingId: 'bldg_market',
    x: 79,
    y: 56,
    width: 13,
    height: 13,
    floorTile: FLOOR_TILES.diner,
    wallTile: WALL_TILE,
    door: { x: 85, y: 69 },
    lights: [
      { x: 82, y: 59, color: 0xff5cc8, size: 80 },
      { x: 89, y: 64, color: 0xffb24d, size: 78 },
    ],
  },
  {
    roomId: 'depot',
    name: 'Freight depot office',
    buildingId: 'bldg_depot',
    x: 99,
    y: 56,
    width: 13,
    height: 13,
    floorTile: FLOOR_TILES.depot,
    wallTile: WALL_TILE,
    door: { x: 104, y: 69 },
    lights: [
      { x: 102, y: 59, color: 0x6ff2a8, size: 86 },
      { x: 109, y: 64, color: 0xffb24d, size: 66 },
    ],
  },
  {
    roomId: 'diner',
    name: 'Nocturne Diner counter',
    buildingId: 'bldg_diner',
    x: 133,
    y: 27,
    width: 8,
    height: 10,
    floorTile: FLOOR_TILES.diner,
    wallTile: WALL_TILE,
    door: { x: 136, y: 37 },
    lights: [
      { x: 135, y: 29, color: 0xff5cc8, size: 78 },
      { x: 138, y: 33, color: 0xffb24d, size: 66 },
    ],
  },
];

export const ZONES: readonly ZoneDefinition[] = [
  { zoneId: 'central', name: 'Central Relay Street', rect: { x: 14, y: 41, width: 116, height: 13 }, minimapColor: 0x1d3346 },
  { zoneId: 'north', name: 'North Avenue', rect: { x: 64, y: 4, width: 11, height: 37 }, minimapColor: 0x21394d },
  { zoneId: 'plaza', name: 'East Commercial Plaza', rect: { x: 123, y: 23, width: 18, height: 20 }, minimapColor: 0x3b2440 },
  { zoneId: 'east', name: 'East Connector Avenue', rect: { x: 126, y: 22, width: 8, height: 66 }, minimapColor: 0x1d3346 },
  { zoneId: 'south', name: 'South Freight Road', rect: { x: 10, y: 82, width: 124, height: 9 }, minimapColor: 0x243d33 },
  { zoneId: 'west', name: 'West Connector Alleyway', rect: { x: 6, y: 20, width: 8, height: 68 }, minimapColor: 0x2c2c3a },
  { zoneId: 'oldquarter', name: 'Old Quarter', rect: { x: 24, y: 24, width: 40, height: 19 }, minimapColor: 0x2a2a36 },
  { zoneId: 'civicward', name: 'Civic Ward', rect: { x: 76, y: 24, width: 40, height: 19 }, minimapColor: 0x332b24 },
  { zoneId: 'terraces', name: 'Relay Terraces', rect: { x: 24, y: 54, width: 40, height: 18 }, minimapColor: 0x2f2620 },
  { zoneId: 'freightyard', name: 'Freight Yard', rect: { x: 76, y: 54, width: 40, height: 18 }, minimapColor: 0x1f2f2a },
];

export const ROAD_RECTS: readonly Rect[] = [
  { x: 6, y: 44, width: 136, height: 7 }, // Central Relay Street
  { x: 66, y: 4, width: 7, height: 45 }, // North Avenue
  { x: 18, y: 18, width: 5, height: 61 }, // west ring segment
  { x: 18, y: 18, width: 105, height: 5 }, // north ring segment
  { x: 118, y: 18, width: 5, height: 61 }, // east ring segment
  { x: 18, y: 74, width: 105, height: 5 }, // south ring segment
  { x: 128, y: 22, width: 4, height: 66 }, // East Connector Avenue
  { x: 8, y: 20, width: 4, height: 68 }, // West Connector Alleyway
  { x: 10, y: 84, width: 123, height: 5 }, // South Freight Road
];

export const CROSSWALKS: readonly Rect[] = [
  { x: 36, y: 44, width: 6, height: 7 },
  { x: 84, y: 44, width: 6, height: 7 },
  { x: 52, y: 84, width: 6, height: 5 },
  { x: 66, y: 74, width: 7, height: 5 },
  { x: 18, y: 44, width: 5, height: 7 },
];

export const INTERIOR_PROPS: readonly PropPlacement[] = [
  // Relay 7: terminal bank, consoles, work desk, cable crates.
  { tile: 527, x: 41, y: 29, label: 'relay terminal' },
  { tile: 545, x: 33, y: 29 },
  { tile: 546, x: 35, y: 29 },
  { tile: 481, x: 39, y: 35 },
  { tile: 641, x: 42, y: 38 },
  { tile: 642, x: 41, y: 38 },
  { tile: 633, x: 32, y: 37 },
  { tile: 566, x: 31, y: 28 },
  // Ward dispatch: rows of desks and live boards.
  { tile: 481, x: 51, y: 30 },
  { tile: 482, x: 54, y: 30 },
  { tile: 483, x: 58, y: 30 },
  { tile: 527, x: 57, y: 29 },
  { tile: 547, x: 60, y: 36 },
  { tile: 675, x: 50, y: 36 },
  { tile: 543, x: 56, y: 34 },
  { tile: 544, x: 59, y: 34 },
  // Archive: stacks and reading desk.
  { tile: 606, x: 80, y: 30 },
  { tile: 607, x: 81, y: 30 },
  { tile: 608, x: 82, y: 30 },
  { tile: 610, x: 88, y: 30 },
  { tile: 611, x: 89, y: 30 },
  { tile: 536, x: 84, y: 34 },
  { tile: 641, x: 90, y: 37 },
  { tile: 633, x: 80, y: 37 },
  // Civic chamber: long table, chairs, banners.
  { tile: 537, x: 105, y: 33 },
  { tile: 501, x: 102, y: 32 },
  { tile: 502, x: 108, y: 32 },
  { tile: 592, x: 100, y: 29 },
  { tile: 593, x: 112, y: 29 },
  { tile: 545, x: 111, y: 36 },
  { tile: 544, x: 101, y: 36 },
  // Clinic: beds, cabinets, screens.
  { tile: 538, x: 29, y: 58 },
  { tile: 539, x: 32, y: 58 },
  { tile: 547, x: 36, y: 58 },
  { tile: 566, x: 38, y: 63 },
  { tile: 543, x: 31, y: 65 },
  { tile: 692, x: 27, y: 63 },
  // Terraces: beds, sofa, table, plant.
  { tile: 540, x: 51, y: 58 },
  { tile: 541, x: 55, y: 58 },
  { tile: 530, x: 58, y: 63 },
  { tile: 543, x: 52, y: 64 },
  { tile: 567, x: 59, y: 60 },
  { tile: 641, x: 50, y: 67 },
  // Market hall: stalls and crates.
  { tile: 606, x: 81, y: 58 },
  { tile: 607, x: 84, y: 58 },
  { tile: 608, x: 87, y: 58 },
  { tile: 675, x: 81, y: 63 },
  { tile: 676, x: 84, y: 63 },
  { tile: 677, x: 87, y: 63 },
  { tile: 641, x: 90, y: 67 },
  { tile: 643, x: 89, y: 67 },
  // Depot office: lockers, terminal desk, manifest shelves.
  { tile: 547, x: 110, y: 64 },
  { tile: 548, x: 111, y: 64 },
  { tile: 545, x: 99, y: 60 },
  { tile: 482, x: 100, y: 60 },
  { tile: 676, x: 99, y: 66 },
  { tile: 642, x: 106, y: 67 },
  { tile: 641, x: 107, y: 67 },
  { tile: 633, x: 108, y: 60 },
  // Nocturne Diner: counter, booths, jukebox, kitchen.
  { tile: 568, x: 134, y: 33 },
  { tile: 569, x: 135, y: 33 },
  { tile: 570, x: 136, y: 33 },
  { tile: 571, x: 137, y: 33 },
  { tile: 572, x: 138, y: 33 },
  { tile: 543, x: 134, y: 31 },
  { tile: 544, x: 137, y: 31 },
  { tile: 527, x: 136, y: 35, label: 'diner register' },
  { tile: 566, x: 139, y: 28 },
  { tile: 675, x: 140, y: 29 },
  { tile: 633, x: 133, y: 30 },
];

export const STREET_LAMPS: readonly RoomLight[] = [
  { x: 20, y: 43, color: 0xffb24d, size: 84 },
  { x: 36, y: 43, color: 0x38e1e8, size: 64 },
  { x: 55, y: 43, color: 0xffb24d, size: 84 },
  { x: 85, y: 43, color: 0x38e1e8, size: 64 },
  { x: 106, y: 43, color: 0xffb24d, size: 84 },
  { x: 124, y: 43, color: 0xff5cc8, size: 64 },
  { x: 20, y: 52, color: 0xffb24d, size: 84 },
  { x: 55, y: 52, color: 0x38e1e8, size: 60 },
  { x: 104, y: 52, color: 0xffb24d, size: 84 },
  { x: 136, y: 40, color: 0xff5cc8, size: 84 },
  { x: 30, y: 71, color: 0xffb24d, size: 80 },
  { x: 55, y: 71, color: 0x38e1e8, size: 60 },
  { x: 85, y: 71, color: 0xff5cc8, size: 64 },
  { x: 104, y: 71, color: 0x6ff2a8, size: 76 },
  { x: 120, y: 83, color: 0xffb24d, size: 80 },
  { x: 70, y: 83, color: 0x38e1e8, size: 64 },
  { x: 20, y: 83, color: 0xffb24d, size: 76 },
  { x: 20, y: 30, color: 0x38e1e8, size: 64 },
  { x: 120, y: 30, color: 0xffb24d, size: 76 },
];

export const SPAWN: Point = { x: 20 * TILE + 8, y: 43 * TILE + 8 };

function createGrid(): Cell[][] {
  return Array.from({ length: GRID_HEIGHT }, () =>
    Array.from({ length: GRID_WIDTH }, (): Cell => '#'),
  );
}

function paint(grid: Cell[][], rect: Rect, cell: Cell): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (x <= 0 || y <= 0 || x >= GRID_WIDTH - 1 || y >= GRID_HEIGHT - 1) continue;
      const row = grid[y];
      if (row) row[x] = cell;
    }
  }
}

function expand(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function buildGrid(): Cell[][] {
  const grid = createGrid();

  // Pavement corridors first, then road surfaces on top.
  for (const road of ROAD_RECTS) paint(grid, expand(road, 2), '.');
  paint(grid, { x: 123, y: 23, width: 18, height: 20 }, '.'); // East plaza
  paint(grid, { x: 123, y: 22, width: 18, height: 68 }, '.'); // east market walk
  paint(grid, { x: 62, y: 4, width: 15, height: 40 }, '.');
  paint(grid, { x: 6, y: 20, width: 9, height: 70 }, '.');
  paint(grid, { x: 16, y: 68, width: 113, height: 8 }, '.');
  paint(grid, { x: 6, y: 40, width: 136, height: 5 }, '.');
  paint(grid, { x: 6, y: 50, width: 136, height: 5 }, '.');
  paint(grid, { x: 8, y: 80, width: 129, height: 10 }, '.');

  // Alleys cut through the four inner blocks.
  paint(grid, { x: 45, y: 24, width: 2, height: 47 }, '.');
  paint(grid, { x: 95, y: 24, width: 2, height: 47 }, '.');
  paint(grid, { x: 24, y: 68, width: 90, height: 4 }, '.');

  // Roads.
  for (const road of ROAD_RECTS) paint(grid, road, ',');

  // Outer south industrial apron.
  paint(grid, { x: 12, y: 89, width: 126, height: 4 }, '.');

  // Buildings (roof mass, walls, interiors, doors). Written last so roads never
  // erase a building; all building footprints sit on block interiors.
  for (const building of BUILDINGS) {
    paint(grid, building.rect, '#');
    const room = ROOMS.find((candidate) => candidate.roomId === building.roomId);
    if (!room) continue;
    paint(grid, { x: room.x, y: room.y, width: room.width, height: room.height }, '=');
    paint(
      grid,
      { x: room.x + 1, y: room.y + 1, width: room.width - 2, height: room.height - 2 },
      '_',
    );
    const roomBottom = room.y + room.height - 1;
    const doorX = room.door.x;
    grid[roomBottom]![doorX] = '+';
    // Connect the room wall to the street-facing door tile.
    const outsideY = roomBottom + 1;
    if (outsideY < GRID_HEIGHT) grid[outsideY]![doorX] = '+';
    // Doorway floor inside the room.
    grid[roomBottom - 1]![doorX] = '_';
  }

  return grid;
}

const GRID: readonly (readonly Cell[])[] = buildGrid();

export function cellAt(x: number, y: number): Cell {
  if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) return ' ';
  return GRID[y]?.[x] ?? ' ';
}

export function isSolidTile(tileX: number, tileY: number): boolean {
  return isSolidCell(cellAt(tileX, tileY));
}

export function roomAt(x: number, y: number): RoomDefinition | null {
  for (const room of ROOMS) {
    if (x > room.x && y > room.y && x < room.x + room.width - 1 && y < room.y + room.height - 1) {
      return room;
    }
  }
  return null;
}

export function buildingAt(x: number, y: number): BuildingDefinition | null {
  for (const building of BUILDINGS) {
    const r = building.rect;
    if (x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height) return building;
  }
  return null;
}

/** True when a building's south-facing wall row should render as a facade. */
export function isFacadeAt(x: number, y: number): boolean {
  if (cellAt(x, y) !== '#') return false;
  const below = cellAt(x, y + 1);
  return below === '.' || below === '+' || below === ',' || below === '_';
}

export function groundTileAt(x: number, y: number): number {
  const cell = cellAt(x, y);
  const room = roomAt(x, y);
  if (cell === '_' && room) {
    const detail = (x * 7 + y * 11) % 17 === 0;
    return detail ? room.floorTile + 1 : room.floorTile;
  }
  if (cell === '=') {
    const roomForWall = ROOMS.find(
      (candidate) =>
        x >= candidate.x &&
        y >= candidate.y &&
        x < candidate.x + candidate.width &&
        y < candidate.y + candidate.height,
    );
    return roomForWall?.wallTile ?? WALL_TILE;
  }
  if (cell === '+') return DOOR_TILE;
  if (cell === '#') {
    const building = buildingAt(x, y);
    const palette = building?.roofPalette ?? ROOFS[0]!;
    if (isFacadeAt(x, y)) {
      // Storefront window band with occasional lit pane.
      const lit = (x * 13 + y * 5) % 7 === 0;
      return lit ? 695 + (x % 2) : 691 + ((x + y) % 4);
    }
    return palette[(x * 3 + y * 5) % palette.length]!;
  }
  if (cell === '.') {
    const wear = (x * 5 + y * 3) % 11 === 0;
    return wear ? 744 : FLOOR_TILES.pavement[(x + y) % FLOOR_TILES.pavement.length]!;
  }
  if (cell === ',') {
    return FLOOR_TILES.road[(x * 3 + y) % FLOOR_TILES.road.length]!;
  }
  if (isSolidCell(cell)) {
    // Legacy street furniture cells keep their old stand-in ground.
    return 740;
  }
  return 740;
}

/** Legacy export retained for the renderer contract. */
export function groundTileFor(cell: Cell, x: number, y: number): number {
  const room = roomAt(x, y);
  if (cell === '_' && room) return room.floorTile;
  if (cell === '=') return WALL_TILE;
  if (cell === '+') return DOOR_TILE;
  if (cell === '#') {
    const building = buildingAt(x, y);
    const palette = building?.roofPalette ?? ROOFS[0]!;
    return palette[(x + y) % palette.length]!;
  }
  if (cell === '.') return FLOOR_TILES.pavement[(x + y) % 3]!;
  if (cell === ',') return FLOOR_TILES.road[0]!;
  return 740;
}

export function facadeTileFor(x: number, y: number): number {
  return 691 + ((x + y) % 4);
}

export function propTileFor(cell: Cell): number | null {
  switch (cell) {
    case 'L':
      return 633;
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

export function zoneAt(x: number, y: number): ZoneDefinition | null {
  let match: ZoneDefinition | null = null;
  for (const zone of ZONES) {
    const r = zone.rect;
    if (x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height) {
      match = match ?? zone;
    }
  }
  return match;
}

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

/** Flood fill used by tests and the debug map to prove every target is reachable. */
export function reachableTiles(from: Point): Set<string> {
  const startX = Math.floor(from.x / TILE);
  const startY = Math.floor(from.y / TILE);
  const seen = new Set<string>();
  const queue: Array<[number, number]> = [[startX, startY]];
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    if (isSolidTile(x, y)) continue;
    seen.add(key);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}
