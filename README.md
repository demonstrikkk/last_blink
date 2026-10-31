# The Last Blink: Second Settlement

Deterministic narrative investigation game. Stage 3 establishes the engineering
foundation; it is not yet a playable slice.

## Status

- Stages 0–2: visual direction, curated CC0/OFL assets, reproducible asset
  pipeline. Gate 1 accepted.
- Stage 3: repository, strict TypeScript, React + Vite + Phaser scaffold, frozen
  contracts, deterministic engine, `GameSession`, ports/mocks, tests, CI and
  architecture records.
- Stage 4: not started. The world has no map, movement or collision yet.

## Quick start

```powershell
npm ci
npm run dev        # http://localhost:5173
npm run verify     # typecheck + tests + production build
npm run preview    # serve the production build on :4173
```

Requirements: Node ≥ 22.12 (verified on 22.15.0), npm 11.

## Layout

```
src/engine/      pure deterministic engine (no React, Phaser, DOM or network)
src/game/        Phaser boot host; renders snapshots, owns no state
src/session/     browser composition root
src/App.tsx      React shell and accessible state mirror
tests/           Vitest suites, including determinism and engine-purity scans
docs/            gate evidence, architecture, contract catalogue, event model, ADRs
tools/assets/    preserved asset pipeline
public/assets/   46 curated CC0/OFL files
```

## Rules that must not drift

1. The deterministic engine owns canonical state. AI proposals are validated like
   any other action.
2. Phaser renders; React frames. Neither stores game truth.
3. Every boundary object has a Zod schema, an owner, a version and fixtures.
4. No secrets in browser code. LLM, YugabyteDB and Meko credentials stay
   server-side in later stages.
5. Do not start Stage 4 work until Stage 3 is signed off.

Read `docs/ARCHITECTURE.md`, `docs/CONTRACT_CATALOGUE.md` and
`docs/EVENT_MODEL.md` before changing engine code.

## Verification

```powershell
npm run typecheck
npm test
npm run build
python tools/assets/validate/build_register.py
python tools/assets/validate/validate_assets.py
```

Stage 3 evidence, commands and known limits: `docs/STAGE_3_REPORT.md`.
