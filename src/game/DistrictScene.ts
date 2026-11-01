import type * as PhaserTypes from 'phaser';
import {
  BUILDINGS,
  COMPANION_TARGET,
  CROSSWALKS,
  GRID_HEIGHT,
  GRID_WIDTH,
  INTERIOR_PROPS,
  ROAD_RECTS,
  ROOMS,
  SPAWN,
  STREET_LAMPS,
  TILE,
  VIEW_H,
  VIEW_W,
  WORLD_TARGETS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  cellAt,
  facadeTileFor,
  groundTileAt,
  zoneAt,
  type Point,
} from '../world/district.js';
import { ALL_VISIBLE_NPCS, COMPANION_NPC, type CityNpc } from '../content/cityNpcs.js';
import { findInteractionTarget } from '../world/interaction.js';
import {
  NEUTRAL_INPUT,
  createMovement,
  stepMovement,
  type MoveInput,
  type MovementState,
} from '../world/movement.js';
import { targetAvailable, type WorldView } from '../world/worldView.js';

export type PhaserModule = typeof import('phaser');

export type SfxName =
  | 'evidence-found'
  | 'choice-lock'
  | 'anchor-set'
  | 'ending-sting'
  | 'blink'
  | 'timeline-shift'
  | 'ui-click'
  | 'ui-open'
  | 'ui-confirm'
  | 'ui-error'
  | 'ui-memory-glitch';

export interface DistrictSceneOptions {
  readonly getView: () => WorldView;
  readonly isPaused: () => boolean;
  readonly getTouchInput: () => MoveInput;
  readonly onPrompt: (targetId: string | null) => void;
  readonly onInteract: (targetId: string) => void;
  readonly onReady: () => void;
  readonly onPlayerTile?: (tileX: number, tileY: number) => void;
}

export interface DistrictSceneApi {
  playSfx(name: SfxName): void;
  setMuted(muted: boolean): void;
  triggerBlinkWarp(): void;
  triggerTimelineShift(): void;
  triggerInvestigativePulse(): void;
  setQuality(quality: 'high' | 'low'): void;
  setTimeMode(mode: 'day' | 'night'): void;
}

interface LampGlowTracker {
  readonly image: PhaserTypes.GameObjects.Image;
  readonly baseAlpha: number;
  readonly phase: number;
  readonly isNeon: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
}

interface NpcSprite {
  readonly npc: CityNpc;
  readonly sprite: PhaserTypes.GameObjects.Sprite;
  readonly shadow: PhaserTypes.GameObjects.Ellipse;
}

const TILE_COLUMNS = 37;
const TILESET_KEY = 'tiles';
const GROUND_TEXTURE = 'district-ground';
const NIGHT_GRADE = 0xa3bbdc;
const BASE_SPRITES = ['cap', 'girl', 'kid', 'miner', 'oldwoman', 'sage', 'woman'] as const;

