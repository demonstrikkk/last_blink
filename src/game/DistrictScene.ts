import type * as PhaserTypes from 'phaser';
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  SPAWN,
  TILE,
  VIEW_H,
  VIEW_W,
  WORLD_HEIGHT,
  WORLD_TARGETS,
  WORLD_WIDTH,
  cellAt,
  facadeTileFor,
  groundTileFor,
  propTileFor,
} from '../world/district.js';
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
}

export interface DistrictSceneApi {
  playSfx(name: SfxName): void;
  setMuted(muted: boolean): void;
  triggerBlinkWarp(): void;
  triggerTimelineShift(): void;
  triggerInvestigativePulse(): void;
  setQuality(quality: 'high' | 'low'): void;
}

interface LampGlowTracker {
  readonly image: PhaserTypes.GameObjects.Image;
  readonly baseAlpha: number;
  readonly baseScaleX: number;
  readonly baseScaleY: number;
  readonly phase: number;
  readonly isNeon: boolean;
}

interface RainDrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  alpha: number;
}

interface RainSplash {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  maxRadius: number;
}

interface FootstepRipple {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

interface BlinkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
}

const TILE_COLUMNS = 37;
const TILESET_KEY = 'tiles';
const GROUND_TEXTURE = 'district-ground';
const NIGHT_GRADE = 0xa3bbdc;

