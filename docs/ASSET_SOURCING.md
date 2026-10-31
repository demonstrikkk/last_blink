# Asset sourcing and acquisition report

**Stage:** 1 and 2 deliverable for the first gate.
**Machine-readable records:** [`ASSET_REGISTER.csv`](./ASSET_REGISTER.csv) · [`asset_manifest.json`](./asset_manifest.json) · [`asset_index.json`](./asset_index.json)
**Licence obligations:** [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)
**Validation evidence:** [`VALIDATION_REPORT.md`](./VALIDATION_REPORT.md)

---

## 1. Policy applied

- CC0 first. Permissive licences (OFL) allowed with their obligations recorded.
- CC-BY only with attribution properly recorded — no CC-BY asset was needed in the end.
- Every candidate's **live source page** was read, not a search thumbnail or a tag.
- Every licence text was downloaded and preserved verbatim under `assets/licenses/`.
- Originals stay in `assets/raw/`; curated copies go to `public/assets/`; nothing is overwritten in place.
- No scraping behind authentication, no bypassing of download limits, no resale-only material.

---

## 2. What was acquired

| Category | Pack | Files shipped | Licence |
|---|---|---|---|
| Environment tileset | Kenney — Roguelike Modern City 2.0 | 1 sheet (37 × 28 tiles) | CC0-1.0 |
| Characters | ansimuz — Top Down Adventure Assets | 14 sprites (7 roles × 2 frames) | CC0-1.0 |
| Sound effects | Kenney — Interface Sounds 1.0 | 10 | CC0-1.0 |
| Sound effects | Kenney — Sci-Fi Sounds 1.0 | 14 | CC0-1.0 |
| Music | ansimuz — Top Down Adventure Assets | 3 loops | CC0-1.0 |
| Fonts | Google Fonts — Space Grotesk | 1 variable TTF | OFL-1.1 |
| Fonts | Google Fonts — IBM Plex Mono | 1 regular TTF | OFL-1.1 |
| Licence texts | OFL copies shipped beside each font | 2 | OFL-1.1 |

**46 assets, 2.61 MiB shipped** against a 20 MiB budget. 24 sound effects sit inside the 20–30 target; 3 music loops sit inside the 2–3 target; 1 environment pack and 1 character pack respect the caps.

---

## 3. Acquisition method per source

### Kenney (environment, SFX)

Kenney publishes no static archive URL. The verified flow, implemented in `tools/assets/download/fetch_kenney.py`:

1. `GET https://kenney.nl/assets/<slug>` → regex `data-download-id='([0-9a-f]+)'`
2. `GET https://kenney.nl/download-link/<id>` with `Referer` and `Accept: application/json` → `{"url": "<signed>"}`
3. `GET <signed url>` → zip

Step 2 answers **403** without the `Referer`, which is why a plain `curl` fails. Signed URLs expire, so the script always re-resolves them and never stores them.

Archive SHA-256 values are pinned in the manifest and re-checked on every fetch:

| Pack | SHA-256 |
|---|---|
| roguelike-modern-city.zip | `2a3f36b1bc3a3d1cb4b9da051c493d163c493fe54adc66e78e76b3fb4abcfc56` |
| interface-sounds.zip | `f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232` |
| sci-fi-sounds.zip | `119340f351a5098ad814f78719438c0da355a9ce8a4c8a3af6a8d48aa3d49e04` |

### ansimuz (characters, music)

Direct file on OpenGameArt: `https://opengameart.org/sites/default/files/meta_data_assets_files_1.zip`
Page: `https://opengameart.org/content/top-down-adventure-assets` — licence badge CC0, author ansimuz (Luis Zuno).
Archive SHA-256: `ad5c1c799d2ad40d381d6d797a8c1feecef20cb33a4b2b7027224383a3e5441e`.

The pack's own `public-license-0.txt` is preserved verbatim and states: personal or commercial use, modification allowed, redistribution allowed.

### Google Fonts

Raw files on the `google/fonts` repository, pinned by path and hashed at stage time:

- `ofl/spacegrotesk/SpaceGrotesk[wght].ttf` + `ofl/spacegrotesk/OFL.txt`
- `ofl/ibmplexmono/IBMPlexMono-Regular.ttf` + `ofl/ibmplexmono/OFL.txt`

### Icons

Lucide is not vendored as an asset. It will be installed from npm in Stage 3 and recorded in the notices as an ISC-licensed dependency. No icon files ship from this pipeline.

