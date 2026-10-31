# ADR 0002 — React + Vite + Phaser with a framework-free engine

- Status: accepted
- Date: 2026-10-31
- Owners: engine, platform

## Context

The game needs a 2D world, a readable HUD and evidence/dialogue panels. Phaser is
well suited to tilemaps and input; React is better for dense, accessible UI. The
deterministic engine must run in Node tests and later in a worker or server
without a DOM.

## Decision

- Vite builds the app and code-splits Phaser behind a dynamic import.
- React owns the shell, panels, controls and accessibility mirror.
- Phaser owns the world canvas only. It reads snapshots through a callback and
  receives no state ownership.
- The engine is pure TypeScript under `src/engine`, with no Phaser, React, DOM,
  network or clock imports. A static-scan test enforces this.
- No additional runtime libraries in Stage 3. No UI component kit, state library
  or game framework wrapper.

## Consequences

- Engine tests run in milliseconds on Node and do not need a browser.
- Phaser stays out of the initial UI bundle (1.37 MB separate chunk).
- Two rendering authorities require discipline: the Phaser scene and the DOM
  mirror must read the same snapshot, never duplicate game logic.
- Vite's build warns about the Phaser chunk size. It is expected and isolated;
  Stage 4 can lazy-load it only when the world panel is visible if needed.
