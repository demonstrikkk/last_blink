# Causal Model — Stage 5 content, Stage 6 branching

The causal model is the contract between narrative content and canonical state.
Every story outcome is either a fact written by a trusted choice effect or a fact
derived by a rule from facts that already exist. Nothing is driven by wall-clock
time, randomness, renderer state or model output. Stage 6 does not add story
variables; it adds branch scope and an explicit scar channel (§8-9).

Executable source: `src/content/stage5Content.ts` (facts, rules, choices,
objectives, endings). This document explains the semantics for humans.

## 1. Model shape

```
initial facts ──► evidence.collect ──► evidence.* facts ──┐
                                                          ├──► choice.make ──► decision facts
                                                          │                      │
                                                          │                      ▼
                                                          └──────────────► rule pass (one ordered pass)
                                                                                 │
                                                                                 ├──► derived world facts
                                                                                 └──► set_ending ──► story.ending_id
```

- **Inputs** are inert: initial facts, evidence definitions and choice option
  effects. They never read other facts at write time.
- **Derivations** are declarative rules with a closed JSON condition tree.
  Rules see the state as mutated by earlier rules in the same pass, so priority
  order is meaningful.
- **Guards** keep the model stable across the one-pass evaluator: every derived
  rule either tests `not exists` on the fact it writes, or tests an `in`/`neq`
  guard that excludes the value it would write.
- **Endings** are derived like any other fact, plus a `set_ending` effect that
  emits `ending.reached`. The engine keeps the first ending on a branch and
  rejects a conflicting one (ADR 0001).

## 2. Variable catalogue

Every variable is a canonical `Fact`. `kind` is taken from the asserting path;
`source.ref` identifies the producer and is visible in the ledger.

| Fact key | Values | Initial | Kind | Producer | Consumers |
|---|---|---|---|---|---|
| `world.district` | `aster` | `aster` | observed | initial content | HUD, projection |
| `world.curfew` | `active` | `active` | observed | initial content | HUD |
| `story.relay_status` | `sealed` | `sealed` | observed | initial content | HUD |
| `story.phase` | `arrival`, `investigation`, `decision`, `accounting`, `resolved` | `arrival` | observed → derived | phase rules (§3) | HUD, objectives, endings |
| `npc.sable.trust` | `wary`, `trusted` | `wary` | observed → derived | relay decision rule | HUD, consequence panel |
| `world.dispatch_continuity` | `unknown`, `unbroken`, `severed` | `unknown` | observed → derived | delayed dispatch rules | ending rules, HUD |
| `world.vendor_confidence` | `unknown`, `high`, `low` | `unknown` | observed → derived | vendor decision rule | HUD |
| `world.morrow_scrutiny` | `low`, `elevated`, `critical` | `low` | observed → derived | scrutiny rules | ending rules, HUD |
| `evidence.relay_7` | record object | absent | observed | `evidence.collect` | dispatch prerequisite, phase |
| `evidence.ward_dispatch` | record object | absent | observed | `evidence.collect` | continuity rules, testimony prerequisite |
| `evidence.vendor_testimony` | testimony object | absent | observed | `evidence.collect` (via Ivo script) | vendor decision prerequisite |
| `story.relay_ready` | `true` | absent | derived | `rul_relay_log_recovered` | audit only |
| `story.relay_choice` | `share`, `conceal` | absent | asserted | `node.sable.relay` option | relay + scrutiny + continuity rules |
| `story.relay_choice_resolved` | `true` | absent | asserted | `node.sable.relay` option | phase, ward-call prerequisite |
| `story.vendor_choice` | `protect`, `name` | absent | asserted | `node.vendor.silence` option | vendor + scrutiny rules |
| `story.vendor_choice_resolved` | `true` | absent | asserted | `node.vendor.silence` option | phase, ward-call prerequisite |
| `story.ward_call` | `file`, `bury` | absent | asserted | `node.ward.call` option | phase, ending rules |
| `story.ward_call_resolved` | `true` | absent | asserted | `node.ward.call` option | audit/objective only |
| `story.ending_id` | ending ID | absent | derived | ending rule | `set_ending`, projection, HUD |
| `npc.sable.stance` | `relieved`, `guarded` | absent | derived | relay decision rule | HUD, consequence panel |
| `npc.ivo.stance` | `protected`, `exposed` | absent | derived | vendor decision rule | ending rules, HUD |
| `world.ward_alert` | `raised`, `suppressed` | absent | derived | relay decision rule | HUD, consequence text |

Provenance rules:

- Evidence facts keep the evidence definition's `sourceRef`
  (`record.relay_7.terminal`, `record.ward.dispatch_board`,
  `testimony.ivo.stall`), `source.kind` (`record` / `testimony`) and declared
  `confidence` (0.90 / 0.95 / 0.80).
- Choice effect facts are `asserted` by the `choice.made` action; their
  `sourceEventId` is the asserting fact event.
