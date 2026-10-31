# The Last Blink: Second Settlement

Deterministic narrative investigation game. Stage 5 is the current slice: one
street in Aster, a three-act investigation with three evidence items, three
consequential decisions and three reachable endings, all derived from canonical
facts.

## Status

- Stages 0–2: visual direction, curated CC0/OFL assets, reproducible asset
  pipeline. Gate 1 accepted.
- Stage 3: strict TypeScript, React + Vite + Phaser scaffold, frozen contracts,
  deterministic engine, `GameSession`, ports/mocks, tests, CI and architecture
  records.
- Stage 4: playable Aster street with fixed-step movement, collision, follow
  camera, Relay 7 evidence, Sable dialogue, a consequential choice, derived
  facts, an engine anchor, and HUD/dialogue/ledger surfaces. Gate accepted
  (`efe1c70`).
- Stage 5: evidence chain with provenance, engine-enforced evidence-informed
  decisions, relationship and scrutiny facts, a deterministic delayed
  consequence, monotonic story phases, six objectives and three reachable
  endings. Awaiting gate sign-off; Stage 6 has not started.

## Quick start

```powershell
npm ci
npm run dev        # http://localhost:5173
npm run verify     # typecheck + tests + production build
npm run preview    # serve the production build on :4173
```

Requirements: Node ≥ 22.12 (verified on 22.15.0), npm 11.

## Play

1. Read the Relay 7 terminal on the north kerb. Sable will not decide anything
   until you have read it yourself.
2. Talk to Sable on the south walk and decide what to do with the log:
   share it with the ward, or conceal it.
3. Recover the ward dispatch slip from the north board. This is where the earlier
   decision shows its delayed consequence.
4. Hear Ivo's account at the south stall, then decide whether he is named.
5. Make the ward call from the call-box on the east walk and reach an ending.
6. Set an anchor at the cyan lamp post to checkpoint the record, and open the
   ledger to inspect facts, provenance, events and the state hash.

| Input | Action |
|---|---|
| Arrow keys / WASD | Move |
| E or Space | Interact, advance dialogue, confirm choice |
| 1 / 2 | Select a choice |
| Esc | Close dialogue or ledger |
| Ledger button | Inspect facts, provenance, events, hash, save and restart |

Touch D-pads appear at or below 820 px. The session is in memory: refreshing or
restarting returns the street to its opening state, and the UI says so.

## Layout

```
src/engine/      pure deterministic engine (no React, Phaser, DOM or network)
src/content/     Stage 5 facts, rules, evidence, choices, objectives, endings, dialogue
src/world/       map grid, movement, interaction range, world-view projection
src/game/        Phaser scene and host; renders and reports intents only
src/ui/          dialogue sheet, field notes, ledger, touch controls
src/session/     browser composition root
src/App.tsx      React shell, dialogue state machine, accessible mirror
tests/           Vitest suites, including determinism and engine-purity scans
docs/            gate evidence, architecture, contract catalogue, event model, ADRs
tools/assets/    preserved asset pipeline
public/assets/   46 curated CC0/OFL files
```

## Rules that must not drift

1. The deterministic engine owns canonical state. AI proposals are validated like
   any other action.
2. Phaser renders; React frames. Neither stores game truth. Player position and
   camera are presentation state, not canonical state.
3. Every boundary object has a Zod schema, an owner, a version and fixtures.
4. No secrets in browser code. LLM, YugabyteDB and Meko credentials stay
   server-side in later stages.
5. Do not start the next stage's work until the current gate is signed off.
6. Story gating belongs in content and the engine, never in the renderer. A locked
   decision must be refused by `validateAction`, not merely hidden.

Read `docs/ARCHITECTURE.md`, `docs/CAUSAL_MODEL.md`,
`docs/CONTRACT_CATALOGUE.md`, `docs/EVENT_MODEL.md` and the ADRs before changing
engine or story code.

## Verification

```powershell
npm run typecheck
npm test
npm run build
python tools/assets/validate/build_register.py
python tools/assets/validate/validate_assets.py
python tools/assets/validate/check_catalogue_links.py
```

Stage 5 evidence, commands and known limits: `docs/STAGE_5_REPORT.md`.
Stage 4 slice: `docs/STAGE_4_REPORT.md`.
Stage 3 foundation: `docs/STAGE_3_REPORT.md`.
Causal semantics: `docs/CAUSAL_MODEL.md`.
