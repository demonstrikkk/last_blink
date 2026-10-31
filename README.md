# The Last Blink: Second Settlement

Deterministic narrative investigation game. Stages 7-9 are the current slice:
one street in Aster, a three-act investigation with three evidence items, three
consequential decisions and three reachable endings, real BLINK timeline
branching, a bounded deterministic MORROW policy, read-only branch-scoped ECHO
retrieval and scripted NPC cognition for Sable and Ivo.

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
  endings. Gate accepted (`26b1b9d`, `8b03a48`).
- Stage 6: real timeline branching. A BLINK forks from a recorded anchor into a
  separate canonical state, the original timeline is preserved byte-for-byte,
  switching is reversible with verified hashes, ancestry stops at the fork point,
  only scar memory crosses, and comparison is derived from the two canonical
  states. Gate accepted.
- Stage 7: deterministic bounded MORROW policy. Observations are branch-scoped;
  proposals are engine-validated for freshness, ladder reachability, escalation
  ceiling and ending fairness; accepted interventions write three derived facts;
  rejected proposals are audited. No LLM or PPO.
- Stage 8: ECHO read-only retrieval. Typed queries answer only from canonical
  facts, events, choices, anchors and rules in one branch, cite every substantive
  claim and return `unknown` rather than inventing a value. Two timelines can be
  compared only through the explicit comparison query. Combined Stage 7-8 gate
  pending.
- Stage 9: scripted NPC cognition for Sable and Ivo. Each NPC observes only
  permitted fact prefixes on the active branch, submits a deterministic advisory
  no-op proposal through engine validation, and keeps branch-scoped in-memory
  memory with event provenance. No LLM, durable memory or story mutation.

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
7. Press **BLINK** (or the V*N* chip) to open timeline control. Fork from a
   recorded anchor, play the second timeline differently, then switch back: V1
   returns to the exact hash it had when you left it. Compare shows the canonical
   differences between the two.
8. Watch the MORROW callout after evidence and decisions: it reports the posture
   the engine accepted or why it refused a proposal.
9. Press **ECHO** to ask what the record supports: situation, a fact key, a
   decision node, MORROW history, the ending, or an explicit two-timeline
   comparison. Every substantive claim lists its canonical citations.

| Input | Action |
|---|---|
| Arrow keys / WASD | Move |
| E or Space | Interact, advance dialogue, confirm choice |
| 1 / 2 | Select a choice |
| Esc | Close dialogue or an overlay |
| BLINK button | Open timeline control: fork, switch, compare |
| Ledger button | Inspect facts, provenance, lineage, events, hash, save and restart |
| ECHO button | Ask grounded questions over canonical records and citations |
| NPCs button | Inspect Sable and Ivo proposals, fallbacks and branch-scoped memory |

Touch D-pads appear at or below 820 px. The session is in memory: refreshing or
restarting returns the street to its opening state, and the UI says so.

## Layout

```
src/engine/      pure deterministic engine (no React, Phaser, DOM or network)
src/content/     Stage 5 facts, rules, evidence, choices, objectives, endings, dialogue
src/world/       map grid, movement, interaction range, world-view projection
src/game/        Phaser scene and host; renders and reports intents only
src/ui/          dialogue sheet, field notes, ledger, BLINK panel, touch controls
src/session/     browser composition root
src/App.tsx      React shell, dialogue state machine, accessible mirror
tests/           Vitest suites, including determinism and engine-purity scans
docs/            gate evidence, architecture, contract catalogue, event model, ADRs
tools/assets/    preserved asset pipeline
public/assets/   46 curated CC0/OFL files
```

## Branching rules

1. A fork starts at an anchor checkpoint, never at the parent's live state.
2. Forking writes one parent event (`branch.forked`) and does not activate the
   child; `switchBranch` performs activation with no event.
3. A switch is refused, not partially applied, if the target is unknown, already
   active, not retained, or no longer hashes to its record.
4. Only `scar.*` facts asserted after the checkpoint cross a fork.
5. Comparison reads the two canonical states; the UI never diffs its own copy.

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

Stage 9 evidence and limits: `docs/STAGE_9_REPORT.md`.
Stage 9 model: `docs/NPC_COGNITION_MODEL.md`.
Stage 8 evidence and limits: `docs/STAGE_8_REPORT.md`.
Stage 7 evidence and limits: `docs/STAGE_7_REPORT.md`.
MORROW model: `docs/MORROW_POLICY_MODEL.md`.
ECHO model: `docs/ECHO_RETRIEVAL_MODEL.md`.
Stage 6 evidence, commands and known limits: `docs/STAGE_6_REPORT.md`.
Stage 5 evidence: `docs/STAGE_5_REPORT.md`.
Stage 4 slice: `docs/STAGE_4_REPORT.md`.
Stage 3 foundation: `docs/STAGE_3_REPORT.md`.
Causal semantics: `docs/CAUSAL_MODEL.md`.
