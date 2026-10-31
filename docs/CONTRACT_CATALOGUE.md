# Contract Catalogue — v1.0.0

Fifteen contracts are frozen for Stage 3 and remain unchanged in Stages 4 and 5.
Every contract has one TypeScript type, one Zod schema, one owner, one version
and two fixtures (valid and invalid).
`src/engine/contracts/registry.ts` is the executable source of truth; this
document explains it for humans.

## Conventions

- **Version.** Every contract carries `schemaVersion: "1.0.0"`. The literal is
  the same value as `CONTRACT_VERSION`.
- **Strict objects.** Unknown keys fail validation. Nothing is silently stripped.
- **Nullable is not optional.** A nullable field must be present. In v1 the only
  optional property is `Rule.condition.value` for `fact` conditions.
- **Branded IDs.** IDs are prefixed and validated by regex:
  `ses_`, `evt_`, `fct_`, `cho_`, `rul_`, `anc_`, `brn_`, `npc_`, `obs_`,
  `prp_`, `act_`, `mem_`, `mft_`, `ply_`, `sav_`.
- **Actor IDs.** `player_*`, `npc_*` or `system_*`.
- **Source IDs.** Dotted, e.g. `engine.core`, `input.player`, `policy.npc`.
- **Fact keys.** Namespaced, at least one dot, e.g. `debug.counter`,
  `evidence.relay_7`.
- **Fixtures.** `src/engine/contracts/fixtures.ts`; exercised by
  `tests/contracts.test.ts`.

## Ownership

| Contract | Owner | Reason |
|---|---|---|
| GameEvent | engine | ordering, provenance and replay |
| GameState | engine | canonical world state |
| Fact | engine | truth and source rules |
| Choice | narrative | narrative nodes and options |
| Rule | engine | deterministic consequences |
| Anchor | engine | BLINK checkpoints |
| Branch | engine | timeline identity and ancestry |
| NpcDefinition | ai-runtime | character goals and permissions |
| NpcObservation | ai-runtime | perception filtering |
| NpcDecisionProposal | ai-runtime | untrusted model output |
| ActionResult | engine | accept/reject record |
| SaveEnvelope | persistence | versioned storage |
| PlayerProfile | narrative | identity, consent, progress |
| MemoryRecord | ai-runtime | character memory with provenance |
| ModelManifest | platform | model/policy provenance |

A contract change requires the owner's review plus updates to the schema, this
catalogue, the fixture pair and any migration note.

## 1. GameEvent

A discriminated union on `type`. Ten variants exist in v1.

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | literal |
| eventId | `evt_*` | yes | deterministic, unique per session |
| sessionId | `ses_*` | yes | must match state |
| branchId | `brn_*` | yes | must match current branch |
| sequenceNo | positive int | yes | equals `stateVersion` in v1 |
| stateVersion | non-negative int | yes | `previous + 1` |
| tick | non-negative int | yes | game tick, not wall clock |
| type | enum | yes | see payload table |
| actorId | `player_*` / `npc_*` / `system_*` | yes | who caused it |
| sourceId | dotted string | yes | `engine.core`, `engine.rules`, `input.player`… |
| actionId | `act_*` or null | yes | nullable for bootstrap/rule events |
| occurredAt | ISO 8601 | yes | from `ClockPort` |
| idempotencyKey | 8–128 chars | yes | replay/dedupe key |
| payload | strict object | yes | shape depends on `type` |

### Event payloads

| `type` | Payload |
|---|---|
| `session.started` | `contentId`, `gameVersion`, `seed` |
| `tick.advanced` | `fromTick`, `toTick`, `reason: manual \| timed` |
| `fact.asserted` | `fact: Fact` (source event must equal this event) |
| `choice.made` | `choice: Choice` |
| `rule.evaluated` | `ruleId`, `matched`, `assertedFactKeys[]` |
| `anchor.recorded` | `anchor: Anchor` |
| `branch.forked` | `branch: Branch`, `fromAnchorId` |
| `npc.proposal.evaluated` | `proposalId`, `npcId`, `status`, `reasonCode` |
| `ending.reached` | `endingId`, `summary`, `factKeys[]` |
| `action.rejected` | `actionType`, `code`, `message`, `proposalId` |

**Validation.** Prefixes, ISO timestamps, positive sequence, strict payloads and
no unknown keys. Cross-object rules (session/branch match, source event identity,
anchor hash) are enforced by the reducer because they depend on state.

**Fixture pair.** Valid: `tick.advanced` at version 2. Invalid: malformed
`eventId`.

