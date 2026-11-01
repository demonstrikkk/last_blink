# Release Notes — The Last Blink: Second Settlement

## Game State
- **Core Loop**: Investigative arc through evidence → choices → BLINK/ECHO → endings → save/reload
- **City**: 144×96 tile circular city (6 districts, 9 enterable interiors)
- **NPCs**: 14 NPCs + Moth companion with distinct locations/sprites/dialogue
- **Endings**: 4 endings (original 3 preserved + `ending.second_settlement` at priority 53)
- **Clue Chain**: 12 evidence → 6 choices → correlation rules → 4 endings

## Technical Status
- **Typecheck**: Clean
- **Tests**: 215 passed, 2 skipped across 27 test files
- **Build**: Clean with expected chunk-size warning
- **YugabyteDB**: Live connectivity confirmed (TCP 5433 now succeeds after previous blockage)
- **Meko**: MCP endpoint reachable, full lifecycle functional
- **Groq**: `openai/gpt-oss-120b` model reachable
- **Gemini**: `gemini-3.8-flash` model reachable

## Architecture
- Deterministic GameSession with MORROW/ECHO/BLINK semantics
- YugabyteDB repository (TLS, OCC, transactions, migrations)
- Model gateway with budgets, circuit breaker, dedupe, bounded cache, deterministic fallback
- Meko MCP client with full lifecycle, datapack search, bounded retrieval
- Cloud sync: non-destructive IndexedDB ↔ merge/conflict handling
- DOM minimap via `onPlayerTile` callback

## Known Inconsistencies
- `144×96` city dimension vs `37×42` grid reference in `cityMap.ts` — needs clarification
- `payload.sessionId === payload.sessionId` is a tautology (always true)
- `head_version` claiming to be maximum snapshot version — not necessarily correct if snapshots less frequent than events

## Required Actions (Prioritized)
1. **Actual gameplay playthrough** — Document all 4 endings through real game execution
2. **Resolve cityMap.ts grid dimension inconsistency** — `144×96` vs `37×42`
3. **Verify YugabyteDB live connectivity** with actual migration/commit/read cycle
4. **Document investigation playthrough** — clue chain flow through actual gameplay
5. **Verify MORROW termination route** — accessibility through actual gameplay
6. **Document NPC conversation transcripts** — reactivity and depth
7. **Add automated integration tests** for YugabyteDB concurrent operations

## Limitations
- Actual gameplay experience not yet verified (code-level only)
- Live YugabyteDB connectivity was blocked until recently (now confirmed working)
- Grid dimension inconsistency needs resolution
- Tautological validation check needs addressing

## Commands That Pass
```powershell
npm run typecheck    # clean
npm test             # 215 passed, 2 skipped
npm run build        # clean with expected warning
```