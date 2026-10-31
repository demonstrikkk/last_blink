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
  | 'ui-click'
  | 'ui-open'
  | 'ui-confirm';

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
    private markers!: PhaserTypes.GameObjects.Graphics;
    private lastPromptId: string | null = null;
    private reducedMotion = false;
    private muted = false;
    private ambienceStarted = false;
    private music: PhaserTypes.Sound.BaseSound | null = null;
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

      for (const sfx of [
        'evidence-found',
        'choice-lock',
        'anchor-set',
        'ui-click',
        'ui-open',
        'ui-confirm',
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

      this.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, NIGHT_GRADE, 1)
        .setOrigin(0)
        .setBlendMode(Phaser.BlendModes.MULTIPLY)
        .setDepth(900);

      this.addLampGlow();
      this.markers = this.add.graphics().setDepth(950);
      this.addVignette();

      this.playerShadow = this.add
        .ellipse(SPAWN.x, SPAWN.y - 1, 10, 4, 0x000000, 0.45)
        .setDepth(SPAWN.y - 1);

      this.playerSprite = this.add
        .sprite(SPAWN.x, SPAWN.y, 'rin-1')
        .setOrigin(0.5, 1)
        .setDepth(SPAWN.y);

      this.sableSprite = this.add
        .sprite(30 * TILE + 8, 16 * TILE + 16, 'sable-1')
        .setOrigin(0.5, 1)
        .setDepth(16 * TILE + 16);
      this.add.ellipse(30 * TILE + 8, 16 * TILE + 15, 10, 4, 0x000000, 0.45).setDepth(16 * TILE + 15);

      this.createAnimations();
      this.playerSprite.play('rin-idle');
      this.sableSprite.play('sable-idle');

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
      camera.setDeadzone(64, 40);
      camera.startFollow(this.playerSprite, true, 0.18, 0.18);
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
          const index = y === 3 || y === 17 ? facadeTileFor(x, y) : groundTileFor(cell, x, y);
          drawTile(index, x, y);
        }
      }

      this.paintStreet(ctx);
      texture.refresh();
      this.add.image(0, 0, GROUND_TEXTURE).setOrigin(0).setDepth(-1000);
    }

    /** Kerbs, lane paint, crossings and wear, baked once with the ground. */
    private paintStreet(ctx: CanvasRenderingContext2D): void {
      const roadTop = 7 * TILE;
      const roadBottom = 14 * TILE;
      const roadMid = 10 * TILE + 8;

      // Building shadows falling onto the near pavement.
      ctx.fillStyle = 'rgba(4, 7, 11, 0.42)';
      ctx.fillRect(0, 4 * TILE, WORLD_WIDTH, 5);
      ctx.fillRect(0, 17 * TILE - 5, WORLD_WIDTH, 5);

      // Kerb faces.
      ctx.fillStyle = '#0d131a';
      ctx.fillRect(0, roadTop - 3, WORLD_WIDTH, 3);
      ctx.fillRect(0, roadBottom, WORLD_WIDTH, 3);
      ctx.fillStyle = 'rgba(148, 172, 194, 0.5)';
      ctx.fillRect(0, roadTop - 4, WORLD_WIDTH, 1);
      ctx.fillRect(0, roadBottom + 3, WORLD_WIDTH, 1);

      // Crosswalk, with a stop line on the approach.
      const crossingLeft = 18 * TILE;
      const crossingRight = 22 * TILE;
      ctx.fillStyle = 'rgba(233, 240, 247, 0.7)';
      for (let x = crossingLeft + 3; x < crossingRight - 3; x += 9) {
        ctx.fillRect(x, roadTop + 5, 5, roadBottom - roadTop - 10);
      }
      ctx.fillStyle = 'rgba(233, 240, 247, 0.45)';
      ctx.fillRect(crossingRight + 6, roadTop + 4, 3, roadBottom - roadTop - 8);

      // Double yellow centre line, interrupted by the crossing.
      ctx.fillStyle = 'rgba(196, 156, 62, 0.85)';
      for (const [from, to] of [
        [0, crossingLeft - 4],
        [crossingRight + 4, WORLD_WIDTH],
      ] as const) {
        ctx.fillRect(from, roadMid - 2, to - from, 2);
        ctx.fillRect(from, roadMid + 2, to - from, 2);
      }

      // Dashed lane paint either side of the centre.
      ctx.fillStyle = 'rgba(226, 234, 242, 0.35)';
      for (const y of [8 * TILE + 8, 12 * TILE + 8]) {
        for (let x = 0; x < WORLD_WIDTH; x += 34) {
          if (x > crossingLeft - 24 && x < crossingRight + 8) continue;
          ctx.fillRect(x, y, 16, 2);
        }
      }

      // Manholes and repair patches.
      const manhole = (cx: number, cy: number): void => {
        ctx.beginPath();
        ctx.fillStyle = '#151b23';
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(122, 146, 168, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      };
      manhole(9 * TILE + 8, 10 * TILE + 8);
      manhole(31 * TILE + 8, 9 * TILE + 8);
      ctx.fillStyle = 'rgba(10, 15, 21, 0.32)';
      ctx.fillRect(35 * TILE, 11 * TILE, 4 * TILE, TILE);
      ctx.fillRect(3 * TILE, 8 * TILE, 3 * TILE, TILE);
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
      for (const [x, y, colour, size] of [
        [5, 4, 0xffb24d, 84],
        [15, 4, 0xffb24d, 84],
        [35, 4, 0xffb24d, 84],
        [44, 4, 0xffb24d, 84],
        [8, 16, 0xffb24d, 84],
        [24, 16, 0xffb24d, 84],
        [40, 16, 0xffb24d, 84],
        [20, 4, 0x38e1e8, 56],
        [12, 16, 0x38e1e8, 64],
        [30, 16, 0x38e1e8, 44],
      ] as const) {
        this.add
          .image(x * TILE + 8, y * TILE + 8, 'lamp-glow')
          .setDisplaySize(size, size * 0.74)
          .setTint(colour)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0.55)
          .setDepth(901);
      }
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
          gradient.addColorStop(0.58, 'rgba(4, 7, 11, 0.12)');
          gradient.addColorStop(1, 'rgba(4, 7, 11, 0.52)');
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

    private drawMarkers(view: WorldView, time: number): void {
      const graphics = this.markers;
      graphics.clear();
      const pulse = this.reducedMotion ? 0.85 : 0.55 + Math.sin(time / 480) * 0.3;

      for (const target of WORLD_TARGETS) {
        if (!targetAvailable(view, target.id)) continue;
        const alpha = this.lastPromptId === target.id ? 1 : pulse;
        const left = target.tileX * TILE + 2;
        const top = target.tileY * TILE + 2;
        const size = TILE - 4;
        graphics.lineStyle(1, 0x38e1e8, alpha);
        // Four corner brackets, drawn on whole pixels.
        const arm = 4;
        graphics.lineBetween(left, top, left + arm, top);
        graphics.lineBetween(left, top, left, top + arm);
        graphics.lineBetween(left + size, top, left + size - arm, top);
        graphics.lineBetween(left + size, top, left + size, top + arm);
        graphics.lineBetween(left, top + size, left + arm, top + size);
        graphics.lineBetween(left, top + size, left, top + size - arm);
        graphics.lineBetween(left + size, top + size, left + size - arm, top + size);
        graphics.lineBetween(left + size, top + size, left + size, top + size - arm);

        if (this.lastPromptId === target.id) {
          graphics.lineStyle(1, 0x38e1e8, Math.max(0.3, alpha * 0.6));
          graphics.strokeCircle(target.x, target.y, 11);
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
    }
  }

  return DistrictScene;
}