export function createDistrictScene(Phaser: PhaserModule, options: DistrictSceneOptions) {
  class DistrictScene extends Phaser.Scene implements DistrictSceneApi {
    private player: MovementState = createMovement(SPAWN);
    private playerSprite!: PhaserTypes.GameObjects.Sprite;
    private playerShadow!: PhaserTypes.GameObjects.Ellipse;
    private sableSprite!: PhaserTypes.GameObjects.Sprite;
    private ivoSprite!: PhaserTypes.GameObjects.Sprite;
    private lyraSprite!: PhaserTypes.GameObjects.Sprite;
    private vaneSprite!: PhaserTypes.GameObjects.Sprite;
    private castorSprite!: PhaserTypes.GameObjects.Sprite;
    private markers!: PhaserTypes.GameObjects.Graphics;
    private rainGraphics!: PhaserTypes.GameObjects.Graphics;
    private splashGraphics!: PhaserTypes.GameObjects.Graphics;
    private footstepGraphics!: PhaserTypes.GameObjects.Graphics;
    private blinkGraphics!: PhaserTypes.GameObjects.Graphics;
    private pulseGraphics!: PhaserTypes.GameObjects.Graphics;

    private lastPromptId: string | null = null;
    private reducedMotion = false;
    private quality: 'high' | 'low' = 'high';
    private muted = false;
    private ambienceStarted = false;
    private music: PhaserTypes.Sound.BaseSound | null = null;

    private lampGlows: LampGlowTracker[] = [];
    private mistRibbons: PhaserTypes.GameObjects.TileSprite[] = [];
    private rainDrops: RainDrop[] = [];
    private activeSplashes: RainSplash[] = [];
    private footstepRipples: FootstepRipple[] = [];
    private blinkParticles: BlinkParticle[] = [];

    private stepTimer = 0;
    private warpFlashTimer = 0;
    private pulseTimer = 0;
    private pulseRadius = 0;

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
      this.load.image('rin-1', 'assets/characters/cap/1.png');
      this.load.image('rin-2', 'assets/characters/cap/2.png');
      this.load.image('sable-1', 'assets/characters/oldwoman/1.png');
      this.load.image('sable-2', 'assets/characters/oldwoman/2.png');
      this.load.image('ivo-1', 'assets/characters/sage/1.png');
      this.load.image('ivo-2', 'assets/characters/sage/2.png');
      this.load.image('lyra-1', 'assets/characters/girl/1.png');
      this.load.image('lyra-2', 'assets/characters/girl/2.png');
      this.load.image('vane-1', 'assets/characters/woman/1.png');
      this.load.image('vane-2', 'assets/characters/woman/2.png');
      this.load.image('castor-1', 'assets/characters/miner/1.png');
      this.load.image('castor-2', 'assets/characters/miner/2.png');

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

      // Atmospheric night grade overlay
      this.add
        .rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, NIGHT_GRADE, 1)
        .setOrigin(0)
        .setBlendMode(Phaser.BlendModes.MULTIPLY)
        .setDepth(900);

      this.addLampGlow();
      this.addMistRibbons();

      // Graphics layers
      this.footstepGraphics = this.add.graphics().setDepth(895);
      this.rainGraphics = this.add.graphics().setDepth(910);
      this.splashGraphics = this.add.graphics().setDepth(912);
      this.markers = this.add.graphics().setDepth(950);
      this.blinkGraphics = this.add.graphics().setDepth(955);
      this.pulseGraphics = this.add.graphics().setDepth(956);
      this.addVignette();

      // Characters
      this.playerShadow = this.add
        .ellipse(SPAWN.x, SPAWN.y - 1, 10, 4, 0x000000, 0.45)
        .setDepth(SPAWN.y - 1);

      this.playerSprite = this.add
        .sprite(SPAWN.x, SPAWN.y, 'rin-1')
        .setOrigin(0.5, 1)
        .setDepth(SPAWN.y);

      // Sable (Central Relay Street)
      this.sableSprite = this.add
        .sprite(30 * TILE + 8, 16 * TILE + 16, 'sable-1')
        .setOrigin(0.5, 1)
        .setDepth(16 * TILE + 16);
      this.add.ellipse(30 * TILE + 8, 16 * TILE + 15, 10, 4, 0x000000, 0.45).setDepth(16 * TILE + 15);

      // Ivo (Central Relay Street)
      this.ivoSprite = this.add
        .sprite(37 * TILE + 8, 16 * TILE + 16, 'ivo-1')
        .setOrigin(0.5, 1)
        .setDepth(16 * TILE + 16);
      this.add.ellipse(37 * TILE + 8, 16 * TILE + 15, 10, 4, 0x000000, 0.45).setDepth(16 * TILE + 15);

      // Lyra (East Commercial Plaza - Nocturne Diner)
      this.lyraSprite = this.add
        .sprite(68 * TILE + 8, 16 * TILE + 16, 'lyra-1')
        .setOrigin(0.5, 1)
        .setDepth(16 * TILE + 16);
      this.add.ellipse(68 * TILE + 8, 16 * TILE + 15, 10, 4, 0x000000, 0.45).setDepth(16 * TILE + 15);

      // Courier Vane (South District Freight Yard)
      this.vaneSprite = this.add
        .sprite(42 * TILE + 8, 34 * TILE + 16, 'vane-1')
        .setOrigin(0.5, 1)
        .setDepth(34 * TILE + 16);
      this.add.ellipse(42 * TILE + 8, 34 * TILE + 15, 10, 4, 0x000000, 0.45).setDepth(34 * TILE + 15);

      // Enforcer Castor (South District Gate Depot)
      this.castorSprite = this.add
        .sprite(78 * TILE + 8, 34 * TILE + 16, 'castor-1')
        .setOrigin(0.5, 1)
        .setDepth(34 * TILE + 16);
      this.add.ellipse(78 * TILE + 8, 34 * TILE + 15, 10, 4, 0x000000, 0.45).setDepth(34 * TILE + 15);

      this.createAnimations();
      this.playerSprite.play('rin-idle');
      this.sableSprite.play('sable-idle');
      this.ivoSprite.play('ivo-idle');
      this.lyraSprite.play('lyra-idle');
      this.vaneSprite.play('vane-idle');
      this.castorSprite.play('castor-idle');

      // Initialize rain particles
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

      const camera = this.cameras.main;
      camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      camera.setDeadzone(48, 32);
      camera.setZoom(2.1); // Crisp pixel-art scale filling the screen like the target RPG visual
      camera.startFollow(this.playerSprite, true, 0.12, 0.12);
      camera.fadeIn(this.reducedMotion ? 0 : 420, 7, 10, 15);

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

      const walkKey = 'rin-walk';
      const idleKey = 'rin-idle';
      const wanted = this.player.moving ? walkKey : idleKey;
      if (this.playerSprite.anims.currentAnim?.key !== wanted) {
        this.playerSprite.play(wanted);
      }

      // Footstep wet ripples on the asphalt
      if (this.player.moving && this.quality === 'high' && !this.reducedMotion) {
        this.stepTimer += delta;
        if (this.stepTimer >= 220) {
          this.stepTimer = 0;
          this.footstepRipples.push({
            x: this.player.x,
            y: this.player.y - 1,
            age: 0,
            maxAge: 280,
          });
        }
      } else {
        this.stepTimer = 0;
      }
      this.updateFootstepRipples(delta);

      // Dynamic lighting breathing & neon pulse
      this.updateLighting(time);

      // Atmospheric mist drift
      this.updateMist(delta);

      // Rain and splashes
      this.updateRain(delta);

      // BLINK warp particles & scanline distortions
      this.updateBlinkEffects(delta);

      // Investigative Pulse Wave
      this.updatePulse(delta);

      const view = options.getView();
      const target = findInteractionTarget(this.player, WORLD_TARGETS, (candidate) =>
        targetAvailable(view, candidate.id),
      );
      const nextPromptId = target?.id ?? null;
      if (nextPromptId !== this.lastPromptId) {
        this.lastPromptId = nextPromptId;
        options.onPrompt(nextPromptId);
      }

      this.drawMarkers(view, time);

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
      for (const mist of this.mistRibbons) {
        mist.setVisible(quality === 'high' && !this.reducedMotion);
      }
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

      // Spawn radial temporal particle burst from player
      const count = this.reducedMotion ? 8 : 22;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const speed = 40 + Math.random() * 120;
        this.blinkParticles.push({
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
      this.pulseRadius = 0;

      // Burst investigation scanline glitch particles
      const count = 18;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;
        this.blinkParticles.push({
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
          const isFacade = y === 3 || y === 17 || y === 24 || y === 38;
          const index = isFacade ? facadeTileFor(x, y) : groundTileFor(cell, x, y);
          drawTile(index, x, y);
        }
      }

      this.paintStreet(ctx);
      texture.refresh();
      this.add.image(0, 0, GROUND_TEXTURE).setOrigin(0).setDepth(-1000);
    }

    /**
     * Kerbs, lane paint, crossings, wear, wet asphalt reflections, puddles,
     * and glowing neon storefront signs baked into the world canvas.
     */
    private paintStreet(ctx: CanvasRenderingContext2D): void {
      const roadTop = 7 * TILE;
      const roadBottom = 14 * TILE;
      const roadMid = 10 * TILE + 8;

      // 1. North Main Thoroughfare (Central Relay Street + East Commercial Plaza)
      ctx.fillStyle = 'rgba(3, 6, 11, 0.48)';
      ctx.fillRect(0, roadTop, WORLD_WIDTH, roadBottom - roadTop);

      // Building shadows falling onto the near pavement
      ctx.fillStyle = 'rgba(4, 7, 11, 0.52)';
      ctx.fillRect(0, 4 * TILE, WORLD_WIDTH, 6);
      ctx.fillRect(0, 17 * TILE - 6, WORLD_WIDTH, 6);

      // Kerb faces
      ctx.fillStyle = '#0d131a';
      ctx.fillRect(0, roadTop - 3, WORLD_WIDTH, 3);
      ctx.fillRect(0, roadBottom, WORLD_WIDTH, 3);
      ctx.fillStyle = 'rgba(148, 172, 194, 0.5)';
      ctx.fillRect(0, roadTop - 4, WORLD_WIDTH, 1);
      ctx.fillRect(0, roadBottom + 3, WORLD_WIDTH, 1);

      // Central Relay crosswalk
      const crossingLeft = 18 * TILE;
      const crossingRight = 22 * TILE;
      ctx.fillStyle = 'rgba(233, 240, 247, 0.7)';
      for (let x = crossingLeft + 3; x < crossingRight - 3; x += 9) {
        ctx.fillRect(x, roadTop + 5, 5, roadBottom - roadTop - 10);
      }

      // East Plaza crosswalk
      const plazaCrossLeft = 64 * TILE;
      const plazaCrossRight = 68 * TILE;
      for (let x = plazaCrossLeft + 3; x < plazaCrossRight - 3; x += 9) {
        ctx.fillRect(x, roadTop + 5, 5, roadBottom - roadTop - 10);
      }

      // Double yellow centre line
      ctx.fillStyle = 'rgba(196, 156, 62, 0.85)';
      for (const [from, to] of [
        [0, crossingLeft - 4],
        [crossingRight + 4, plazaCrossLeft - 4],
        [plazaCrossRight + 4, WORLD_WIDTH],
      ] as const) {
        ctx.fillRect(from, roadMid - 2, to - from, 2);
        ctx.fillRect(from, roadMid + 2, to - from, 2);
      }

      // Dashed lane paint
      ctx.fillStyle = 'rgba(226, 234, 242, 0.35)';
      for (const y of [8 * TILE + 8, 12 * TILE + 8]) {
        for (let x = 0; x < WORLD_WIDTH; x += 34) {
          if ((x > crossingLeft - 24 && x < crossingRight + 8) || (x > plazaCrossLeft - 24 && x < plazaCrossRight + 8)) continue;
          ctx.fillRect(x, y, 16, 2);
        }
      }

      // 2. Vertical Connector Avenue (Connecting North & South districts)
      const connLeft = 48 * TILE;
      const connWidth = 6 * TILE;
      ctx.fillStyle = 'rgba(3, 6, 11, 0.52)';
      ctx.fillRect(connLeft, 14 * TILE, connWidth, 14 * TILE);
      ctx.fillStyle = 'rgba(148, 172, 194, 0.4)';
      ctx.fillRect(connLeft - 1, 14 * TILE, 2, 14 * TILE);
      ctx.fillRect(connLeft + connWidth - 1, 14 * TILE, 2, 14 * TILE);

      // West Connector Alleyway (Completing the circular city loop)
      const westLeft = 2 * TILE;
      const westWidth = 4 * TILE;
      ctx.fillStyle = 'rgba(3, 6, 11, 0.48)';
      ctx.fillRect(westLeft, 14 * TILE, westWidth, 14 * TILE);
      ctx.fillStyle = 'rgba(148, 172, 194, 0.35)';
      ctx.fillRect(westLeft - 1, 14 * TILE, 2, 14 * TILE);
      ctx.fillRect(westLeft + westWidth - 1, 14 * TILE, 2, 14 * TILE);

      // 3. South District Freight Road
      const southRoadTop = 28 * TILE;
      const southRoadBottom = 34 * TILE;
      const southRoadMid = 31 * TILE;
      ctx.fillStyle = 'rgba(3, 6, 11, 0.50)';
      ctx.fillRect(0, southRoadTop, WORLD_WIDTH, southRoadBottom - southRoadTop);

      ctx.fillStyle = '#0d131a';
      ctx.fillRect(0, southRoadTop - 3, WORLD_WIDTH, 3);
      ctx.fillRect(0, southRoadBottom, WORLD_WIDTH, 3);

      // Freight crossing
      const southCrossLeft = 48 * TILE;
      const southCrossRight = 54 * TILE;
      ctx.fillStyle = 'rgba(233, 240, 247, 0.65)';
      for (let x = southCrossLeft + 3; x < southCrossRight - 3; x += 9) {
        ctx.fillRect(x, southRoadTop + 4, 5, southRoadBottom - southRoadTop - 8);
      }

      // South yellow lane line
      ctx.fillStyle = 'rgba(196, 156, 62, 0.8)';
      ctx.fillRect(0, southRoadMid - 1, southCrossLeft - 4, 2);
      ctx.fillRect(southCrossRight + 4, southRoadMid - 1, WORLD_WIDTH - (southCrossRight + 4), 2);

      // 4. Storefront Neon Signs and Facades
      const drawNeonSign = (text: string, x: number, y: number, color: string, glowColor: string): void => {
        ctx.save();
        ctx.font = 'bold 9px "IBM Plex Mono", monospace';
        ctx.fillStyle = '#060a10';
        const metrics = ctx.measureText(text);
        const padX = 6;
        const boxW = metrics.width + padX * 2;
        const boxH = 14;
        ctx.fillRect(x - boxW / 2, y - boxH / 2, boxW, boxH);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - boxW / 2, y - boxH / 2, boxW, boxH);

        // Glow pass
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
      };

      drawNeonSign('RELAY 7', 20 * TILE + 8, 3 * TILE + 8, '#38e1e8', 'rgba(56, 225, 232, 0.8)');
      drawNeonSign('WARD DISPATCH', 34 * TILE + 8, 3 * TILE + 8, '#ffb24d', 'rgba(255, 178, 77, 0.8)');
      drawNeonSign('NOCTURNE DINER', 68 * TILE + 8, 3 * TILE + 8, '#ff5cc8', 'rgba(255, 92, 200, 0.8)');
      drawNeonSign('FREIGHT LOGISTICS', 78 * TILE + 8, 24 * TILE + 8, '#6ff2a8', 'rgba(111, 242, 168, 0.8)');

      // Specular lamp streaks
      const lamps = [
        { x: 5 * TILE + 8, y: roadTop, h: roadBottom - roadTop, color: 'rgba(255, 178, 77, 0.12)' },
        { x: 15 * TILE + 8, y: roadTop, h: roadBottom - roadTop, color: 'rgba(255, 178, 77, 0.12)' },
        { x: 20 * TILE + 8, y: roadTop, h: roadBottom - roadTop, color: 'rgba(56, 225, 232, 0.14)' },
        { x: 35 * TILE + 8, y: roadTop, h: roadBottom - roadTop, color: 'rgba(255, 178, 77, 0.12)' },
        { x: 44 * TILE + 8, y: roadTop, h: roadBottom - roadTop, color: 'rgba(255, 178, 77, 0.12)' },
        { x: 58 * TILE + 8, y: roadTop, h: roadBottom - roadTop, color: 'rgba(255, 178, 77, 0.12)' },
        { x: 68 * TILE + 8, y: roadTop, h: roadBottom - roadTop, color: 'rgba(255, 92, 200, 0.14)' },
        { x: 86 * TILE + 8, y: roadTop, h: roadBottom - roadTop, color: 'rgba(56, 225, 232, 0.14)' },
        { x: 32 * TILE + 8, y: southRoadTop, h: southRoadBottom - southRoadTop, color: 'rgba(255, 178, 77, 0.12)' },
        { x: 56 * TILE + 8, y: southRoadTop, h: southRoadBottom - southRoadTop, color: 'rgba(56, 225, 232, 0.14)' },
        { x: 78 * TILE + 8, y: southRoadTop, h: southRoadBottom - southRoadTop, color: 'rgba(111, 242, 168, 0.12)' },
      ];

      for (const lamp of lamps) {
        const grad = ctx.createLinearGradient(lamp.x, lamp.y, lamp.x, lamp.y + lamp.h);
        grad.addColorStop(0, lamp.color);
        grad.addColorStop(0.5, lamp.color.replace('0.12', '0.06').replace('0.14', '0.07'));
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(lamp.x - 12, lamp.y, 24, lamp.h);
      }

      // Rain puddles
      const drawPuddle = (
        cx: number,
        cy: number,
        rx: number,
        ry: number,
        reflectionColor: string,
      ): void => {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(2, 4, 8, 0.62)';
        ctx.fill();

        const pGrad = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy);
        pGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        pGrad.addColorStop(0.4, reflectionColor);
        pGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = pGrad;
        ctx.fill();

        ctx.strokeStyle = 'rgba(148, 190, 220, 0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      };

      drawPuddle(14 * TILE, 11 * TILE, 26, 8, 'rgba(255, 178, 77, 0.22)');
      drawPuddle(28 * TILE, 12 * TILE + 4, 30, 9, 'rgba(56, 225, 232, 0.20)');
      drawPuddle(36 * TILE, 12 * TILE, 22, 7, 'rgba(255, 178, 77, 0.18)');
      drawPuddle(19 * TILE + 4, 7 * TILE + 6, 18, 5, 'rgba(56, 225, 232, 0.25)');
      drawPuddle(62 * TILE, 11 * TILE, 28, 8, 'rgba(255, 92, 200, 0.22)');
      drawPuddle(76 * TILE, 12 * TILE, 24, 7, 'rgba(56, 225, 232, 0.20)');
      drawPuddle(50 * TILE, 20 * TILE, 20, 6, 'rgba(148, 190, 220, 0.20)');
      drawPuddle(40 * TILE, 31 * TILE, 26, 8, 'rgba(255, 178, 77, 0.20)');
      drawPuddle(66 * TILE, 31 * TILE, 24, 7, 'rgba(111, 242, 168, 0.20)');
    }

    private placeProps(): void {
      for (let y = 0; y < GRID_HEIGHT; y += 1) {
        for (let x = 0; x < GRID_WIDTH; x += 1) {
          const cell = cellAt(x, y);
          const index = propTileFor(cell);
          if (index === null) continue;
          if (cell === 'R') {
            this.add
              .image(x * TILE, y * TILE, TILESET_KEY, index)
              .setOrigin(0)
              .setDepth(y * TILE + TILE);
            continue;
          }
          this.add
            .image(x * TILE + 8, y * TILE + 16, TILESET_KEY, index)
            .setOrigin(0.5, 1)
            .setDepth(y * TILE + 16);
        }
      }
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

      const lampDefs = [
        // Warm sodium streetlamps: Central Relay
        [5, 4, 0xffb24d, 84, 0.55, false],
        [15, 4, 0xffb24d, 84, 0.55, false],
        [35, 4, 0xffb24d, 84, 0.55, false],
        [44, 4, 0xffb24d, 84, 0.55, false],
        [8, 16, 0xffb24d, 84, 0.55, false],
        [24, 16, 0xffb24d, 84, 0.55, false],
        [40, 16, 0xffb24d, 84, 0.55, false],
        // Cold cyan neon & terminal fixtures: Central Relay
        [20, 4, 0x38e1e8, 64, 0.65, true],
        [34, 4, 0x38e1e8, 54, 0.60, true],
        [12, 16, 0x38e1e8, 64, 0.65, true],
        [30, 16, 0x38e1e8, 44, 0.50, true],
        [42, 16, 0x38e1e8, 48, 0.55, true],
        // East Commercial Plaza Lamps & Neon (Warm amber + Vivid Magenta/Cyan)
        [58, 4, 0xffb24d, 84, 0.55, false],
        [68, 4, 0xff5cc8, 72, 0.70, true], // Nocturne Diner neon sign
        [72, 4, 0xffb24d, 84, 0.55, false],
        [86, 4, 0x38e1e8, 64, 0.60, true],
        [62, 16, 0xffb24d, 84, 0.55, false],
        [78, 16, 0xff5cc8, 64, 0.60, true],
        [86, 16, 0x38e1e8, 68, 0.65, true], // East Plaza Anchor Lamp
        [90, 16, 0xffb24d, 84, 0.55, false],
        // Connector Avenue Lamps
        [50, 20, 0x38e1e8, 60, 0.55, true],
        // South District Market & Freight Yard
        [24, 25, 0xffb24d, 84, 0.55, false],
        [44, 25, 0xffb24d, 84, 0.55, false],
        [66, 25, 0xffb24d, 84, 0.55, false],
        [78, 25, 0x6ff2a8, 68, 0.65, true], // Freight Logistics neon
        [86, 25, 0xffb24d, 84, 0.55, false],
        [26, 37, 0x38e1e8, 64, 0.65, true], // Freight Yard Anchor
        [32, 37, 0xffb24d, 84, 0.55, false],
        [56, 37, 0x38e1e8, 64, 0.55, true],
        [78, 37, 0xffb24d, 84, 0.55, false],
      ] as const;

      for (let i = 0; i < lampDefs.length; i += 1) {
        const [x, y, colour, size, baseAlpha, isNeon] = lampDefs[i]!;
        const img = this.add
          .image(x * TILE + 8, y * TILE + 8, 'lamp-glow')
          .setDisplaySize(size, size * 0.74)
          .setTint(colour)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(baseAlpha)
          .setDepth(901);

        this.lampGlows.push({
          image: img,
          baseAlpha,
          baseScaleX: img.scaleX,
          baseScaleY: img.scaleY,
          phase: i * 1.35,
          isNeon,
        });
      }
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

      this.mistRibbons = [];
      const ribbon1 = this.add
        .tileSprite(0, 120, WORLD_WIDTH, 36, mistKey)
        .setOrigin(0, 0.5)
        .setAlpha(0.12)
        .setDepth(903)
        .setBlendMode(Phaser.BlendModes.ADD);

      const ribbon2 = this.add
        .tileSprite(0, 188, WORLD_WIDTH, 44, mistKey)
        .setOrigin(0, 0.5)
        .setAlpha(0.10)
        .setDepth(904)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.mistRibbons.push(ribbon1, ribbon2);
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
      this.add
        .image(0, 0, key)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(960);
    }

    private initRain(): void {
      this.rainDrops = [];
      const count = 64;
      for (let i = 0; i < count; i += 1) {
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
          // Sharp cyan neon flicker
          const flicker = Math.sin(time * 0.007 + tracker.phase) * 0.12;
          const jitter = Math.sin(time * 0.023 + tracker.phase) > 0.96 ? -0.15 : 0;
          tracker.image.setAlpha(Math.max(0.2, tracker.baseAlpha + flicker + jitter));
        } else {
          // Soft amber sodium lamp breathing
          const pulse = Math.sin(time * 0.0024 + tracker.phase) * 0.06;
          tracker.image.setAlpha(tracker.baseAlpha + pulse);
        }
      }
    }

    private updateMist(delta: number): void {
      if (this.quality === 'low' || this.reducedMotion) return;
      if (this.mistRibbons.length >= 2) {
        this.mistRibbons[0]!.tilePositionX += (delta * 0.012);
        this.mistRibbons[1]!.tilePositionX -= (delta * 0.018);
      }
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
      const minX = cam.scrollX - 30;
      const maxX = cam.scrollX + VIEW_W + 30;
      const minY = cam.scrollY - 30;
      const maxY = cam.scrollY + VIEW_H + 30;

      for (const drop of this.rainDrops) {
        drop.x += drop.vx * dt;
        drop.y += drop.vy * dt;

        // When drop leaves visible window or hits ground zone
        if (drop.y > maxY || drop.x < minX) {
          if (drop.y >= 7 * TILE && drop.y <= 16 * TILE && Math.random() < 0.25) {
            this.activeSplashes.push({
              x: drop.x,
              y: drop.y,
              age: 0,
              maxAge: 140,
              maxRadius: 2.5 + Math.random() * 2,
            });
          }
          drop.x = minX + Math.random() * (maxX - minX + 40);
          drop.y = minY - Math.random() * 20;
        }

        // Draw fine angled rain streak
        this.rainGraphics.lineStyle(1, 0xaad4f5, drop.alpha);
        this.rainGraphics.lineBetween(
          drop.x,
          drop.y,
          drop.x + drop.vx * 0.022,
          drop.y + drop.length,
        );
      }

      // Render rain splashes
      this.splashGraphics.clear();
      for (let i = this.activeSplashes.length - 1; i >= 0; i -= 1) {
        const splash = this.activeSplashes[i]!;
        splash.age += delta;
        if (splash.age >= splash.maxAge) {
          this.activeSplashes.splice(i, 1);
          continue;
        }
        const progress = splash.age / splash.maxAge;
        const alpha = (1 - progress) * 0.45;
        const rx = progress * splash.maxRadius;
        this.splashGraphics.lineStyle(1, 0x8ecae6, alpha);
        this.splashGraphics.strokeEllipse(splash.x, splash.y, rx * 2, rx * 0.7);
      }
    }

    private updateFootstepRipples(delta: number): void {
      this.footstepGraphics.clear();
      for (let i = this.footstepRipples.length - 1; i >= 0; i -= 1) {
        const rip = this.footstepRipples[i]!;
        rip.age += delta;
        if (rip.age >= rip.maxAge) {
          this.footstepRipples.splice(i, 1);
          continue;
        }
        const progress = rip.age / rip.maxAge;
        const alpha = (1 - progress) * 0.35;
        const r = 2 + progress * 4;
        this.footstepGraphics.lineStyle(1, 0x76bfe4, alpha);
        this.footstepGraphics.strokeEllipse(rip.x, rip.y, r * 2, r * 0.75);
      }
    }

    private updateBlinkEffects(delta: number): void {
      this.blinkGraphics.clear();

      // Slit-scan warp flash lines
      if (this.warpFlashTimer > 0) {
        this.warpFlashTimer -= delta;
        const progress = Math.max(0, this.warpFlashTimer / 340);
        const cam = this.cameras.main;

        this.blinkGraphics.lineStyle(2, 0x38e1e8, progress * 0.85);
        const yOffset1 = cam.scrollY + (1 - progress) * VIEW_H;
        const yOffset2 = cam.scrollY + progress * VIEW_H;
        this.blinkGraphics.lineBetween(cam.scrollX, yOffset1, cam.scrollX + VIEW_W, yOffset1);
        this.blinkGraphics.lineBetween(cam.scrollX, yOffset2, cam.scrollX + VIEW_W, yOffset2);
      }

      // Temporal particles
      for (let i = this.blinkParticles.length - 1; i >= 0; i -= 1) {
        const p = this.blinkParticles[i]!;
        p.life += delta;
        if (p.life >= p.maxLife) {
          this.blinkParticles.splice(i, 1);
          continue;
        }
        const dt = delta / 1000;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;

        const progress = p.life / p.maxLife;
        const alpha = (1 - progress) * 0.9;
        this.blinkGraphics.fillStyle(p.color, alpha);
        this.blinkGraphics.fillCircle(p.x, p.y, p.size);
      }
    }

    private updatePulse(delta: number): void {
      this.pulseGraphics.clear();
      if (this.pulseTimer <= 0) return;

      this.pulseTimer -= delta;
      const progress = 1 - Math.max(0, this.pulseTimer / 600);
      this.pulseRadius = progress * 240;
      const alpha = (1 - progress) * 0.8;

      // Cyan resonance wave
      this.pulseGraphics.lineStyle(2, 0x38e1e8, alpha);
      this.pulseGraphics.strokeCircle(this.player.x, this.player.y - 8, this.pulseRadius);

      // Inner faint magenta echo wave
      if (this.pulseRadius > 20) {
        this.pulseGraphics.lineStyle(1, 0xff5cc8, alpha * 0.6);
        this.pulseGraphics.strokeCircle(this.player.x, this.player.y - 8, this.pulseRadius * 0.7);
      }
    }

    private drawMarkers(view: WorldView, time: number): void {
      const graphics = this.markers;
      graphics.clear();
      const pulse = this.reducedMotion ? 0.85 : 0.55 + Math.sin(time / 440) * 0.35;

      for (const target of WORLD_TARGETS) {
        if (!targetAvailable(view, target.id)) continue;

        const isPrompted = this.lastPromptId === target.id;
        const alpha = isPrompted ? 1.0 : pulse;
        const cx = target.x;
        const cy = target.y;

        // Distinct styling based on target category
        if (target.kind === 'evidence') {
          // Amber/gold investigative beacon with diamond reticle & glint
          const evidenceItem = view.evidence.find((item) => item.evidenceId === target.id);
          const isCollected = evidenceItem ? !evidenceItem.available : false;

          const color = isCollected ? 0x5a6e82 : 0xffb24d;
          graphics.lineStyle(1, color, alpha);

          // Central diamond reticle
          const dSize = isPrompted ? 5 : 3.5;
          graphics.beginPath();
          graphics.moveTo(cx, cy - dSize);
          graphics.lineTo(cx + dSize, cy);
          graphics.lineTo(cx, cy + dSize);
          graphics.lineTo(cx - dSize, cy);
          graphics.closePath();
          graphics.strokePath();

          // Corner reticle arms
          const arm = 4;
          const left = target.tileX * TILE + 2;
          const top = target.tileY * TILE + 2;
          const size = TILE - 4;
          graphics.lineBetween(left, top, left + arm, top);
          graphics.lineBetween(left, top, left, top + arm);
          graphics.lineBetween(left + size, top, left + size - arm, top);
          graphics.lineBetween(left + size, top, left + size, top + arm);
          graphics.lineBetween(left, top + size, left + arm, top + size);
          graphics.lineBetween(left, top + size, left, top + size - arm);
          graphics.lineBetween(left + size, top + size, left + size - arm, top + size);
          graphics.lineBetween(left + size, top + size, left + size, top + size - arm);

          // Lens glint sparkle on uncollected evidence
          if (!isCollected && !this.reducedMotion) {
            const glintPhase = (time % 1600) / 1600;
            if (glintPhase < 0.25) {
              const gAlpha = Math.sin((glintPhase / 0.25) * Math.PI) * 0.8;
              graphics.lineStyle(1, 0xffffff, gAlpha);
              graphics.lineBetween(cx - 4, cy, cx + 4, cy);
              graphics.lineBetween(cx, cy - 4, cx, cy + 4);
            }
          }
        } else if (target.kind === 'anchor') {
          // Cyan temporal checkpoint ring with compass ticks
          const color = 0x38e1e8;
          graphics.lineStyle(1, color, alpha);
          graphics.strokeCircle(cx, cy, 9);
          graphics.strokeCircle(cx, cy, 5);

          // Cardinal ticks
          graphics.lineBetween(cx, cy - 11, cx, cy - 8);
          graphics.lineBetween(cx, cy + 8, cx, cy + 11);
          graphics.lineBetween(cx - 11, cy, cx - 8, cy);
          graphics.lineBetween(cx + 8, cy, cx + 11, cy);
        } else if (target.kind === 'decision') {
          // Coral warning alert reticle
          const color = 0xff7a4d;
          graphics.lineStyle(1, color, alpha);
          graphics.strokeRect(cx - 6, cy - 6, 12, 12);
          graphics.lineBetween(cx - 3, cy, cx + 3, cy);
          graphics.lineBetween(cx, cy - 3, cx, cy + 3);
        } else {
          // NPC conversation cue
          const color = 0x5ccfe6;
          graphics.lineStyle(1, color, alpha);
          graphics.strokeEllipse(cx, cy + 6, 16, 7);

          // If Aster is nearby, show floating dialogue cue dots
          const distToPlayer = Phaser.Math.Distance.Between(this.player.x, this.player.y, cx, cy);
          if (distToPlayer < 48) {
            const bubbleY = cy - 18;
            graphics.fillStyle(0x070a0f, 0.75);
            graphics.fillRoundedRect(cx - 8, bubbleY - 4, 16, 8, 3);
            graphics.lineStyle(1, color, 0.8);
            graphics.strokeRoundedRect(cx - 8, bubbleY - 4, 16, 8, 3);

            // Three dots
            graphics.fillStyle(color, 0.9);
            const dotAnim = Math.floor(time / 260) % 3;
            graphics.fillRect(cx - 4, bubbleY - 1 + (dotAnim === 0 ? -1 : 0), 1, 1);
            graphics.fillRect(cx - 0.5, bubbleY - 1 + (dotAnim === 1 ? -1 : 0), 1, 1);
            graphics.fillRect(cx + 3, bubbleY - 1 + (dotAnim === 2 ? -1 : 0), 1, 1);
          }
        }

        // Active lock-on ring when player is in range
        if (isPrompted) {
          graphics.lineStyle(1.5, 0xffffff, Math.max(0.4, alpha * 0.8));
          graphics.strokeCircle(cx, cy, 12);
        }
      }
    }

    private createAnimations(): void {
      if (!this.anims.exists('rin-walk')) {
        this.anims.create({
          key: 'rin-walk',
          frames: [{ key: 'rin-1' }, { key: 'rin-2' }],
          frameRate: 8,
          repeat: -1,
        });
      }
      if (!this.anims.exists('rin-idle')) {
        this.anims.create({
          key: 'rin-idle',
          frames: [{ key: 'rin-1' }, { key: 'rin-2' }],
          frameRate: 2,
          repeat: -1,
        });
      }
      if (!this.anims.exists('sable-idle')) {
        this.anims.create({
          key: 'sable-idle',
          frames: [{ key: 'sable-1' }, { key: 'sable-2' }],
          frameRate: 2,
          repeat: -1,
        });
      }
      if (!this.anims.exists('ivo-idle')) {
        this.anims.create({
          key: 'ivo-idle',
          frames: [{ key: 'ivo-1' }, { key: 'ivo-2' }],
          frameRate: 2,
          repeat: -1,
        });
      }
      if (!this.anims.exists('lyra-idle')) {
        this.anims.create({
          key: 'lyra-idle',
          frames: [{ key: 'lyra-1' }, { key: 'lyra-2' }],
          frameRate: 2,
          repeat: -1,
        });
      }
      if (!this.anims.exists('vane-idle')) {
        this.anims.create({
          key: 'vane-idle',
          frames: [{ key: 'vane-1' }, { key: 'vane-2' }],
          frameRate: 2,
          repeat: -1,
        });
      }
      if (!this.anims.exists('castor-idle')) {
        this.anims.create({
          key: 'castor-idle',
          frames: [{ key: 'castor-1' }, { key: 'castor-2' }],
          frameRate: 2,
          repeat: -1,
        });
      }
    }
  }

  return DistrictScene;
}