## 2. GameState

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | literal |
| sessionId | `ses_*` | yes | |
| branchId | `brn_*` | yes | current timeline |
| stateVersion | non-negative int | yes | number of applied events |
| tick | non-negative int | yes | |
| contentId | 1–80 chars | yes | content bundle identity |
| gameVersion | semver | yes | |
| seed | 1–80 chars | yes | deterministic session seed |
| facts | record keyed by fact key | yes | values are `Fact` |
| choices | `Choice[]` (≤512) | yes | |
| anchors | `Anchor[]` (≤256) | yes | current branch only |
| branches | `Branch[]` (1–64) | yes | lineage, includes current |
| player | `PlayerProfile` | yes | |
| endingId | 1–64 chars or null | yes | first ending wins |
| lastEventId | `evt_*` or null | yes | null only at version 0 |
| rngCursor | non-negative int | yes | reserved deterministic PRNG position |

**Validation.** Current branch must exist. Facts must match their map key, belong
to the current branch and not be acquired in the future. Choices and anchors must
be in session/branch scope.

**Fixture pair.** Valid: version 2 with one fact. Invalid: map key says
`debug.counter`, fact says `debug.other`.

## 3. Fact

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| factId | `fct_*` | yes | unique across state |
| key | namespaced key | yes | map key must match |
| value | JSON | yes | finite numbers only |
| kind | `observed \| asserted \| derived` | yes | |
| confidence | 0–1 | yes | |
| sourceEventId | `evt_*` | yes | must equal the asserting event |
| branchId | `brn_*` | yes | |
| acquiredAtTick | int | yes | equals state tick when asserted |
| source | `{kind, ref}` | yes | `asset`, `record`, `testimony`, `derived`, `system` |

Evidence is a fact namespace (`evidence.*`) rather than a separate contract. See
ADR 0004.

**Fixture pair.** Valid: `debug.counter = 1`. Invalid: confidence `1.5`.

## 4. Choice

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| choiceId | `cho_*` | yes | unique per branch |
| sessionId | `ses_*` | yes | |
| branchId | `brn_*` | yes | |
| nodeId | 1–64 chars | yes | narrative node |
| optionId | 1–64 chars | yes | selected option |
| madeAtTick | int | yes | |
| sourceEventId | `evt_*` | yes | must equal the event |
| consequenceKeys | string[] ≤32 | yes | expected affected facts |

**Fixture pair.** Valid: one committed choice. Invalid: `consequenceKeys` is a
string instead of an array.

## 5. Rule

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| ruleId | `rul_*` | yes | |
| description | 1–280 chars | yes | |
| priority | −100…100 | yes | higher first; ties by rule ID |
| enabled | boolean | yes | disabled rules are skipped |
| condition | Condition | yes | closed JSON tree |
| effects | Effect[] 1–8 | yes | |

Condition variants:

- `{ kind: "all", of: Condition[] }`
- `{ kind: "any", of: Condition[] }`
- `{ kind: "not", of: Condition }`
- `{ kind: "fact", key, op, value? }` with `op` of `eq`, `neq`, `gte`, `lte`,
  `in`, `exists`. `exists` must omit `value`; every other operator must include
  it.

Effects: `assert_fact {key, value, confidence, sourceRef}` or
`set_ending {endingId}`.

**Fixture pair.** Valid: gte-with-not-exists tree. Invalid: `exists` with a value.

## 6. Anchor

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| anchorId | `anc_*` | yes | |
| sessionId / branchId | branded | yes | |
| label | 1–60 chars | yes | |
| tick | int | yes | |
| stateVersion | int | yes | version of the checkpointed state |
| stateHash | 16 hex | yes | hash of the pre-anchor state |
| eventSequenceNo | int | yes | recording event sequence |
| safe | boolean | yes | unsafe anchors cannot be forked |
| sourceEventId | `evt_*` | yes | |
| createdAt | ISO | yes | |

**Semantics.** The hash and version describe the state *before* the
`anchor.recorded` event, because the anchor is stored inside the post-event state.
The reducer recomputes the hash and rejects a mismatch.

**Fixture pair.** Valid: safe anchor at tick 1. Invalid: empty label.

## 7. Branch

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| branchId | `brn_*` | yes | |
| sessionId | `ses_*` | yes | |
| parentBranchId | `brn_*` or null | yes | null only for the root |
| forkedAtAnchorId | `anc_*` or null | yes | required for children |
| forkedAtTick | int or null | yes | required for children |
| forkedAtStateVersion | int or null | yes | required for children |
| label | 1–60 chars | yes | |
| status | `active \| archived` | yes | |
| timelineIndex | non-negative int | yes | sequential from 0 |
| createdAt | ISO | yes | |