---

## 4. Candidates rejected, and why

| Candidate | Licence | Why rejected |
|---|---|---|
| Kenney — Roguelike Characters 2.0 | CC0 | Paper-doll construction: separate bodies, clothing and hair, all single-frame and front-facing. No authored walk cycle, so every animation would have to be invented by hand. Rejected as the final character pack; archive kept in `assets/raw/` for reference. |
| Cup Nooble — Sprout Lands (free version) | Custom: **non-commercial only** | Licence forbids commercial use. Rejected outright. |
| Cozy Town Lite | CC-BY 4.0 | Pastel daytime street art, wrong tone for an industrial night district, and CC-BY would add an attribution obligation for no gain. |
| Pipoya — Free RPG Character Sprites | Custom: no redistribution | 32 × 32 breaks the 16 px grid, the archive is 402 MB, and the licence forbids redistribution — which conflicts with shipping the pack alongside the build. Download also required a payment-method step and then returned **HTTP 429**. Blocked and unsuitable. |
| Zerie — Tiny RPG Character Asset Pack | itch.io, unclear | Fantasy-only silhouettes; licence not stated as a recognised standard on the page. Rejected on fit and licence clarity. |
| Bennyboi_hack — Basic 16x16 character sprites 4 directional | CC0 | Genuinely good: real four-direction walk, idle, attack and death. Rejected because the sheet is a single character on an irregular 10 × 9 grid (walk, attack, death and pitfall frames interleaved with no documented layout) and the anime-kid silhouette clashes harder with the city tileset than the chosen pack. Kept as the fallback if the cast needs directional movement later. |
| OpenGameArt — Character 4 directional walking | CC0 | Archive is `.7z`; neither 7-Zip nor `py7zr` is available in this environment. Single character only. Blocked. |
| ansimuz — `hero1…hero15` frames | CC0 | 15 frames of one character, but the direction grouping is not documented and mirror tests show they are not left/right pairs. Not shipped, because an unverified frame layout would produce a wrong-looking walk. |
| Kenney — Roguelike Modern City `tilemap.png` (guttered variant) | CC0 | Rejected in favour of `tilemap_packed.png`: the packed sheet has no gutters, divides cleanly into 37 × 28 frames, and removes an entire class of off-by-one frame bugs. |

---

## 5. Blocked and unresolved

| Item | Status | Impact |
|---|---|---|
| itch.io rate limit (HTTP 429) | Observed twice while inspecting Pipoya and reachability of related pages | None on the final set; no asset depends on itch.io. Do not re-poll. |
| `.7z` extraction | No 7-Zip, no `py7zr` | One CC0 candidate unusable; irrelevant to the shipped set. Recorded rather than silently skipped. |
| Four-directional character animation | Not available in a licensed pack that fits the art direction | Accepted as a documented constraint; see `VISUAL_STYLE_GUIDE.md` §13.2. |

---

## 6. Repeatability

The pipeline is a sequence of idempotent steps. Re-running it must not duplicate files, change bytes, or leave orphans.

```powershell
python tools/assets/discover/verify_sources.py     # live source + licence check
python tools/assets/download/fetch_kenney.py       # skip when archive hash matches
python tools/assets/download/fetch_direct.py       # skip when file exists
python tools/assets/validate/build_register.py     # stage into public/, rebuild register
python tools/assets/validate/validate_assets.py    # fail on any blocking defect
python tools/assets/validate/contrast_report.py    # palette contrast table
python tools/assets/catalogue/build_catalogue.py   # docs/asset_catalogue.html
python tools/assets/catalogue/build_reference_board.py
```

`build_register.py` copies only when the destination is missing or its bytes differ from the preserved original, so a second run reports `0 changed`. That was verified, not assumed:

```
46 assets, 0 changed, 2674.0 KiB shipped
```

---

## 7. Size accounting

| Group | Files | Bytes |
|---|---|---|
| Environment | 1 | 22.8 KiB |
| Characters | 14 | 4.0 KiB |
| Music | 3 | 1.66 MiB |
| SFX | 24 | 668.2 KiB |
| Fonts | 2 | 265.9 KiB |
| Shipped licence texts | 2 | 8.7 KiB |
| **Total** | **46** | **2.61 MiB** |

The music loops dominate the payload, which is expected and still an order of magnitude under budget.
