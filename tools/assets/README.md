# Asset pipeline

Everything that turns a downloaded pack into the curated, validated library under `public/assets/`.

## Layout

```
assets/
  raw/            untouched archives + extracted originals (never edited)
  licenses/       verbatim licence texts, one per pack
public/assets/    curated copies that the game may load
docs/
  asset_manifest.json   source of truth: what ships, from where, under which pack
  asset_index.json      generated: manifest + hashes + media probes
  ASSET_REGISTER.csv    generated: one row per shipped file
  VALIDATION_REPORT.md  generated: every check with a pass/fail result
  asset_catalogue.html  generated: browsable previews with licences
tools/assets/
  common.py             manifest loading, hashing, media probing, staging
  discover/             live source + licence verification
  download/             idempotent fetchers
  prepare/              restore gitignored extracted packs from committed archives
  validate/             register builder, validator, contrast report, link check
  catalogue/            HTML catalogue and reference board renderers
```

## Commands

Run from the repository root.

```powershell
python tools/assets/discover/verify_sources.py       # live pages + licence wording
python tools/assets/download/fetch_kenney.py         # Kenney (signed-URL flow)
python tools/assets/download/fetch_direct.py         # OpenGameArt zip, Google Fonts
python tools/assets/prepare/extract_cached.py        # restore gitignored extracted packs (no network)
python tools/assets/validate/build_register.py       # stage + rebuild register
python tools/assets/validate/validate_assets.py      # blocking checks, exit code 1 on failure
python tools/assets/validate/contrast_report.py      # palette contrast table
python tools/assets/validate/check_catalogue_links.py
python tools/assets/catalogue/build_catalogue.py
python tools/assets/catalogue/build_reference_board.py
```

## Rules the code enforces

1. **Originals are immutable.** `assets/raw/` is read-only input; only `public/assets/` is written.
2. **Nothing lands outside `public/`.** `common.ensure_within_public` rejects any destination that escapes the public root.
3. **Staging is idempotent.** A destination whose bytes match the preserved original is left alone; a drifted one is replaced; a missing one is created. A second run reports `0 changed`.
4. **Hashes are pinned.** Pack archives are compared against `archiveSha256` in the manifest, so a changed upstream file fails loudly instead of silently shipping.
5. **No orphans.** Any file under `public/assets/` that is not in the manifest fails validation.
6. **Text assets are line-ending independent.** `.txt` assets are normalised to LF before hashing and staging (`common.read_asset_bytes`), so a Windows checkout with `core.autocrlf=true` records the same bytes and digest as CI. Only opaque streams such as `.zip` archives are hashed verbatim.
7. **Every asset declares usage.** An empty `usage` field fails validation, which is how "zero unused shipped assets" stays true.

## Adding an asset

1. Download the original into `assets/raw/`, keep the archive and the licence text.
2. Add the pack to `packs[]` in `docs/asset_manifest.json` with source page, licence, `licenceEvidence` tokens and `licenceFile`.
3. Add one entry to `assets[]` with `source`, `dest`, `usage` and `notes`.
4. Run `build_register.py`, then `validate_assets.py`, then `build_catalogue.py`.
5. Commit the manifest, the register, the validation report, the catalogue and the preserved licence text together.

## Deliberate limits

- No network access at game build time. Fetching is a separate, auditable step.
- No image post-processing in the pipeline beyond copying. The night grade is a runtime shader, so the shipped PNGs stay byte-identical to upstream and hashes mean something.
- `ffprobe` and `ffmpeg` must be on `PATH`; the audio checks fail rather than skip when they are missing.