- Derived facts carry `source.kind: 'derived'` and `source.ref:
  'rule.<ruleId>'`, which is what the ledger prints.

## 3. Phase progression (monotonic)

| Rule | Priority | Condition (abridged) | Writes |
|---|---|---|---|
| `rul_phase_investigation` | 92 | phase `in [arrival]` ∧ `evidence.relay_7` exists | `investigation` |
| `rul_phase_decision` | 93 | phase `in [arrival, investigation]` ∧ `story.relay_choice_resolved` | `decision` |
| `rul_phase_accounting` | 94 | phase `in [arrival, investigation, decision]` ∧ `story.vendor_choice_resolved` | `accounting` |
| `rul_phase_resolved` | 95 | phase `in [arrival, investigation, decision, accounting]` ∧ `story.ward_call` | `resolved` |

Because each rule lists only earlier phases in its `in` guard, a lower rule can
never overwrite a higher phase within the pass, and later passes cannot regress
it. Higher priority runs first, so the furthest reachable phase wins in a single
pass.

`story.phase` is presentation-facing progress, not a gate: all gating is done by
the prerequisite lists in §6.

## 4. Decisions and immediate effects

| Node | Option | Asserted facts | Derived by rules |
|---|---|---|---|
| `node.sable.relay` | `share` | `story.relay_choice=share`, `story.relay_choice_resolved=true` | `world.ward_alert=raised`, `npc.sable.stance=relieved`, `npc.sable.trust=trusted` |
| `node.sable.relay` | `conceal` | `story.relay_choice=conceal`, `…resolved=true` | `world.ward_alert=suppressed`, `npc.sable.stance=guarded`, `npc.sable.trust=wary` |
| `node.vendor.silence` | `protect` | `story.vendor_choice=protect`, `…resolved=true` | `npc.ivo.stance=protected`, `world.vendor_confidence=high`, scrutiny by §5 |
| `node.vendor.silence` | `name` | `story.vendor_choice=name`, `…resolved=true` | `npc.ivo.stance=exposed`, `world.vendor_confidence=low`, `world.morrow_scrutiny=critical` |
| `node.ward.call` | `file` | `story.ward_call=file`, `…resolved=true` | ending by §7 |
| `node.ward.call` | `bury` | `story.ward_call=bury`, `…resolved=true` | `ending.sealed_street` |

The immediate rule for each decision is guarded by `not exists` on the fact it
writes, so it fires exactly once even though the rule pass reruns after every
accepted action.

## 5. Delayed effects

Stage 5 needs a consequence that is caused by an early decision but becomes
observable only after a later discovery. It is implemented as a milestone
trigger, never a timer.

| Rule | Priority | Condition | Writes |
|---|---|---|---|
| `rul_dispatch_unbroken` | 75 | `evidence.ward_dispatch` exists ∧ `story.relay_choice=share` ∧ `world.dispatch_continuity=unknown` | `unbroken` |
| `rul_dispatch_severed` | 75 | `evidence.ward_dispatch` exists ∧ `story.relay_choice=conceal` ∧ `world.dispatch_continuity=unknown` | `severed` |

Sequence:

1. The player decides share/conceal. `world.dispatch_continuity` stays `unknown`
   because the slip does not exist yet — the rule cannot match.
2. The player recovers the ward dispatch slip. Its evidence fact appears, the
   rule pass reruns, and continuity resolves from the earlier decision.
