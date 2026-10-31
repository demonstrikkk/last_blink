# Repository Baseline Report

**Date:** 2026-10-31  
**Stage:** 0–2 execution start  
**Status:** Baseline captured before any application code was written.

## 1. What exists

| Item | State |
|---|---|
| Repository | Not a Git repository at inspection time |
| Source code | None |
| Package manifest / lockfile | None |
| Tests | None |
| Build tooling | None |
| Deployment files | None |
| Design documents | `THE_LAST_BLINK_Complete_Game_Design_and_Technical_Blueprint.docx` (v1.0, 30 Oct 2026) |
| Architecture proposal | `THE_LAST_BLINK_AGENTIC_NPC_ARCHITECTURE_AND_TEAM_PLAN.md` (v0.1, 31 Oct 2026) |
| Existing assets | None |
| Existing saves or data | None |

## 2. Environment

| Tool | Version / result |
|---|---|
| OS | Windows (PowerShell 5.1) |
| Node.js | v22.15.0 |
| npm | 11.7.0 |
| Python | 3.11.15 |
| Pillow | 12.3.0 |
| ffprobe / ffmpeg | 8.1-full_build |
| Git | Installed, but the working folder was not a repository |
| Network | Reachable (Kenney, OpenGameArt, GitHub raw verified) |

## 3. Deadline interpretation

No deadline is recorded in the repository. Per the execution authorisation, this is treated as a **multi-day build**, not an artificially compressed 8.5-hour hackathon. The 8.5-hour figure remains the documented hackathon ship line, not the current delivery constraint.

## 4. Document conflicts already resolved

| Conflict | Resolution |
|---|---|
| Blueprint: static browser game, no LLM. Agentic plan: Node + YugabyteDB + LLM NPCs. | Track A ships the deterministic game; Track B is architecture-ready but runtime-gated. |
| Event shape differs between documents. | One superset `GameEvent` contract with `schemaVersion`, `eventId`, `branchId`, `sequenceNo`, `stateVersion`, `tick`, `type`, `actorId`, `sourceId`, `actionId`, `payload`, `occurredAt`, `idempotencyKey`. |
| Four main choices vs “six meaningful choices”. | Four main choices plus two route/rewind decisions. |
| Four endings defined, scope lock says two. | Four convergent outcomes in one ordered decision table. |
| Map 96×72 vs 8.5-hour build. | 64×48 MVP district, four connected zones; expand only if ahead of schedule. |
| Team of six workstreams vs 2–3 people. | Three people, six responsibilities via RACI. |

## 5. Current risk picture

| Risk | Status | Mitigation |
|---|---|---|
| Asset source rate limits (itch.io returned 429) | Observed | Prefer direct CC0 sources; document blocked sources and use verified alternatives. |
| Character pack with authored walk animation | Resolved candidate found | Use ansimuz top-down pack (CC0, animated NPC frames); reject static Kenney character pack for final animation. |
| Visual mismatch between environment and characters | Open | Night palette, shared 16×16 grid, limited palette, tint/recolour pass in Stage 4. |
| No application scaffold yet | Expected | Create in Stage 3 after the asset gate. |
| Windows + Python tooling | Working | Pin tool requirements; validate with `python -m py_compile` and real runs. |

## 6. Stage boundary

This report covers inspection only. No game code will be written until Stages 0–2 pass inspection at the first gate.
