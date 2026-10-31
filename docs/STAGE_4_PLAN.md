# Stage 4 — Implementation plan (first playable vertical slice)

Scope: one short, polished Aster street with movement, collision, camera,
interaction, one evidence item, one scripted conversation, one consequential
choice, one anchor and a HUD. No BLINK switching, no MORROW policy, no ECHO,
no backend, no database.

## File ownership

| Area | Files | Owner | Notes |
|---|---|---|---|
| Action vocabulary | `src/engine/contracts/primitives.ts`, `src/engine/contracts/npcDefinition.ts` | engine | Additive enum + frozen NPC enum (ADR 0008) |
| Action parsing / validation | `src/engine/core/actions.ts`, `src/engine/core/validation.ts` | engine | `evidence.collect`, `choice.make` |
| Content schema | `src/engine/content/stage3Content.ts` | engine | Add optional `evidence` / `choices` |
| Stage 4 content | `src/content/stage4Content.ts` | narrative | Facts, rules, evidence, choice, dialogue |
| Dispatch | `src/engine/session/gameSession.ts` | engine | Emit existing events, one rule pass |
| World (pure, no Phaser) | `src/world/district.ts`, `movement.ts`, `interaction.ts`, `worldView.ts` | world | Headless-testable |
| Scene | `src/game/DistrictScene.ts`, `src/game/PhaserHost.tsx` | renderer | Reads canonical state, never writes it |
| UI | `src/App.tsx`, `src/ui/*.tsx`, `src/styles.css` | UI | HUD, dialogue, field notes, ledger |
| Composition | `src/session/runtime.ts` | platform | Injects `STAGE4_CONTENT` |
| Tests | `tests/stage4Engine.test.ts`, `tests/worldMovement.test.ts`, `tests/interaction.test.ts`, `tests/worldView.test.ts` | all | See matrix |
| Docs | `docs/STAGE_4_REPORT.md`, ADR 0008, event model, catalogue, checklist, README | docs | |

## Canonical vs presentation state

| State | Owner | Persisted? |
|---|---|---|
| Facts, choices, anchors, events, tick | Engine (`GameSession`) | In-memory save envelope only |
| Player x/y, facing, animation, camera | Phaser scene | No |
| Open dialogue, current line, prompt | React UI | No |
| Evidence card / consequence text | Derived by `deriveWorldView(state)` | No |

## Acceptance test matrix

| Requirement | Test |
|---|---|
| Movement is frame-rate independent | `worldMovement.test.ts` — 60 × 16 ms equals 16 × 62.5 ms within 1 px |
| Collision blocks solid tiles on both axes | Feeds `#` and barrier colliders; asserts no penetration and sliding |
| Camera bounds | Pure bounds helper clamps to world rectangle |
| Interaction range and priority | `interaction.test.ts` — nearest wins, out-of-range returns null |
| Duplicate evidence collection | `stage4Engine.test.ts` — first accepted, second `duplicate`, one fact, counter = 1 |
| Choice idempotency | same option twice → `duplicate`, one choice, one consequence |
| Choice changes a canonical fact | `world.ward_alert` equals `raised` / `suppressed` by option |
| Anchor passes engine validation | `anchor.record` accepted, hash matches state |
| State consistency | `deriveWorldView` equals facts; Phaser reads same getter |
| Stage 3 suite | unchanged tests stay green |

## Milestones

1. Engine actions + content + tests (4.4–4.7 foundations).
2. World modules + tests (4.1–4.4 logic).
3. Phaser district scene, camera, art (4.1–4.3).
4. React HUD, dialogue, ledger (4.4–4.7 UI).
5. Integration, verification, screenshots, report (4.8).
