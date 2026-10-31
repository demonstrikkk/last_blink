# Gate 1 report — visual direction, assets, pipeline

**Date:** 2026-10-31
**Scope completed:** Stage 0 (visual direction), Stage 1 (asset acquisition), Stage 2 (validation and catalogue).
**Scope not started:** map production, game code, contracts. Nothing beyond the asset gate was built.

---

## 1. Deliverables

| # | Deliverable | File | State |
|---|---|---|---|
| 1 | Visual style guide | `docs/VISUAL_STYLE_GUIDE.md` | Complete |
| 2 | Visual reference board | `docs/visual_reference_board.png` | Rendered, 1600×1320 |
| 3 | Palette contrast report | `docs/contrast_report.md` | Computed, worst body case 7.37:1 |
| 4 | Asset sourcing + acquisition report | `docs/ASSET_SOURCING.md` | Complete |
| 5 | Asset register | `docs/ASSET_REGISTER.csv` | 46 rows, hashes and media metadata |
| 6 | Third-party notices | `docs/THIRD_PARTY_NOTICES.md` | Complete, includes rejected sources |
| 7 | Asset catalogue | `docs/asset_catalogue.html` | Generated, 44 local references resolve |
| 8 | Catalogue screenshots | `docs/catalogue_preview.png`, `docs/catalogue_preview_mobile.png` | Captured from headless Chrome |
| 9 | Validation report | `docs/VALIDATION_REPORT.md` | 0 failures, 0 warnings |
| 10 | Source verification | `docs/source_verification.json` | 6/6 live pages verified |
| 11 | Pipeline | `tools/assets/**`, `tools/assets/README.md` | 10 scripts, idempotent |
| 12 | Baseline + checklist | `docs/BASELINE_REPORT.md`, `docs/IMPLEMENTATION_CHECKLIST.md` | Complete |

---

## 2. Asset summary

| Category | Count | Licence | Source |
|---|---|---|---|
| Environment tileset | 1 (37×28 tiles) | CC0-1.0 | Kenney — Roguelike Modern City 2.0 |
| Character sprites | 14 (7 roles × 2 frames) | CC0-1.0 | ansimuz — Top Down Adventure Assets |
| Sound effects | 24 | CC0-1.0 | Kenney — Interface + Sci-Fi Sounds |
| Music loops | 3 | CC0-1.0 | ansimuz — Top Down Adventure Assets |
| Fonts | 2 | OFL-1.1 | Google Fonts — Space Grotesk, IBM Plex Mono |
| Shipped licence texts | 2 | OFL-1.1 | Font licence copies |
| **Total** | **46 files, 2.61 MiB** | | Budget 20 MiB |

Zero unused files, zero orphans, zero byte-identical duplicates.

---

## 3. Commands executed and results

All run from the repository root on Windows, Node 22.15.0, Python 3.11.15, Pillow 12.3.0, ffmpeg/ffprobe 8.1.

| # | Command | Result |
|---|---|---|
| 1 | `python -m py_compile` over all 10 pipeline scripts | exit 0 |
| 2 | `python tools/assets/discover/verify_sources.py` | 6/6 source pages return 200 with the recorded licence wording |
| 3 | `python tools/assets/download/fetch_kenney.py` | 3/3 packs cached, archive SHA-256 matches manifest |
| 4 | `python tools/assets/download/fetch_direct.py` | 8/8 files cached |
| 5 | Force re-download of `interface-sounds` through the Python path | download, hash and extraction succeed; SHA-256 matches the pinned value |
| 6 | `python tools/assets/validate/build_register.py` | 46 assets staged, 0 changed on re-run |
| 7 | `python tools/assets/validate/validate_assets.py` | PASS, 0 failures, 0 warnings |
| 8 | Corruption test: append bytes to a shipped OGG, re-validate | 2 FAILs as expected (`ship.size`, `ship.hash`); pipeline then restored the file and validation returned to PASS |
| 9 | `python tools/assets/validate/contrast_report.py` | Table regenerated; body text worst case 7.37:1 |
| 10 | `python tools/assets/catalogue/build_catalogue.py` | `docs/asset_catalogue.html`, 46 KiB |
| 11 | `python tools/assets/validate/check_catalogue_links.py` | 44/44 local references resolve, tag counts balanced |
| 12 | `python tools/assets/catalogue/build_reference_board.py` | `docs/visual_reference_board.png`, 95 KiB |
| 13 | Headless Chrome screenshots of the catalogue at 1440 px and 500 px | Both captured; desktop and narrow layout render without horizontal overflow |

Not run, and why: no TypeScript/ESLint/Vitest/Playwright checks, because no application scaffold exists yet by design. Those gates start at Stage 3.

---

## 4. Decisions that need your awareness

1. **Environment and characters come from two artists.** Verified licence-wise, but the styles differ. The fix is a single shared night grade plus a character-only 1 px outline; the reference board shows before/after. This is the largest visual risk and it is measurable at Stage 4 with a real screenshot.
2. **No four-directional character animation exists in a pack that fits.** Accepted: single facing, two-frame step, vertical bob. Documented in the style guide §13.2.
3. **The environment sheet chosen is `tilemap_packed.png`, not `tilemap.png`.** No gutters means exact 37×28 frames and no off-by-one frame maths.
4. **Two OFL texts ship inside `public/assets/fonts/`.** The OFL requires the licence to travel with the font, so they are registered as first-class assets rather than left in `assets/licenses/`.
5. **No Git repository was initialised.** The working folder still is not version controlled; `.gitignore` is in place for when the foundation commit happens.

---

## 5. Open items

| Item | Impact | Owner |
|---|---|---|
| Inspector approval of this gate | Blocks Stage 3 | You |
| itch.io rate limit (HTTP 429) observed | None; no shipped asset depends on it | — |
| `.7z` extraction unavailable | One CC0 candidate unusable, not needed | — |
| Music tonality is chiptune, setting is industrial | Ambience must carry atmosphere | Design, Stage 4 |

---

## 6. What happens after approval

Stage 3 freezes contracts first: Zod schemas for events, facts, choices, rules, anchors, NPC definitions and saves, plus the `NpcPolicy`, `MemoryStore` and `EventStore` ports, before any gameplay code. Stage 4 builds the deterministic playable district and proves it runs with AI and network disabled.

Nothing in this repository currently claims any of that exists.