**Validation.** A root has no fork metadata; a child must have all three fork
fields. Stage 3 records forks but does not switch the active branch.

**Fixture pair.** Valid: root branch. Invalid: parent set with no fork anchor.

## 8. NpcDefinition

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| npcId | `npc_*` | yes | |
| displayName | 1–60 chars | yes | |
| role | 1–80 chars | yes | |
| goals | 1–5 `{goalId, description, priority 1–5}` | yes | |
| knowledgeScopes | string[] 1–12 | yes | allowed fact-key prefixes |
| permissions | object | yes | see below |
| memoryNamespace | slug | yes | isolation boundary |
| modelManifestId | `mft_*` or null | yes | null for scripted |
| voice | `{register, speechRate 0.5–2}` | yes | presentation only |

Permissions: `observableFactPrefixes[]`, `allowedActionTypes[]` (Stage 3 action
enum) and `mayProposeOnly: true` as a literal. No content file can grant direct
state access.

**Fixture pair.** Valid: archivist with `evidence.` scope. Invalid:
`mayProposeOnly: false`.

## 9. NpcObservation

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| observationId | `obs_*` | yes | |
| npcId / sessionId / branchId | branded | yes | |
| tick / stateVersion | int | yes | |
| visibleFacts | ≤200 `{factId, key, value, confidence}` | yes | already filtered |
| recentEventIds | `evt_*[]` ≤32 | yes | perception window |
| perceptionHash | 16 hex | yes | canonical observation hash |
| modelManifestId | `mft_*` or null | yes | |
| createdAt | ISO | yes | |

The schema constrains shape; the future cognition runtime must filter facts by
`NpcDefinition.permissions`. The engine never sends the full state to a model.

**Fixture pair.** Valid: one visible fact. Invalid: negative tick.

## 10. NpcDecisionProposal

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| proposalId | `prp_*` | yes | |
| npcId / observationId / sessionId / branchId | branded | yes | provenance |
| tick | int | yes | |
| proposedActions | 1–4 `{actionType, targetId, params}` | yes | untrusted |
| rationale | 1–600 chars | yes | human inspection |
| confidence | 0–1 | yes | not authority |
| modelManifestId | `mft_*` or null | yes | |
| requiresValidation | `true` | yes | literal |
| createdAt | ISO | yes | |

**Fixture pair.** Valid: one observe-only proposal. Invalid:
`requiresValidation: false`.

## 11. ActionResult

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| actionId | `act_*` | yes | |
| sessionId / branchId | branded | yes | |
| actorId / sourceId | branded | yes | |
| actionType | enum | yes | |
| proposalId | `prp_*` or null | yes | future NPC proposals |
| status | `accepted \| rejected` | yes | |
| tick / stateVersion | int | yes | after produced events |
| eventIds | `evt_*[]` ≤16 | yes | includes the audit event on rejection |
| rejection | object or null | yes | required iff rejected |
| resultingStateHash | 16 hex | yes | |
| createdAt | ISO | yes | |

Rejection codes: `invalid_action`, `unknown_action`, `policy_denied`,
`stale_state`, `unknown_target`, `duplicate`, `engine_error`.

`details` is a JSON object whose content is code-specific. Stage 5 uses
`invalid_action` with `details.missing: [factKey, …]` for unmet evidence or
decision prerequisites; no new code was added (ADR 0009).

**Fixture pair.** Valid: accepted tick advance. Invalid: rejected status without a
rejection object.

## 12. SaveEnvelope

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| saveFormatVersion | `1` | yes | literal; future formats rejected |
| saveId | `sav_*` | yes | |
| gameVersion | semver | yes | |
| sessionId | `ses_*` | yes | must equal payload session |
| savedAt | ISO | yes | |
| engineStateHash | 16 hex | yes | must equal canonical payload hash |
| contractVersions | record name → `"1.0.0"` | yes | all 15 expected |
| payload | GameState | yes | |
| checksum | 16 hex | yes | covers every other field |

Restore checks schema, format, known contract set, versions, checksum and state
hash. See `docs/EVENT_MODEL.md` §7.

**Fixture pair.** Valid: format 1. Invalid: format 2.

## 13. PlayerProfile

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| playerId | `ply_*` | yes | |
| displayName | 1–40 chars | yes | |
| createdAt | ISO | yes | |
| consent | `{telemetry, npcMemory}` | yes | booleans, default false |
| behaviouralSignals | `{explorationStyle, decisionLatencyBand}` | yes | coarse bands only |
| progress | `{choicesMade, evidenceFound, anchorsReached}` | yes | non-negative |

