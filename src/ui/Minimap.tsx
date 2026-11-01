import { useEffect, useRef } from 'react';
import {
  ALL_WORLD_TARGETS,
  BUILDINGS,
  GRID_HEIGHT,
  GRID_WIDTH,
  ROAD_RECTS,
  ROOMS,
  TILE,
  ZONES,
  roomAt,
  zoneAt,
} from '../world/district.js';
import { targetAvailable, type WorldView } from '../world/worldView.js';

interface MinimapProps {
  readonly playerTile: { x: number; y: number };
  readonly view: WorldView;
}

const SCALE = 2;
const WIDTH = GRID_WIDTH * SCALE;
const HEIGHT = GRID_HEIGHT * SCALE;

const KIND_COLOURS: Record<string, string> = {
  evidence: '#ffb24d',
  decision: '#ff7a4d',
  anchor: '#38e1e8',
  npc: '#7f9bb5',
};

function locationLabel(tileX: number, tileY: number): string {
  if (tileX < 0 || tileY < 0 || tileX >= GRID_WIDTH || tileY >= GRID_HEIGHT) {
    return 'Outside Aster';
  }
  const room = roomAt(tileX, tileY);
  if (room) return room.name;
  return zoneAt(tileX, tileY)?.name ?? 'Aster ring road';
}

/**
 * Player-facing city map. It is presentation only: every coordinate comes from
 * the authored map and every blip from the canonical `WorldView`, so the map can
 * never disagree with the world or reveal a target the engine has gated.
 */
export function Minimap({ playerTile, view }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#070a0f';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Zones as broad blocks so the ring reads at a glance.
    for (const zone of ZONES) {
      ctx.fillStyle = `#${zone.minimapColor.toString(16).padStart(6, '0')}`;
      ctx.fillRect(
        zone.rect.x * SCALE,
        zone.rect.y * SCALE,
        zone.rect.width * SCALE,
        zone.rect.height * SCALE,
      );
    }

    for (const road of ROAD_RECTS) {
      ctx.fillStyle = 'rgba(4, 8, 14, 0.72)';
      ctx.fillRect(road.x * SCALE, road.y * SCALE, road.width * SCALE, road.height * SCALE);
    }

    for (const building of BUILDINGS) {
      ctx.fillStyle = '#141d27';
      ctx.fillRect(
        building.rect.x * SCALE,
        building.rect.y * SCALE,
        building.rect.width * SCALE,
        building.rect.height * SCALE,
      );
      ctx.strokeStyle = 'rgba(56, 225, 232, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        building.rect.x * SCALE + 0.5,
        building.rect.y * SCALE + 0.5,
        building.rect.width * SCALE - 1,
        building.rect.height * SCALE - 1,
      );
      ctx.fillStyle = '#2c3f52';
      for (const room of ROOMS) {
        if (room.buildingId !== building.buildingId) continue;
        ctx.fillRect(
          room.x * SCALE,
          room.y * SCALE,
          room.width * SCALE,
          room.height * SCALE,
        );
      }
      // Door notch.
      ctx.fillStyle = '#6ff2a8';
      ctx.fillRect(building.door.x * SCALE, building.door.y * SCALE, SCALE, SCALE);
    }

    for (const target of ALL_WORLD_TARGETS) {
      if (!targetAvailable(view, target.id)) continue;
      ctx.fillStyle = KIND_COLOURS[target.kind] ?? '#7f9bb5';
      ctx.beginPath();
      ctx.arc(target.tileX * SCALE + SCALE / 2, target.tileY * SCALE + SCALE / 2, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    const px = playerTile.x * SCALE + SCALE / 2;
    const py = playerTile.y * SCALE + SCALE / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38e1e8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 5.5, 0, Math.PI * 2);
    ctx.stroke();
  }, [playerTile.x, playerTile.y, view]);

  const location = locationLabel(playerTile.x, playerTile.y);
  const nearest = ALL_WORLD_TARGETS.filter((target) => targetAvailable(view, target.id))
    .map((target) => ({
      target,
      distance: Math.hypot(
        target.tileX - playerTile.x,
        target.tileY - playerTile.y,
      ),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  return (
    <aside className="hud-card hud-minimap-card" aria-label="City map and navigation">
      <header className="hud-card-head">
        <span className="hud-pulse-dot" aria-hidden="true" />
        <div>
          <h2 className="hud-card-title">Aster ring map</h2>
          <p className="hud-card-subtitle mono">
            {location} · {playerTile.x},{playerTile.y}
          </p>
        </div>
      </header>
      <canvas
        ref={canvasRef}
        className="hud-minimap-canvas"
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={`Map of Aster. Player at ${location}.`}
      />
      <footer className="hud-card-footer mono hud-minimap-footer">
        <span>
          {nearest
            ? `Nearest: ${nearest.target.label} (${Math.round(nearest.distance)} tiles)`
            : 'No reachable target'}
        </span>
        <span className="hud-minimap-legend">
          <i style={{ background: KIND_COLOURS.evidence }} /> clue
          <i style={{ background: KIND_COLOURS.npc }} /> NPC
          <i style={{ background: KIND_COLOURS.decision }} /> decision
        </span>
      </footer>
    </aside>
  );
}

/** Exposed for tests: tile of the nearest available target, ignoring the player. */
export function nearestAvailableTarget(
  view: WorldView,
  tileX: number,
  tileY: number,
): { id: string; distance: number } | null {
  let best: { id: string; distance: number } | null = null;
  for (const target of ALL_WORLD_TARGETS) {
    if (!targetAvailable(view, target.id)) continue;
    const distance = Math.hypot(target.tileX - tileX, target.tileY - tileY);
    if (!best || distance < best.distance) best = { id: target.id, distance };
  }
  return best;
}

/** The current zone name, used by the HUD location chip. */
export function playerLocation(tileX: number, tileY: number): string {
  return locationLabel(tileX, tileY);
}

/** Tiles per map dimension, exported so the app and tests share one scale. */
export const MINIMAP_TILE_SCALE = SCALE;
export const MINIMAP_WORLD_TILE = TILE;