3. The `unknown` guard makes the derivation single-shot: later ticks and actions
   cannot rewrite it (`tests/stage5Engine.test.ts`, "does not re-derive the
   delayed fact on later ticks").

`world.morrow_scrutiny` is the second interaction effect and depends on two
decisions in sequence:

| Rule | Condition (abridged) | Writes |
|---|---|---|
| `rul_scrutiny_critical` | vendor `name` ∧ scrutiny ≠ `critical` | `critical` |
| `rul_scrutiny_elevated` | vendor `protect` ∧ relay `share` ∧ scrutiny ≠ `elevated` | `elevated` |
| `rul_scrutiny_low` | vendor `protect` ∧ relay `conceal` ∧ scrutiny ≠ `low` | `low` |

`critical` runs at the same priority as the others but only matches when Ivo was
named, so the three outcomes are mutually exclusive for a completed path.

## 6. Prerequisites (gating)

Prerequisites are declarative content data on evidence definitions and choice
nodes. `validateAction` checks them before any event is built:

| Subject | Requires | Rejection |
|---|---|---|
| `evidence.ward_dispatch` | `evidence.relay_7` | `invalid_action`, `details.missing: ['evidence.relay_7']` |
| `evidence.vendor_testimony` | `evidence.relay_7`, `evidence.ward_dispatch` | `invalid_action` with the full missing list |
| `node.sable.relay` | `evidence.relay_7` | `invalid_action`, `details.missing: ['evidence.relay_7']` |
| `node.vendor.silence` | `evidence.vendor_testimony` | `invalid_action` |
| `node.ward.call` | `story.relay_choice_resolved`, `story.vendor_choice_resolved` | `invalid_action` |

Properties:

- Rejections are audited (`action.rejected`) and change no world fact; the state
  hash still advances so refusals are replayable.
- The duplicate guard runs before the prerequisite check, so a committed decision
  reports `duplicate`, not `invalid_action`.
- The UI reads the same lists through `deriveWorldView`, so a locked decision
  shows exactly the keys the engine would demand. The engine remains the
  authority: hiding a button is presentation, not enforcement.
- Sable's conversation is *not* gated; her decision is. The player hears her out,
  then the sheet explains the missing evidence. This is the intentional resolution
  of the Stage 4 narrative concern.

## 7. Endings

| Rule | Priority | Condition | Ending |
|---|---|---|---|
| `rul_ending_sealed_street` | 52 | `story.ward_call=bury` ∧ no `story.ending_id` | `ending.sealed_street` |
| `rul_ending_open_record` | 51 | `story.ward_call=file` ∧ continuity `unbroken` ∧ Ivo `protected` ∧ no ending | `ending.open_record` |
| `rul_ending_ward_inquiry` | 50 | `story.ward_call=file` ∧ (continuity `severed` ∨ Ivo `exposed` ∨ scrutiny `critical`) ∧ no ending | `ending.ward_inquiry` |

Reachability over the six decision combinations (the ward call is always the
last action):

| Relay | Vendor | Call | Continuity | Ivo | Scrutiny | Ending |
|---|---|---|---|---|---|---|
| share | protect | file | unbroken | protected | elevated | `ending.open_record` |
| share | name | file | unbroken | exposed | critical | `ending.ward_inquiry` |
| conceal | protect | file | severed | protected | low | `ending.ward_inquiry` |
| conceal | name | file | severed | exposed | critical | `ending.ward_inquiry` |
| any | any | bury | n/a | n/a | n/a | `ending.sealed_street` |

No ending can appear before `story.ward_call` exists, and no second ending is
accepted on a branch. All three are covered by tests, including the two
`ward_inquiry` causes and the four `sealed_street` combinations.

## 8. Invariants

1. Every fact is written by exactly one producer path (content initial fact,
   evidence definition, choice effect, or a single rule).
2. Every rule that writes a mutable variable is guarded so it cannot fire twice.
3. A decision writes its own decision facts; it never writes the world facts it
   is judged by.
4. Prerequisites are checked by the engine before events, not by the renderer.
5. Ending selection is a function of facts, not of which button the player
   pressed last.
6. The rule pass is one ordered pass with no fixpoint, no clock and no
   randomness, so a given action sequence always produces the same facts, the
   same event log and the same state hash.
7. Facts, choices and anchors belong to the branch that produced them. A fork
   starts from the parent's checkpoint state, so no post-checkpoint fact can
   influence the child.
8. Scar memory is the only channel across a fork: a `scar.*` fact asserted after
   the checkpoint is re-asserted once on the child with
   `source.ref: scar.carry:<key>`. Derived story facts never cross; the child
   re-derives them from its own actions.

## 9. Branching and outcomes

A timeline is a branch, and every rule above is evaluated inside one branch.

- A fork at an anchor gives the child exactly the facts, choices and anchors that
  existed at the checkpoint. Later parent evidence, decisions and endings are
  invisible to it, so the same rules can reach a different ending in the child.
- Switching timelines changes only which canonical state the session presents. It
  does not re-run rules, so it cannot change any outcome.
- Comparison is a diff of two canonical states: facts present in one only,
  changed fact values, per-node decisions, endings, event overlap and scars. It is
  a read, never a second model of the story.
- A carried scar can influence the child because it is a fact like any other; that
  is its purpose. It cannot smuggle a derived outcome, because only `scar.*` keys
  cross.

## 9a. MORROW and ECHO

MORROW reads the same canonical facts the player sees, plus the branch event
shape, and proposes a bounded response. It cannot assert facts directly: the
engine validates the ladder and writes `morrow.response`,
`morrow.last_proposal` and `morrow.escalation` only after an accepted
intervention. Escalation is monotonic and capped at 3; an ending permits only
release or observe. Rejected proposals are audited and are causally inert.

ECHO adds no causal edges. It reads facts, events, choices, anchors, rules and
branch summaries, and reports what they support. A claim without a citation is
either `inference` (an expectation about a not-yet-recorded consequence) or
`unavailable`; it is never presented as a recorded fact. ECHO cannot see a
post-fork parent fact from a child branch, and comparison is an explicit read of
two canonical states.

## 10. Adding a variable

1. Add the initial fact (or the producer that writes it) to
   `src/content/stage5Content.ts`.
2. Add the rule with an explicit `not exists` / value guard; choose priority so
   it runs after the facts it reads.
3. Add the consumer to `WorldView` and the surfaces that should show it.
4. Add a test for the value, its provenance and its single-shot behaviour.
5. Update the table in §2 and, if it affects outcomes, §7.