Signals are self-declared bands (`unknown`, `cautious`, `thorough`, `direct`;
`unknown`, `fast`, `measured`, `deliberate`), not raw telemetry. Consent defaults
to false in both adapters.

**Fixture pair.** Valid: complete profile. Invalid: blank display name.

## 14. MemoryRecord

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| memoryId | `mem_*` | yes | |
| npcId / sessionId / branchId | branded | yes | isolation scope |
| kind | `episodic \| semantic \| preference` | yes | |
| content | 1–2000 chars | yes | |
| provenance | `{sourceEventIds 1–32, sourceMemoryIds 0–16}` | yes | mandatory evidence |
| createdAtTick | int | yes | |
| importance | 0–1 | yes | |
| expiresAtTick | int or null | yes | must be after creation |
| visibility | `private \| shared` | yes | |
| modelManifestId | `mft_*` or null | yes | |
| tags | slug[] ≤8 | yes | |

A memory without at least one source event is invalid. This prevents the NPC
runtime from inventing history.

**Fixture pair.** Valid: episodic memory with one source event. Invalid: expiry at
or before creation.

## 15. ModelManifest

| Field | Type | Required | Notes |
|---|---|---|---|
| schemaVersion | `"1.0.0"` | yes | |
| manifestId | `mft_*` | yes | |
| policyId | slug | yes | |
| policyKind | `scripted \| llm \| ppo_onnx \| morrow` | yes | |
| version | semver | yes | |
| provider | 1–60 chars | yes | |
| modelId | 1–120 chars or null | yes | required for `llm` |
| promptVersion | string or null | yes | |
| seed | safe int or null | yes | |
| deterministic | boolean | yes | true for scripted/PPO |
| capabilities | string[] ≤16 | yes | |
| createdAt | ISO | yes | |
| notes | string or null | yes | |

**Fixture pair.** Valid: deterministic scripted policy. Invalid: scripted policy
declared non-deterministic.

## Stage 3–5 action vocabulary

Actions are not a frozen contract yet; they are the engine's accepted inputs for
this stage. `gameActionSchema` requires `actionType`, `actorId` and `params`.

| Action | Params | Effect |
|---|---|---|
| `session.noop` | none | accepted, no events (probe/telemetry) |
| `session.advance_tick` | `ticks` 1–10 | `tick.advanced`, then rules |
| `fact.assert` | `key` (`debug.*` only), `value`, `kind`, `sourceRef` | `fact.asserted`, then rules |
| `anchor.record` | `label` | `anchor.recorded` (one per tick) |
| `branch.fork` | `anchorId`, `label` | `branch.forked` (safe, unforked anchor) |
| `evidence.collect` | `evidenceId` from trusted content | `fact.asserted` for the declared fact, then rules; `duplicate` on repeat |
| `choice.make` | `nodeId`, `optionId` from trusted content | `choice.made` + declared `fact.asserted` effects, then rules; `duplicate` on repeat |

Stage 4 added the last two additively (ADR 0008): event payloads, contract
versions and the fifteen frozen contracts are unchanged. `npcDefinition` and
`npcDecisionProposal` deliberately use a narrower `npcActionTypeSchema` (the
original five actions), so NPC contracts do not accept player-only actions.

`gameContentSchema` gained optional `evidence` and `choices` arrays. Each entry
declares the fact keys, values, labels and consequence keys a trusted content
bundle may write. Action parameters can only reference those IDs.

Stage 5 extended the same content schema additively (ADR 0009), again without a
version bump:

| Field | Default | Meaning |
|---|---|---|
| `evidence[].sourceKind` | `record` | `record` / `testimony` / `asset`; copied to `Fact.source.kind` |
| `evidence[].requires` | `[]` | fact keys required before collection |
| `choices[].requires` | `[]` | fact keys required before a decision |
| `objectives[]` | `[]` | `objectiveId`, `label`, `detail`, `requires[]`; derived completion, not stored |
| `endings[]` | `[]` | `endingId`, `title`, `summary`; presentation metadata for rule-owned endings |

All new fields have Zod defaults, so a Stage 4 content bundle still parses. The
engine enforces `requires`; `objectives` and `endings` are read only by the
projection. `story.*` and `npc.*` actions remain future work.

## Versioning rules

- Patch: comments, docs, fixture additions; no schema change.
- Minor: additive optional field with a default; readers accept both.
- Major: rename, removal, type change, new required field, new enum value that
  old readers cannot interpret.
- Every change updates `CONTRACT_VERSION` for the affected contract, this
  catalogue, the fixture pair and a migration note.
- Saves are rejected when any contract version differs. A future migration must
  be explicit and tested; no silent coercion.
