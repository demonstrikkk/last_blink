import { useEffect, useRef } from 'react';
import type * as PhaserTypes from 'phaser';

export interface WorldStatus {
  readonly tick: number;
  readonly stateVersion: number;
  readonly hash: string;
  readonly branchLabel: string;
}

interface PhaserHostProps {
  readonly readStatus: () => WorldStatus;
}

/**
 * Thin rendering host. It owns no state: every frame it reads the latest engine
 * snapshot through a callback. Phaser is dynamically imported so the engine and
 * the initial UI do not pay for it, and so nothing outside this file needs it.
 */
export function PhaserHost({ readStatus }: PhaserHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const readRef = useRef(readStatus);
  readRef.current = readStatus;

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    let disposed = false;
    let game: { destroy(removeCanvas: boolean): void } | undefined;

    void (async () => {
      try {
        await document.fonts.ready;
      } catch {
        // Fonts are cosmetic here; never block the world layer on them.
      }

      const Phaser = await import('phaser');
      if (disposed) return;

      class StatusScene extends Phaser.Scene {
        private statusText: PhaserTypes.GameObjects.Text | null = null;

        constructor() {
          super('StatusScene');
        }

        create(): void {
          const grid = this.add.graphics();
          grid.lineStyle(1, 0x1e2833, 0.8);
          for (let x = 0; x <= 640; x += 32) grid.lineBetween(x, 0, x, 360);
          for (let y = 0; y <= 360; y += 32) grid.lineBetween(0, y, 640, y);

          grid.lineStyle(1, 0x38e1e8, 0.45);
          grid.strokeRect(16.5, 16.5, 607, 327);
          grid.lineStyle(2, 0x38e1e8, 0.9);
          grid.lineBetween(16, 16, 56, 16);
          grid.lineBetween(16, 16, 16, 56);
          grid.lineBetween(624, 344, 584, 344);
          grid.lineBetween(624, 344, 624, 304);

          this.add
            .text(32, 32, 'V1', {
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: '#38e1e8',
            })
            .setAlpha(0.9);

          this.add.text(32, 58, 'WORLD LAYER', {
            fontFamily: 'Space Grotesk',
            fontSize: '28px',
            color: '#eaf1f8',
          });

          this.add.text(32, 96, 'Stage 3 boot scene — no map, no movement.', {
            fontFamily: 'Space Grotesk',
            fontSize: '16px',
            color: '#a9b8c7',
          });

          this.statusText = this.add.text(32, 280, '', {
            fontFamily: 'IBM Plex Mono',
            fontSize: '13px',
            color: '#a9b8c7',
            lineSpacing: 6,
          });
        }

        override update(): void {
          const status = readRef.current();
          this.statusText?.setText([
            `TICK ${String(status.tick).padStart(3, '0')}   STATE v${status.stateVersion}`,
            `BRANCH ${status.branchLabel}`,
            `HASH ${status.hash}`,
          ]);
        }
      }

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        backgroundColor: '#070a0f',
        width: 640,
        height: 360,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        render: { antialias: false },
        scene: [StatusScene],
      });
    })();

    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, []);

  return <div className="world-host" ref={containerRef} aria-hidden="true" />;
}
