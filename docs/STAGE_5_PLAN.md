# Stage 5 Plan — Narrative and Causal Systems

Status: approved scope, implementation in progress.
Baseline: Stage 4 at `96e627a`, 67/67 tests, working tree clean.

## 1. Objective

Turn the playable Relay Street slice into a coherent investigation whose
outcomes are produced by a documented, deterministic causal model. No new AI
systems, no BLINK switching, no database.

## 2. Narrative structure

One night in Aster. Three acts, one street.

| Act | Beat | Canonical trigger |
|---|---|---|
| I — The gap | Read the Relay 7 maintenance log. Sable will not discuss what to do with it until the player has read it. | `evidence.relay_7` |
| II — The chain | Recover the ward dispatch slip, then hear Ivo's account at his stall. Decide whether to share or conceal the log. | `evidence.ward_dispatch`, `evidence.vendor_testimony`, `story.relay_choice_resolved` |
| III — The accounting | Decide whether Ivo is named. Make the ward call from the street call-box. | `story.vendor_choice_resolved`, `story.ward_call` |

The Stage 4 concern is resolved intentionally: **Sable's share/conceal choice is
hard-gated on `evidence.relay_7`**. The conversation is still available, but the
decision node refuses to open until the player has inspected the evidence. This
makes the game test evidence-informed decisions rather than intuition, and the
blocked dialogue explains why.

## 3. Evidence chain and provenance

| Evidence | Target | Fact | Source kind | Requires | Confidence |
|---|---|---|---|---|---|
| Relay 7 log | North kerb terminal | `evidence.relay_7` | `record` | — | 0.90 |
| Ward dispatch slip | North walk board | `evidence.ward_dispatch` | `record` | `evidence.relay_7` | 0.95 |
| Ivo's testimony | Ivo, south walk stall | `evidence.vendor_testimony` | `testimony` | `evidence.relay_7`, `evidence.ward_dispatch` | 0.80 |

Every evidence fact stores `sourceEventId`, `source.kind`, `source.ref` and
`confidence`. Derived facts store the rule ID as `source.ref`. No fact is
written from UI input; action payloads only name a content ID.

## 4. Canonical causal variable catalogue

Full definitions, transitions and consumers live in `docs/CAUSAL_MODEL.md`.

| Variable | Values | Producer |
|---|---|---|
| `world.ward_alert` | `raised`, `suppressed` | share/conceal rule |
| `npc.sable.stance` | `relieved`, `guarded` | share/conceal rule |
| `npc.sable.trust` | `wary`, `trusted` | share/conceal rule |
| `world.dispatch_continuity` | `unknown`, `unbroken`, `severed` | delayed rule once the dispatch slip exists |
| `npc.ivo.stance` | `protected`, `exposed` | vendor decision rule |
| `world.vendor_confidence` | `unknown`, `high`, `low` | vendor decision rule |
| `world.morrow_scrutiny` | `low`, `elevated`, `critical` | vendor decision + earlier relay choice |
| `story.phase` | `arrival`, `investigation`, `decision`, `accounting`, `resolved` | monotonic phase rules |
| `story.ending_id` | ending ID | ending rules |

## 5. Decisions and delayed effects

| Node | Options | Requires | Immediate | Delayed |
|---|---|---|---|---|
| `node.sable.relay` | share / conceal | `evidence.relay_7` | ward alert, Sable stance/trust | dispatch continuity changes only after the slip is recovered |
| `node.vendor.silence` | protect / name | `evidence.vendor_testimony` | Ivo stance, vendor confidence | MORROW scrutiny depends on the relay choice made earlier |
| `node.ward.call` | file / bury | both decisions resolved | ending rule | — |

The "delayed" effect is milestone-triggered, not wall-clock-triggered: the
dispatch-continuity rule cannot fire until a later evidence collection inserts
`evidence.ward_dispatch`. This keeps replay deterministic and every effect
attributable to an event.

## 6. Endings

| Ending | Condition |
|---|---|
| `ending.open_record` | call = file, continuity = unbroken, Ivo = protected |
| `ending.sealed_street` | call = bury |
| `ending.ward_inquiry` | call = file, and continuity = severed or Ivo = exposed or scrutiny = critical |

All three are reachable and covered by tests. The engine still rejects a second,
conflicting ending on the same branch.

## 7. Implementation steps

1. Additive content schema: optional `requires` on evidence and choice nodes,
   `sourceKind` on evidence, `objectives` and `endings` metadata.
2. Enforce prerequisites in `validateAction` with the existing `invalid_action`
   code (no rejection or contract change).
3. Add `STAGE5_CONTENT` and `stage5Dialogue.ts`.
4. Extend the street: dispatch board, Ivo, ward call-box; update targets,
   projection and scene.
5. Extend the React surfaces: objectives, provenance, causal state, gated
   dialogue, ending panel, multi-NPC script selection.
6. Add Stage 5 tests; keep Stage 3 and Stage 4 suites untouched and green.
7. Rebuild, drive the full path in headless Chrome at desktop and narrow widths,
   capture screenshots, write the report, update docs and ADR, commit.

## 8. Acceptance tests

- Evidence facts carry provenance and confidence.
- Each prerequisite rejection is explicit and leaves facts unchanged.
- Delayed dispatch-continuity effects apply only after the slip exists.
- Relationship, stance and scrutiny rules derive the documented values.
- Phase progresses monotonically.
- All three endings are reachable; no ending appears before the ward call.
- A second ending is rejected by the engine.
- Full path replays deterministically from the same seed.
- Rule provenance is visible in the event log and ledger.
- Stage 3 and Stage 4 tests remain green.

## 9. Out of scope

LLMs, MORROW adaptive policy/PPO, BLINK switching, scar memory, YugabyteDB,
Meko, persistence, and multi-branch timelines.
