import { useEffect, useRef, type RefObject } from 'react';
import type * as PhaserTypes from 'phaser';
import {
  createDistrictScene,
  type DistrictSceneApi,
  type SfxName,
} from './DistrictScene.js';
import type { MoveInput } from '../world/movement.js';
import type { WorldView } from '../world/worldView.js';

export interface WorldHandle {
  playSfx(name: SfxName): void;
  setMuted(muted: boolean): void;
}

interface PhaserHostProps {
  readonly getView: () => WorldView;
  readonly isPaused: () => boolean;
  readonly getTouchInput: () => MoveInput;
  readonly onPrompt: (targetId: string | null) => void;
  readonly onInteract: (targetId: string) => void;
  readonly onReady: () => void;
  readonly worldRef: RefObject<WorldHandle | null>;
}

/**
 * Rendering host. Phaser owns movement and camera presentation only; it reads
 * canonical state through `getView` and reports interaction intents upward. It
 * never dispatches to GameSession and never writes a fact.
 */
export function PhaserHost(props: PhaserHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef(props);
  liveRef.current = props;

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    let disposed = false;
    let game: PhaserTypes.Game | undefined;

    void (async () => {
      try {
        await document.fonts.ready;
      } catch {
        // Fonts are cosmetic; never block the world layer on them.
      }

      const Phaser = await import('phaser');
      if (disposed) return;

      const DistrictScene = createDistrictScene(Phaser, {
        getView: () => liveRef.current.getView(),
        isPaused: () => liveRef.current.isPaused(),
        getTouchInput: () => liveRef.current.getTouchInput(),
        onPrompt: (targetId) => liveRef.current.onPrompt(targetId),
        onInteract: (targetId) => liveRef.current.onInteract(targetId),
        onReady: () => {
          if (!game) return;
          const scene = game.scene.getScene('DistrictScene') as unknown as DistrictSceneApi;
          liveRef.current.worldRef.current = {
            playSfx: (name) => scene.playSfx(name),
            setMuted: (muted) => scene.setMuted(muted),
          };
          liveRef.current.onReady();
        },
      });

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        backgroundColor: '#070a0f',
        width: 512,
        height: 288,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        render: {
          pixelArt: true,
          antialias: false,
          roundPixels: true,
        },
        scene: [DistrictScene],
      });

      // Opt-in inspection hook for automated verification (`?debug=1`).
      if (
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('debug')
      ) {
        (window as unknown as { __lastBlinkGame?: PhaserTypes.Game }).__lastBlinkGame = game;
      }
    })();

    return () => {
      disposed = true;
      liveRef.current.worldRef.current = null;
      game?.destroy(true);
    };
  }, []);

  return <div className="world-host" ref={containerRef} aria-hidden="true" />;
}