export function createDistrictScene(Phaser: PhaserModule, options: DistrictSceneOptions) {
  class DistrictScene extends Phaser.Scene implements DistrictSceneApi {
    private player: MovementState = createMovement(SPAWN);
    private playerSprite!: PhaserTypes.GameObjects.Sprite;
    private playerShadow!: PhaserTypes.GameObjects.Ellipse;
    private companionSprite!: PhaserTypes.GameObjects.Sprite;
    private companionShadow!: PhaserTypes.GameObjects.Ellipse;
    private companionPos: Point = { x: SPAWN.x - 18, y: SPAWN.y + 6 };

    private markers!: PhaserTypes.GameObjects.Graphics;
    private rainGraphics!: PhaserTypes.GameObjects.Graphics;
    private splashGraphics!: PhaserTypes.GameObjects.Graphics;
    private footstepGraphics!: PhaserTypes.GameObjects.Graphics;
    private blinkGraphics!: PhaserTypes.GameObjects.Graphics;
    private pulseGraphics!: PhaserTypes.GameObjects.Graphics;

    private lastPromptId: string | null = null;
    private lastTileKey = '';
    private reducedMotion = false;
    private quality: 'high' | 'low' = 'high';
    private muted = false;
    private gradeOverlay!: PhaserTypes.GameObjects.Rectangle;
    private ambienceStarted = false;
    private music: PhaserTypes.Sound.BaseSound | null = null;

    private lampGlows: LampGlowTracker[] = [];
    private mistRibbons: PhaserTypes.GameObjects.TileSprite[] = [];
    private rainDrops: Array<{ x: number; y: number; vx: number; vy: number; length: number; alpha: number }> = [];
    private particles: Particle[] = [];
    private npcSprites: NpcSprite[] = [];

    private stepTimer = 0;
    private warpFlashTimer = 0;
    private pulseTimer = 0;

    private keys: {
      up: PhaserTypes.Input.Keyboard.Key;
      down: PhaserTypes.Input.Keyboard.Key;
      left: PhaserTypes.Input.Keyboard.Key;
      right: PhaserTypes.Input.Keyboard.Key;
      interact: PhaserTypes.Input.Keyboard.Key;
      interactAlt: PhaserTypes.Input.Keyboard.Key;
    } | null = null;
    private cursors: PhaserTypes.Types.Input.Keyboard.CursorKeys | null = null;

    constructor() {
      super({ key: 'DistrictScene' });
    }

    preload(): void {
      this.load.spritesheet(TILESET_KEY, 'assets/environment/modern-city/tilemap.png', {
        frameWidth: TILE,
        frameHeight: TILE,
      });
      for (const base of BASE_SPRITES) {
        this.load.image(`${base}-1`, `assets/characters/${base}/1.png`);
        this.load.image(`${base}-2`, `assets/characters/${base}/2.png`);
      }
      for (const sfx of [
        'evidence-found',
        'choice-lock',
        'anchor-set',
        'ending-sting',
        'blink',
        'timeline-shift',
        'ui-click',
        'ui-open',
        'ui-confirm',
        'ui-error',
        'ui-memory-glitch',
      ]) {
        this.load.audio(sfx, `assets/audio/sfx/${sfx}.ogg`);
      }
      this.load.audio('district-night', 'assets/audio/music/district-night.ogg');
    }

    create(): void {
      this.reducedMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.cameras.main.setBackgroundColor('#070a0f');
      this.bakeGround();
      this.placeProps();
      this.placeStreetFurniture();
      this.placeSigns();

      this.gradeOverlay = this.add
        .rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, NIGHT_GRADE, 1)
        .setOrigin(0)
        .setBlendMode(Phaser.BlendModes.MULTIPLY)
        .setDepth(900);

      this.addLampGlow();
      this.addMistRibbons();

      this.footstepGraphics = this.add.graphics().setDepth(895);
      this.rainGraphics = this.add.graphics().setDepth(910);
      this.splashGraphics = this.add.graphics().setDepth(912);
      this.markers = this.add.graphics().setDepth(950);
      this.blinkGraphics = this.add.graphics().setDepth(955);
      this.pulseGraphics = this.add.graphics().setDepth(956);
      this.addVignette();

      this.playerShadow = this.add
        .ellipse(SPAWN.x, SPAWN.y - 1, 10, 4, 0x000000, 0.45)
        .setDepth(SPAWN.y - 1);
      this.playerSprite = this.add
        .sprite(SPAWN.x, SPAWN.y, 'cap-1')
        .setOrigin(0.5, 1)
        .setDepth(SPAWN.y);

      this.createAnimations();
      this.playerSprite.play('cap-idle');

      this.placeNpcs();
      this.placeCompanion();

      this.initRain();

      const keyboard = this.input.keyboard;
      if (keyboard) {
        this.cursors = keyboard.createCursorKeys();
        this.keys = keyboard.addKeys({
          up: Phaser.Input.Keyboard.KeyCodes.W,
          down: Phaser.Input.Keyboard.KeyCodes.S,
          left: Phaser.Input.Keyboard.KeyCodes.A,
          right: Phaser.Input.Keyboard.KeyCodes.D,
          interact: Phaser.Input.Keyboard.KeyCodes.E,
          interactAlt: Phaser.Input.Keyboard.KeyCodes.SPACE,
        }) as typeof this.keys;
        keyboard.once('keydown', () => this.startAmbience());
      }
      this.input.once('pointerdown', () => this.startAmbience());

      const camera = this.cameras.main;
      camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      camera.setDeadzone(48, 32);
      camera.setZoom(1.8);
      camera.startFollow(this.playerSprite, true, 0.12, 0.12);
      camera.fadeIn(this.reducedMotion ? 0 : 420, 7, 10, 15);

      this.emitPlayerTile();
      options.onReady();
    }

    override update(time: number, delta: number): void {
      const paused = options.isPaused();
      const input = paused ? NEUTRAL_INPUT : this.readInput();
      this.player = stepMovement(this.player, input, delta);

      const x = Math.round(this.player.x);
      const y = Math.round(this.player.y);
      const bob = !this.reducedMotion && this.player.moving && Math.floor(time / 130) % 2 === 1 ? -1 : 0;

      this.playerSprite.setPosition(x, y + bob);
      this.playerSprite.setDepth(y);
      this.playerSprite.setFlipX(this.player.facing === 'left');
      this.playerShadow.setPosition(x, y - 1).setDepth(y - 1);

      const wanted = this.player.moving ? 'cap-walk' : 'cap-idle';
      if (this.playerSprite.anims.currentAnim?.key !== wanted) this.playerSprite.play(wanted);

      this.followCompanion(delta);

      if (this.player.moving && this.quality === 'high' && !this.reducedMotion) {
        this.stepTimer += delta;
        if (this.stepTimer >= 220) {
          this.stepTimer = 0;
          this.particles.push({
            x: this.player.x,
            y: this.player.y - 1,
            vx: 0,
            vy: -6,
            life: 0,
            maxLife: 280,
            color: 0x76bfe4,
            size: 1,
          });
        }
      } else {
        this.stepTimer = 0;
      }

      this.updateLighting(time);
      this.updateMist(delta);
      this.updateRain(delta);
      this.updateParticles(delta);
      this.updatePulse(delta);

      const view = options.getView();
      const targets = [
        ...WORLD_TARGETS,
        {
          ...COMPANION_TARGET,
          x: this.companionPos.x,
          y: this.companionPos.y,
          tileX: Math.floor(this.companionPos.x / TILE),
          tileY: Math.floor(this.companionPos.y / TILE),
        },
      ];
      const target = findInteractionTarget(this.player, targets, (candidate) =>
        targetAvailable(view, candidate.id),
      );
      const nextPromptId = target?.id ?? null;
      if (nextPromptId !== this.lastPromptId) {
        this.lastPromptId = nextPromptId;
        options.onPrompt(nextPromptId);
      }

      this.drawMarkers(view, time);
      this.emitPlayerTile();

      if (
        !paused &&
        target &&
        this.keys &&
        (Phaser.Input.Keyboard.JustDown(this.keys.interact) ||
          Phaser.Input.Keyboard.JustDown(this.keys.interactAlt))
      ) {
        this.startAmbience();
        options.onInteract(target.id);
      }
    }

    playSfx(name: SfxName): void {
      if (this.muted || !this.cache.audio.exists(name)) return;
      this.sound.play(name, { volume: name === 'ui-click' ? 0.35 : 0.5 });
    }

    setMuted(muted: boolean): void {
      this.muted = muted;
      this.sound.mute = muted;
    }

    setQuality(quality: 'high' | 'low'): void {
      this.quality = quality;
      for (const mist of this.mistRibbons) mist.setVisible(quality === 'high' && !this.reducedMotion);
      if (quality === 'low') {
        this.rainGraphics.clear();
        this.splashGraphics.clear();
        this.footstepGraphics.clear();
      }
    }

    triggerBlinkWarp(): void {
      if (!this.reducedMotion) {
        this.cameras.main.flash(260, 56, 225, 232, true);
        this.cameras.main.shake(300, 0.007);
      }
      this.playSfx('blink');
      this.playSfx('ui-memory-glitch');
      this.warpFlashTimer = 340;
      const count = this.reducedMotion ? 8 : 22;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const speed = 40 + Math.random() * 120;
        this.particles.push({
          x: this.player.x,
          y: this.player.y - 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 320 + Math.random() * 160,
          color: i % 2 === 0 ? 0x38e1e8 : 0xff5cc8,
          size: Math.random() > 0.5 ? 2 : 1,
        });
      }
    }

    triggerTimelineShift(): void {
      if (!this.reducedMotion) {
        this.cameras.main.fade(140, 7, 10, 15, false, (_cam: unknown, progress: unknown) => {
          if (typeof progress === 'number' && progress >= 1) {
            this.cameras.main.fadeIn(180, 7, 10, 15);
          }
        });
      }
      this.playSfx('timeline-shift');
    }

    triggerInvestigativePulse(): void {
      this.playSfx('ui-memory-glitch');
      this.pulseTimer = 600;
      for (let i = 0; i < 18; i += 1) {
        const angle = (i / 18) * Math.PI * 2;
        this.particles.push({
          x: this.player.x,
          y: this.player.y - 8,
          vx: Math.cos(angle) * 160,
          vy: Math.sin(angle) * 160,
          life: 0,
          maxLife: 400,
          color: 0x38e1e8,
          size: 2,
        });
      }
    }

    private readInput(): MoveInput {
      const touch = options.getTouchInput();
      const cursors = this.cursors;
      const keys = this.keys;
      return {
        up: touch.up || Boolean(cursors?.up.isDown) || Boolean(keys?.up.isDown),
        down: touch.down || Boolean(cursors?.down.isDown) || Boolean(keys?.down.isDown),
        left: touch.left || Boolean(cursors?.left.isDown) || Boolean(keys?.left.isDown),
        right: touch.right || Boolean(cursors?.right.isDown) || Boolean(keys?.right.isDown),
      };
    }

    private startAmbience(): void {
      if (this.ambienceStarted) return;
      this.ambienceStarted = true;
      if (!this.cache.audio.exists('district-night')) return;
      this.music = this.sound.add('district-night', { loop: true, volume: 0.16 });
      this.music.play();
    }

    private emitPlayerTile(): void {
      const tileX = Math.floor(this.player.x / TILE);
      const tileY = Math.floor(this.player.y / TILE);
      const key = `${tileX},${tileY}`;
      if (key === this.lastTileKey) return;
      this.lastTileKey = key;
      options.onPlayerTile?.(tileX, tileY);
    }

    private bakeGround(): void {
      if (this.textures.exists(GROUND_TEXTURE)) {
        this.add.image(0, 0, GROUND_TEXTURE).setOrigin(0).setDepth(-1000);
        return;
      }
      const source = this.textures.get(TILESET_KEY).getSourceImage();
      if (!(source instanceof HTMLImageElement)) return;

      const texture = this.textures.createCanvas(GROUND_TEXTURE, WORLD_WIDTH, WORLD_HEIGHT);
      if (!texture) return;
      const ctx = texture.context;
      ctx.imageSmoothingEnabled = false;

      const drawTile = (index: number, x: number, y: number): void => {
        const sx = (index % TILE_COLUMNS) * TILE;
        const sy = Math.floor(index / TILE_COLUMNS) * TILE;
        ctx.drawImage(source, sx, sy, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      };

      for (let y = 0; y < GRID_HEIGHT; y += 1) {
        for (let x = 0; x < GRID_WIDTH; x += 1) {
          const cell = cellAt(x, y);
          const index =
            cell === '#' && this.isFacadeRow(x, y) ? facadeTileFor(x, y) : groundTileAt(x, y);
          drawTile(index, x, y);
        }
      }

      this.paintStreet(ctx);
      texture.refresh();
      this.add.image(0, 0, GROUND_TEXTURE).setOrigin(0).setDepth(-1000);
    }

    private isFacadeRow(x: number, y: number): boolean {
      const below = cellAt(x, y + 1);
      return below === '.' || below === '+' || below === ',' || below === '_';
    }

    /** Street wear, crossings and kerbs drawn from the authored road rects. */
    private paintStreet(ctx: CanvasRenderingContext2D): void {
      for (const road of ROAD_RECTS) {
        if (road.width > road.height) {
          ctx.fillStyle = 'rgba(3, 6, 11, 0.45)';
          ctx.fillRect(road.x * TILE, road.y * TILE, road.width * TILE, road.height * TILE);
          const mid = road.y * TILE + (road.height * TILE) / 2;
          ctx.fillStyle = 'rgba(196, 156, 62, 0.55)';
          ctx.fillRect(road.x * TILE, mid - 1, road.width * TILE, 2);
        } else {
          ctx.fillStyle = 'rgba(3, 6, 11, 0.45)';
          ctx.fillRect(road.x * TILE, road.y * TILE, road.width * TILE, road.height * TILE);
          const mid = road.x * TILE + (road.width * TILE) / 2;
          ctx.fillStyle = 'rgba(196, 156, 62, 0.5)';
          ctx.fillRect(mid - 1, road.y * TILE, 2, road.height * TILE);
        }
      }

      for (const crossing of CROSSWALKS) {
        ctx.fillStyle = 'rgba(233, 240, 247, 0.55)';
        if (crossing.width > crossing.height) {
          for (let x = crossing.x * TILE + 3; x < (crossing.x + crossing.width) * TILE - 3; x += 9) {
            ctx.fillRect(x, crossing.y * TILE + 3, 5, crossing.height * TILE - 6);
          }
        } else {
          for (let y = crossing.y * TILE + 3; y < (crossing.y + crossing.height) * TILE - 3; y += 9) {
            ctx.fillRect(crossing.x * TILE + 3, y, crossing.width * TILE - 6, 5);
          }
        }
      }

      // Wet pavement highlights along the ring.
      ctx.fillStyle = 'rgba(148, 190, 220, 0.10)';
      for (const road of ROAD_RECTS) {
        ctx.fillRect(road.x * TILE, road.y * TILE, road.width * TILE, 2);
        ctx.fillRect(road.x * TILE, (road.y + road.height) * TILE - 2, road.width * TILE, 2);
      }
    }

    private placeProps(): void {
      for (const prop of INTERIOR_PROPS) {
        const sprite = this.add
          .image(prop.x * TILE + 8, prop.y * TILE + 16, TILESET_KEY, prop.tile)
          .setOrigin(0.5, 1)
          .setDepth(prop.y * TILE + 16);
        if (prop.tint !== undefined) sprite.setTint(prop.tint);
        if (prop.scale !== undefined) sprite.setScale(prop.scale);
      }
    }

    private placeStreetFurniture(): void {
      // Street lamps are visual props; their light is added separately.
      for (const lamp of STREET_LAMPS) {
        this.add
          .image(lamp.x * TILE + 8, lamp.y * TILE + 8, TILESET_KEY, 633)
          .setOrigin(0.5, 1)
          .setDepth(lamp.y * TILE + 8)
          .setTint(0xd8e4ee);
      }
    }

    private placeSigns(): void {
      for (const building of BUILDINGS) {
        const x = (building.rect.x + building.rect.width / 2) * TILE;
        const y = (building.rect.y + building.rect.height - 1) * TILE;
        const text = this.add
          .text(x, y, building.sign, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: building.accent,
            backgroundColor: '#060a10',
            padding: { x: 5, y: 2 },
          })
          .setOrigin(0.5, 1)
          .setDepth(y + 1)
          .setAlpha(0.95);
        text.setResolution(2);
      }
    }

    private placeNpcs(): void {
      for (const npc of ALL_VISIBLE_NPCS) {
        if (npc.followsPlayer) continue;
        const x = npc.tileX * TILE + 8;
        const y = npc.tileY * TILE + 8;
        const shadow = this.add
          .ellipse(x, y - 1, 10, 4, 0x000000, 0.45)
          .setDepth(y - 1);
        const sprite = this.add
          .sprite(x, y, `${npc.spriteBase}-1`)
          .setOrigin(0.5, 1)
          .setDepth(y)
          .setTint(npc.tint);
        sprite.play(`${npc.spriteBase}-idle`);
        this.npcSprites.push({ npc, sprite, shadow });
      }
    }

    private placeCompanion(): void {
      this.companionPos = { x: SPAWN.x - 18, y: SPAWN.y + 6 };
      this.companionShadow = this.add
        .ellipse(this.companionPos.x, this.companionPos.y - 1, 9, 4, 0x000000, 0.4)
        .setDepth(this.companionPos.y - 1);
      this.createMothTexture();
      this.companionSprite = this.add
        .sprite(this.companionPos.x, this.companionPos.y, 'moth-drone')
        .setOrigin(0.5, 1)
        .setDepth(this.companionPos.y)
        .setScale(0.8);
    }

    private followCompanion(delta: number): void {
      const targetX = this.player.x - 16 * (this.player.facing === 'left' ? -1 : 1);
      const targetY = this.player.y + 6;
      const lerp = Math.min(1, delta / 240);
      this.companionPos = {
        x: this.companionPos.x + (targetX - this.companionPos.x) * lerp,
        y: this.companionPos.y + (targetY - this.companionPos.y) * lerp,
      };
      const bob =
        !this.reducedMotion && this.player.moving && Math.floor(this.game.loop.time / 180) % 2 === 1
          ? -2
          : 0;
      const x = Math.round(this.companionPos.x);
      const y = Math.round(this.companionPos.y);
      this.companionSprite.setPosition(x, y + bob);
      this.companionSprite.setDepth(y);
      this.companionShadow.setPosition(x, y - 1).setDepth(y - 1);
      this.companionSprite.setAngle(Math.sin(this.game.loop.time * 0.004) * 3);
    }

    setTimeMode(mode: 'day' | 'night'): void {
      this.gradeOverlay?.setFillStyle(mode === 'day' ? 0xfff1d0 : NIGHT_GRADE, mode === 'day' ? 0.22 : 1);
      for (const tracker of this.lampGlows) {
        tracker.image.setAlpha(mode === 'day' ? tracker.baseAlpha * 0.25 : tracker.baseAlpha);
      }
      this.cameras.main.setBackgroundColor(mode === 'day' ? '#c8d6dc' : '#070a0f');
      this.gradeOverlay?.setAlpha(mode === 'day' ? 0.32 : 1);
    }

    private createMothTexture(): void {
      const key = 'moth-drone';
      if (this.textures.exists(key)) return;
      const texture = this.textures.createCanvas(key, 24, 18);
      if (!texture) return;
      const ctx = texture.context;
      ctx.clearRect(0, 0, 24, 18);
      ctx.fillStyle = '#102531';
      ctx.beginPath();
      ctx.ellipse(12, 9, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4ff3ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#b9ffff';
      ctx.fillRect(10, 7, 4, 3);
      ctx.fillStyle = '#4ff3ff';
      ctx.fillRect(3, 8, 4, 2);
      ctx.fillRect(17, 8, 4, 2);
      ctx.fillStyle = '#ffbf68';
      ctx.fillRect(11, 13, 2, 2);
      texture.refresh();
    }

    private radialTexture(key: string, size: number): void {
      if (this.textures.exists(key)) return;
      const texture = this.textures.createCanvas(key, size, size);
      if (!texture) return;
      const ctx = texture.context;
      const radius = size / 2;
      const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)');
      gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.16)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      texture.refresh();
    }

    private addLampGlow(): void {
      this.radialTexture('lamp-glow', 128);
      this.lampGlows = [];
      const lightDefs = [
        ...STREET_LAMPS.map((lamp) => ({ ...lamp, alpha: 0.55, neon: lamp.color !== 0xffb24d })),
        ...ROOMS.flatMap((room) =>
          room.lights.map((light) => ({ ...light, alpha: 0.7, neon: light.color !== 0xffb24d })),
        ),
      ];

      lightDefs.forEach((light, i) => {
        const img = this.add
          .image(light.x * TILE + 8, light.y * TILE + 8, 'lamp-glow')
          .setDisplaySize(light.size, light.size * 0.74)
          .setTint(light.color)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(light.alpha)
          .setDepth(901);
        this.lampGlows.push({
          image: img,
          baseAlpha: light.alpha,
          phase: i * 1.35,
          isNeon: light.neon,
        });
      });
    }

    private addMistRibbons(): void {
      const mistKey = 'district-mist';
      if (!this.textures.exists(mistKey)) {
        const texture = this.textures.createCanvas(mistKey, 256, 40);
        if (texture) {
          const ctx = texture.context;
          const grad = ctx.createLinearGradient(0, 0, 0, 40);
          grad.addColorStop(0, 'rgba(140, 185, 220, 0)');
          grad.addColorStop(0.5, 'rgba(140, 185, 220, 0.22)');
          grad.addColorStop(1, 'rgba(140, 185, 220, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 256, 40);
          texture.refresh();
        }
      }

      this.mistRibbons = [
        this.add
          .tileSprite(0, 15 * TILE, WORLD_WIDTH, 36, mistKey)
          .setOrigin(0, 0.5)
          .setAlpha(0.1)
          .setDepth(903)
          .setBlendMode(Phaser.BlendModes.ADD),
        this.add
          .tileSprite(0, 52 * TILE, WORLD_WIDTH, 44, mistKey)
          .setOrigin(0, 0.5)
          .setAlpha(0.08)
          .setDepth(904)
          .setBlendMode(Phaser.BlendModes.ADD),
      ];
    }

    private addVignette(): void {
      const key = 'district-vignette';
      if (!this.textures.exists(key)) {
        const texture = this.textures.createCanvas(key, VIEW_W, VIEW_H);
        if (texture) {
          const ctx = texture.context;
          const gradient = ctx.createRadialGradient(
            VIEW_W / 2,
            VIEW_H / 2,
            VIEW_H * 0.32,
            VIEW_W / 2,
            VIEW_H / 2,
            VIEW_W * 0.68,
          );
          gradient.addColorStop(0, 'rgba(4, 7, 11, 0)');
          gradient.addColorStop(0.58, 'rgba(4, 7, 11, 0.15)');
          gradient.addColorStop(1, 'rgba(4, 7, 11, 0.58)');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, VIEW_W, VIEW_H);
          texture.refresh();
        }
      }
      if (!this.textures.exists(key)) return;
      this.add.image(0, 0, key).setOrigin(0).setScrollFactor(0).setDepth(960);
    }

    private initRain(): void {
      this.rainDrops = [];
      for (let i = 0; i < 64; i += 1) {
        this.rainDrops.push({
          x: Math.random() * WORLD_WIDTH,
          y: Math.random() * WORLD_HEIGHT,
          vx: -22 - Math.random() * 14,
          vy: 240 + Math.random() * 60,
          length: 6 + Math.random() * 5,
          alpha: 0.22 + Math.random() * 0.3,
        });
      }
    }

    private updateLighting(time: number): void {
      if (this.quality === 'low' || this.reducedMotion) return;
      for (const tracker of this.lampGlows) {
        if (tracker.isNeon) {
          const flicker = Math.sin(time * 0.007 + tracker.phase) * 0.12;
          const jitter = Math.sin(time * 0.023 + tracker.phase) > 0.96 ? -0.15 : 0;
          tracker.image.setAlpha(Math.max(0.2, tracker.baseAlpha + flicker + jitter));
        } else {
          tracker.image.setAlpha(tracker.baseAlpha + Math.sin(time * 0.0024 + tracker.phase) * 0.06);
        }
      }
    }

    private updateMist(delta: number): void {
      if (this.quality === 'low' || this.reducedMotion) return;
      if (this.mistRibbons[0]) this.mistRibbons[0].tilePositionX += delta * 0.012;
      if (this.mistRibbons[1]) this.mistRibbons[1].tilePositionX -= delta * 0.018;
    }

    private updateRain(delta: number): void {
      if (this.quality === 'low' || this.reducedMotion) {
        this.rainGraphics.clear();
        this.splashGraphics.clear();
        return;
      }
      this.rainGraphics.clear();
      const dt = delta / 1000;
      const cam = this.cameras.main;
      const minX = cam.scrollX - 60;
      const maxX = cam.scrollX + VIEW_W + 60;
      const minY = cam.scrollY - 60;
      const maxY = cam.scrollY + VIEW_H + 60;
      for (const drop of this.rainDrops) {
        drop.x += drop.vx * dt;
        drop.y += drop.vy * dt;
        if (drop.y > maxY || drop.x < minX) {
          drop.x = minX + Math.random() * (maxX - minX + 40);
          drop.y = minY - Math.random() * 20;
        }
        this.rainGraphics.lineStyle(1, 0xaad4f5, drop.alpha);
        this.rainGraphics.lineBetween(drop.x, drop.y, drop.x + drop.vx * 0.022, drop.y + drop.length);
      }
      this.splashGraphics.clear();
    }

    private updateParticles(delta: number): void {
      this.footstepGraphics.clear();
      this.blinkGraphics.clear();
      if (this.warpFlashTimer > 0) {
        this.warpFlashTimer -= delta;
        const progress = Math.max(0, this.warpFlashTimer / 340);
        const cam = this.cameras.main;
        this.blinkGraphics.lineStyle(2, 0x38e1e8, progress * 0.85);
        const y1 = cam.scrollY + (1 - progress) * VIEW_H;
        const y2 = cam.scrollY + progress * VIEW_H;
        this.blinkGraphics.lineBetween(cam.scrollX, y1, cam.scrollX + VIEW_W, y1);
        this.blinkGraphics.lineBetween(cam.scrollX, y2, cam.scrollX + VIEW_W, y2);
      }
      for (let i = this.particles.length - 1; i >= 0; i -= 1) {
        const p = this.particles[i]!;
        p.life += delta;
        if (p.life >= p.maxLife) {
          this.particles.splice(i, 1);
          continue;
        }
        const dt = delta / 1000;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        const alpha = (1 - p.life / p.maxLife) * 0.8;
        if (p.maxLife === 280) {
          this.footstepGraphics.lineStyle(1, 0x76bfe4, alpha * 0.45);
          this.footstepGraphics.strokeEllipse(p.x, p.y, 8, 3);
        } else {
          this.blinkGraphics.fillStyle(p.color, alpha);
          this.blinkGraphics.fillCircle(p.x, p.y, p.size);
        }
      }
    }

    private updatePulse(delta: number): void {
      this.pulseGraphics.clear();
      if (this.pulseTimer <= 0) return;
      this.pulseTimer -= delta;
      const progress = 1 - Math.max(0, this.pulseTimer / 600);
      const radius = progress * 240;
      const alpha = (1 - progress) * 0.8;
      this.pulseGraphics.lineStyle(2, 0x38e1e8, alpha);
      this.pulseGraphics.strokeCircle(this.player.x, this.player.y - 8, radius);
      if (radius > 20) {
        this.pulseGraphics.lineStyle(1, 0xff5cc8, alpha * 0.6);
        this.pulseGraphics.strokeCircle(this.player.x, this.player.y - 8, radius * 0.7);
      }
    }

    private drawMarkers(view: WorldView, time: number): void {
      const graphics = this.markers;
      graphics.clear();
      const pulse = this.reducedMotion ? 0.85 : 0.55 + Math.sin(time / 440) * 0.35;

      for (const target of WORLD_TARGETS) {
        if (!targetAvailable(view, target.id)) continue;
        const isPrompted = this.lastPromptId === target.id;
        const alpha = isPrompted ? 1 : pulse;
        const cx = target.x;
        const cy = target.y;

        if (target.kind === 'evidence') {
          const item = view.evidence.find((candidate) => candidate.evidenceId === target.id);
          const collected = item ? item.collected : false;
          graphics.lineStyle(1, collected ? 0x5a6e82 : 0xffb24d, alpha);
          const dSize = isPrompted ? 5 : 3.5;
          graphics.beginPath();
          graphics.moveTo(cx, cy - dSize);
          graphics.lineTo(cx + dSize, cy);
          graphics.lineTo(cx, cy + dSize);
          graphics.lineTo(cx - dSize, cy);
          graphics.closePath();
          graphics.strokePath();
        } else if (target.kind === 'anchor') {
          graphics.lineStyle(1, 0x38e1e8, alpha);
          graphics.strokeCircle(cx, cy, 9);
          graphics.strokeCircle(cx, cy, 5);
        } else if (target.kind === 'decision') {
          graphics.lineStyle(1, 0xff7a4d, alpha);
          graphics.strokeRect(cx - 6, cy - 6, 12, 12);
          graphics.lineBetween(cx - 3, cy, cx + 3, cy);
          graphics.lineBetween(cx, cy - 3, cx, cy + 3);
        } else if (target.kind === 'puzzle') {
          graphics.lineStyle(1, 0xb59bff, alpha);
          graphics.strokeCircle(cx, cy, 8);
          graphics.strokeRect(cx - 4, cy - 4, 8, 8);
        } else {
          graphics.lineStyle(1, 0x5ccfe6, alpha);
          graphics.strokeEllipse(cx, cy + 6, 16, 7);
          if (Phaser.Math.Distance.Between(this.player.x, this.player.y, cx, cy) < 48) {
            const bubbleY = cy - 18;
            graphics.fillStyle(0x070a0f, 0.75);
            graphics.fillRoundedRect(cx - 8, bubbleY - 4, 16, 8, 3);
            graphics.lineStyle(1, 0x5ccfe6, 0.8);
            graphics.strokeRoundedRect(cx - 8, bubbleY - 4, 16, 8, 3);
          }
        }

        if (isPrompted) {
          graphics.lineStyle(1.5, 0xffffff, Math.max(0.4, alpha * 0.8));
          graphics.strokeCircle(cx, cy, 12);
        }
      }

      // Companion ring.
      graphics.lineStyle(1, COMPANION_NPC.tint, 0.55);
      graphics.strokeCircle(this.companionPos.x, this.companionPos.y + 4, 10);
    }

    private createAnimations(): void {
      for (const base of BASE_SPRITES) {
        for (const [suffix, frameRate] of [
          ['walk', 8],
          ['idle', 2],
        ] as const) {
          const key = `${base}-${suffix}`;
          if (this.anims.exists(key)) continue;
          this.anims.create({
            key,
            frames: [{ key: `${base}-1` }, { key: `${base}-2` }],
            frameRate,
            repeat: -1,
          });
        }
      }
    }
  }

  return DistrictScene;
}

/** Shared by the DOM minimap and tests. */
export function zoneLabelAt(x: number, y: number): string {
  const tileX = Math.floor(x / TILE);
  const tileY = Math.floor(y / TILE);
  const zone = zoneAt(tileX, tileY);
  if (zone) return zone.name;
  const room = ROOMS.find(
    (candidate) =>
      tileX >= candidate.x &&
      tileY >= candidate.y &&
      tileX < candidate.x + candidate.width &&
      tileY < candidate.y + candidate.height,
  );
  return room?.name ?? 'Aster ring road';
}
