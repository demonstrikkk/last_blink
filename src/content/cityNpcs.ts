/**
 * The visible cast of Veyra. Locations are tiles and must remain walkable.
 * `spriteBase` maps to the curated CC0 character sheets under
 * `public/assets/characters/`; tints separate characters sharing a base sheet.
 * Moth is the player's relay companion and follows Aster at runtime.
 */

export interface CityNpc {
  readonly npcId: string;
  readonly targetId: string;
  readonly name: string;
  readonly role: string;
  readonly spriteBase: 'cap' | 'girl' | 'kid' | 'miner' | 'oldwoman' | 'sage' | 'woman';
  readonly tint: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly prompt: string;
  readonly zone: string;
  readonly followsPlayer?: boolean;
}

export const CITY_NPCS: readonly CityNpc[] = [
  {
    npcId: 'npc_sable',
    targetId: 'sable',
    name: 'Sable',
    role: 'Relay mechanic',
    spriteBase: 'oldwoman',
    tint: 0xffffff,
    tileX: 37,
    tileY: 42,
    prompt: 'Talk to Sable',
    zone: 'Old Quarter',
  },
  {
    npcId: 'npc_ivo',
    targetId: 'ivo',
    name: 'Ivo',
    role: 'Stallholder and witness',
    spriteBase: 'sage',
    tint: 0xffe0b8,
    tileX: 30,
    tileY: 71,
    prompt: "Hear Ivo's account",
    zone: 'Relay Terraces',
  },
  {
    npcId: 'npc_lyra',
    targetId: 'lyra',
    name: 'Lyra',
    role: 'Nocturne Diner proprietor',
    spriteBase: 'girl',
    tint: 0xffb6e6,
    tileX: 137,
    tileY: 29,
    prompt: 'Talk to Lyra',
    zone: 'East Commercial Plaza',
  },
  {
    npcId: 'npc_vane',
    targetId: 'vane',
    name: 'Courier Vane',
    role: 'Intercepted ward courier',
    spriteBase: 'woman',
    tint: 0xbfe8ff,
    tileX: 60,
    tileY: 80,
    prompt: 'Question Courier Vane',
    zone: 'South Freight Road',
  },
  {
    npcId: 'npc_castor',
    targetId: 'castor',
    name: 'Enforcer Castor',
    role: 'Ward dispatch enforcer',
    spriteBase: 'miner',
    tint: 0xffc9a8,
    tileX: 104,
    tileY: 71,
    prompt: 'Confront Enforcer Castor',
    zone: 'Freight Yard',
  },
  {
    npcId: 'npc_mara',
    targetId: 'mara',
    name: 'Mara',
    role: 'Archive keeper',
    spriteBase: 'woman',
    tint: 0xe6d8ff,
    tileX: 85,
    tileY: 32,
    prompt: 'Converse with Mara',
    zone: 'Civic Ward',
  },
  {
    npcId: 'npc_ren',
    targetId: 'ren',
    name: 'Operator Ren',
    role: 'Ward dispatch operator',
    spriteBase: 'cap',
    tint: 0xffe6a8,
    tileX: 55,
    tileY: 32,
    prompt: 'Question Operator Ren',
    zone: 'Old Quarter',
  },
  {
    npcId: 'npc_nia',
    targetId: 'nia',
    name: 'Nia',
    role: 'Affected ward resident',
    spriteBase: 'girl',
    tint: 0xffd0c0,
    tileX: 33,
    tileY: 60,
    prompt: 'Speak with Nia',
    zone: 'Relay Terraces',
  },
  {
    npcId: 'npc_vale',
    targetId: 'vale',
    name: 'Director Vale',
    role: 'Civic authority administrator',
    spriteBase: 'sage',
    tint: 0xffb0a0,
    tileX: 106,
    tileY: 32,
    prompt: 'Confront Director Vale',
    zone: 'Civic Ward',
  },
  {
    npcId: 'npc_orin',
    targetId: 'orin',
    name: 'Orin',
    role: 'Relay 7 technician',
    spriteBase: 'kid',
    tint: 0xa8fff4,
    tileX: 40,
    tileY: 32,
    prompt: 'Ask Orin about the relay',
    zone: 'Old Quarter',
  },
  {
    npcId: 'npc_kade',
    targetId: 'kade',
    name: 'Kade',
    role: 'Freight yard dockworker',
    spriteBase: 'miner',
    tint: 0xc8ffd0,
    tileX: 114,
    tileY: 80,
    prompt: 'Talk to dockworker Kade',
    zone: 'South Freight Road',
  },
  {
    npcId: 'npc_suri',
    targetId: 'suri',
    name: 'Suri',
    role: 'Street medic',
    spriteBase: 'woman',
    tint: 0xd0ffd8,
    tileX: 134,
    tileY: 40,
    prompt: 'Talk to medic Suri',
    zone: 'East Commercial Plaza',
  },
  {
    npcId: 'npc_tamsin',
    targetId: 'tamsin',
    name: 'Tamsin',
    role: 'Relay Terraces resident',
    spriteBase: 'kid',
    tint: 0xffe6c8,
    tileX: 55,
    tileY: 60,
    prompt: 'Speak with Tamsin',
    zone: 'Relay Terraces',
  },
  {
    npcId: 'npc_ward_runner',
    targetId: 'ward_runner',
    name: 'Ward Runner',
    role: 'Anonymous dispatch runner',
    spriteBase: 'cap',
    tint: 0xc0c8d8,
    tileX: 120,
    tileY: 52,
    prompt: 'Stop the ward runner',
    zone: 'Central Relay Street',
  },
];

export const COMPANION_NPC: CityNpc = {
  npcId: 'npc_moth',
  targetId: 'moth',
  name: 'Moth',
  role: 'Relay companion drone',
  spriteBase: 'kid',
  tint: 0x8ff6ff,
  tileX: 22,
  tileY: 43,
  prompt: 'Ask Moth for a read',
  zone: 'Central Relay Street',
  followsPlayer: true,
};

export const ALL_VISIBLE_NPCS: readonly CityNpc[] = [...CITY_NPCS, COMPANION_NPC];

export function npcByTargetId(targetId: string): CityNpc | null {
  return ALL_VISIBLE_NPCS.find((npc) => npc.targetId === targetId) ?? null;
}
