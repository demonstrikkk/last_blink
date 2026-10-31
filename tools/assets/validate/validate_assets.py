"""Validate the curated asset library.

Usage:
    python tools/assets/validate/validate_assets.py

Reads docs/asset_index.json (produced by build_register.py) and fails with a
non-zero exit code when a blocking check fails. Writes docs/VALIDATION_REPORT.md.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import (  # noqa: E402
    INDEX_PATH,
    MANIFEST_PATH,
    PUBLIC_ROOT,
    SHIPPED_BUDGET_BYTES,
    VALIDATION_PATH,
    Manifest,
    abspath,
    rel,
    sha256_asset,
    sha256_file,
)

SFX_MIN_DURATION = 0.02
SFX_MAX_DURATION = 8.0
MUSIC_MIN_DURATION = 8.0
MUSIC_MAX_DURATION = 180.0
MIN_MEAN_VOLUME_DB = -45.0
MAX_MEAN_VOLUME_DB = -3.0
REQUIRED_SAMPLE_RATES = {44100, 48000}
LICENCE_MARKERS = {
    "CC0-1.0": "CC0",
    "OFL-1.1": "SIL OPEN FONT LICENSE",
}


class Report:
    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str, str]] = []

    def add(self, status: str, check: str, subject: str, detail: str) -> None:
        self.rows.append((status, check, subject, detail))

    def ok(self, check: str, subject: str, detail: str = "") -> None:
        self.add("PASS", check, subject, detail)

    def warn(self, check: str, subject: str, detail: str) -> None:
        self.add("WARN", check, subject, detail)

    def fail(self, check: str, subject: str, detail: str) -> None:
        self.add("FAIL", check, subject, detail)

    @property
    def failures(self) -> list[tuple[str, str, str, str]]:
        return [row for row in self.rows if row[0] == "FAIL"]

    @property
    def warnings(self) -> list[tuple[str, str, str, str]]:
        return [row for row in self.rows if row[0] == "WARN"]


def mean_volume_db(path: Path) -> float | None:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "volumedetect", "-f", "null", "NUL"],
        capture_output=True,
        text=True,
    )
    match = re.search(r"mean_volume:\s*(-?\d+(?:\.\d+)?) dB", result.stderr)
    return float(match.group(1)) if match else None


def check_manifest(report: Report, manifest: Manifest) -> None:
    seen_ids: dict[str, str] = {}
    seen_dest: dict[str, str] = {}

    for asset in manifest.assets:
        asset_id = asset["id"]
        if asset_id in seen_ids:
            report.fail("manifest.unique-id", asset_id, "duplicate asset id")
        seen_ids[asset_id] = asset["id"]

        if asset["dest"] in seen_dest:
            report.fail("manifest.unique-dest", asset_id, f"dest also used by {seen_dest[asset['dest']]}")
        seen_dest[asset["dest"]] = asset_id

        if asset["pack"] not in manifest.packs:
            report.fail("manifest.pack-ref", asset_id, f"unknown pack {asset['pack']}")
        if not asset.get("usage", "").strip():
            report.fail("manifest.usage", asset_id, "usage is empty")
        if not asset["dest"].startswith("public/assets/"):
            report.fail("manifest.dest-root", asset_id, asset["dest"])

    report.ok("manifest.unique-id", f"{len(manifest.assets)} assets", "ids and destinations unique")


def check_packs(report: Report, manifest: Manifest) -> None:
    for pack in manifest.packs.values():
        licence = pack.get("licence")
        if not licence:
            report.fail("pack.licence", pack["id"], "no licence recorded")
            continue

        licence_file = abspath(pack["licenceFile"])
        if not licence_file.exists():
            report.fail("pack.licence-file", pack["id"], f"missing {pack['licenceFile']}")
            continue

        text = licence_file.read_text(encoding="utf-8", errors="replace").upper()
        evidence = pack.get("licenceEvidence") or [LICENCE_MARKERS.get(licence, "")]
        missing = [token for token in evidence if token and token.upper() not in text]
        if missing:
            report.fail(
                "pack.licence-text",
                pack["id"],
                f"{rel(licence_file)} is missing expected licence wording: {', '.join(missing)}",
            )
        else:
            report.ok("pack.licence-text", pack["id"], f"{licence} confirmed in {rel(licence_file)}")

        if pack.get("attributionRequired") and not pack.get("attributionText"):
            report.fail("pack.attribution", pack["id"], "attribution required but no text recorded")
        if not pack.get("sourcePage", "").startswith("https://"):
            report.fail("pack.source", pack["id"], "missing https source page")

        archive = pack.get("rawArchive")
        if archive:
            archive_path = abspath(archive)
            if not archive_path.exists():
                report.fail("pack.archive", pack["id"], f"missing {archive}")
            elif pack.get("archiveSha256"):
                actual = sha256_file(archive_path)
                if actual != pack["archiveSha256"]:
                    report.fail(
                        "pack.archive-hash",
                        pack["id"],
                        f"archive hash mismatch (recorded {pack['archiveSha256'][:12]}, actual {actual[:12]})",
                    )
                else:
                    report.ok("pack.archive-hash", pack["id"], f"{archive} sha256 verified")


def check_shipped_files(report: Report, index: dict) -> None:
    total_bytes = 0
    hashes: dict[str, list[str]] = defaultdict(list)
    kinds: defaultdict[str, int] = defaultdict(int)

    for asset in index["assets"]:
        dest = abspath(asset["dest"])
        source = abspath(asset["source"])

        if not dest.exists():
            report.fail("ship.exists", asset["id"], f"missing {asset['dest']}")
            continue

        kinds[asset["kind"]] += 1
        total_bytes += dest.stat().st_size
        hashes[asset["sha256"]].append(asset["id"])

        if dest.stat().st_size != asset["bytes"]:
            report.fail("ship.size", asset["id"], "destination size differs from manifest record")
        if source.exists() and sha256_asset(dest) != sha256_asset(source):
            report.fail("ship.hash", asset["id"], "destination bytes differ from preserved original")

    duplicate_groups = {h: ids for h, ids in hashes.items() if len(ids) > 1}
    for digest, ids in duplicate_groups.items():
        report.warn("ship.duplicates", digest[:12], f"identical content in {', '.join(ids)}")
    if not duplicate_groups:
        report.ok("ship.duplicates", f"{len(hashes)} unique blobs", "no byte-identical duplicates")

    if total_bytes > SHIPPED_BUDGET_BYTES:
        report.fail(
            "ship.budget",
            f"{total_bytes / 1024 / 1024:.2f} MiB",
            f"exceeds {SHIPPED_BUDGET_BYTES / 1024 / 1024:.0f} MiB budget",
        )
    else:
        report.ok(
            "ship.budget",
            f"{total_bytes / 1024 / 1024:.2f} MiB",
            f"within {SHIPPED_BUDGET_BYTES / 1024 / 1024:.0f} MiB budget",
        )

    reference = ", ".join(f"{kind}={count}" for kind, count in sorted(kinds.items()))
    report.ok("ship.counts", "asset mix", reference)

    known = {asset["dest"] for asset in index["assets"]}
    orphans = [
        rel(path)
        for path in sorted(PUBLIC_ROOT.rglob("*"))
        if path.is_file() and rel(path) not in known
    ]
    for orphan in orphans:
        report.fail("ship.orphans", orphan, "file in public/assets is not in the manifest")
    if not orphans:
        report.ok("ship.orphans", "public/assets", "no unregistered files")


def check_tileset(report: Report, asset: dict) -> None:
    media = asset["media"]
    tile = asset.get("tileSize")
    if not tile:
        report.fail("img.tile-size", asset["id"], "tileset has no tileSize")
        return

    width, height = media["width"], media["height"]
    if width % tile or height % tile:
        report.fail(
            "img.tile-divisible",
            asset["id"],
            f"{width}x{height} is not divisible by {tile}",
        )
        return

    margin = asset.get("margin", 0)
    spacing = asset.get("spacing", 0)
    usable_w = width - 2 * margin
    usable_h = height - 2 * margin
    if spacing:
        cols = (usable_w + spacing) // (tile + spacing)
        rows = (usable_h + spacing) // (tile + spacing)
    else:
        cols, rows = usable_w // tile, usable_h // tile

    report.ok(
        "img.tile-grid",
        asset["id"],
        f"{width}x{height}px = {cols}x{rows} tiles of {tile}px (margin {margin}, spacing {spacing})",
    )

    if not media["hasAlpha"]:
        report.fail("img.alpha", asset["id"], "tileset must carry an alpha channel")


def check_sprites(report: Report, index: dict) -> None:
    by_dir: defaultdict[str, list[dict]] = defaultdict(list)
    for asset in index["assets"]:
        if asset["kind"] != "sprite":
            continue

        media = asset["media"]
        tile = asset.get("tileSize", 16)
        if (media["width"], media["height"]) != (tile, tile):
            report.fail(
                "img.sprite-size",
                asset["id"],
                f"{media['width']}x{media['height']} is not {tile}x{tile}",
            )
        if not media["hasAlpha"]:
            report.fail("img.alpha", asset["id"], "sprite must carry an alpha channel")
        if media.get("minAlpha") in (255,):
            report.fail("img.sprite-empty", asset["id"], "sprite has no transparent pixels (likely a flat fill)")

        by_dir[str(Path(asset["dest"]).parent)].append(asset)

    for directory, frames in sorted(by_dir.items()):
        if len(frames) != 2:
            report.warn("anim.frame-count", directory, f"{len(frames)} frames registered (expected 2)")
        else:
            report.ok("anim.frame-count", directory, "2-frame step cycle complete")


def check_audio(report: Report, asset: dict) -> None:
    media = asset["media"]
    path = abspath(asset["dest"])
    duration = media.get("duration") or 0.0
    codec = media.get("codec")

    if codec != "vorbis":
        report.fail("audio.codec", asset["id"], f"expected vorbis, found {codec}")

    rate = media.get("sampleRate")
    if rate not in REQUIRED_SAMPLE_RATES:
        report.warn("audio.sample-rate", asset["id"], f"{rate} Hz is outside the 44.1/48 kHz target")

    channels = media.get("channels")
    if channels not in (1, 2):
        report.warn("audio.channels", asset["id"], f"{channels} channels")

    if asset["kind"] == "audio-sfx":
        if not (SFX_MIN_DURATION <= duration <= SFX_MAX_DURATION):
            report.fail("audio.duration", asset["id"], f"{duration:.3f}s outside {SFX_MIN_DURATION}-{SFX_MAX_DURATION}s")
    else:
        if not (MUSIC_MIN_DURATION <= duration <= MUSIC_MAX_DURATION):
            report.fail("audio.duration", asset["id"], f"{duration:.3f}s outside {MUSIC_MIN_DURATION}-{MUSIC_MAX_DURATION}s")

    volume = mean_volume_db(path)
    if volume is None:
        report.warn("audio.loudness", asset["id"], "ffmpeg could not measure mean volume")
    elif volume > MAX_MEAN_VOLUME_DB:
        report.warn("audio.loudness", asset["id"], f"mean {volume:.1f} dB is near clipping")
    elif volume < MIN_MEAN_VOLUME_DB:
        report.warn("audio.loudness", asset["id"], f"mean {volume:.1f} dB is very quiet")
    else:
        report.ok("audio.loudness", asset["id"], f"mean {volume:.1f} dB")


def check_fonts(report: Report, index: dict) -> None:
    for asset in index["assets"]:
        if asset["kind"] != "font":
            continue
        path = abspath(asset["dest"])
        header = path.read_bytes()[:4]
        if header not in (b"\x00\x01\x00\x00", b"true", b"OTTO"):
            report.fail("font.signature", asset["id"], f"unexpected TTF/OTF header {header!r}")
        else:
            report.ok("font.signature", asset["id"], f"{asset['bytes']} bytes, valid sfnt header")


def check_licence_copies(report: Report, index: dict) -> None:
    """OFL requires the licence to travel with the font it covers."""
    for asset in index["assets"]:
        if asset["kind"] != "licence":
            continue
        text = abspath(asset["dest"]).read_text(encoding="utf-8", errors="replace").upper()
        if "SIL OPEN FONT LICENSE" not in text:
            report.fail("licence.shipped-text", asset["id"], "shipped licence copy is missing OFL wording")
        else:
            report.ok("licence.shipped-text", asset["id"], f"OFL text shipped at {asset['dest']}")


def main() -> int:
    if not INDEX_PATH.exists():
        print("run tools/assets/validate/build_register.py first", file=sys.stderr)
        return 2

    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    manifest = Manifest.load(MANIFEST_PATH)
    report = Report()

    check_manifest(report, manifest)
    check_packs(report, manifest)
    check_shipped_files(report, index)

    for asset in index["assets"]:
        if asset["kind"] == "tileset":
            check_tileset(report, asset)
        elif asset["kind"] == "font":
            continue
        elif asset["kind"] in {"audio-sfx", "audio-music"}:
            check_audio(report, asset)

    check_sprites(report, index)
    check_fonts(report, index)
    check_licence_copies(report, index)

    status = "FAIL" if report.failures else "PASS"
    lines = [
        "# Asset validation report",
        "",
        f"Result: **{status}** — {len(report.failures)} failure(s), {len(report.warnings)} warning(s), "
        f"{len(report.rows) - len(report.failures) - len(report.warnings)} passing check(s).",
        "",
        "Generated by `tools/assets/validate/validate_assets.py` from "
        "`docs/asset_manifest.json` and `docs/asset_index.json`.",
        "",
        "## Checks",
        "",
        "| Status | Check | Subject | Detail |",
        "|---|---|---|---|",
    ]
    for result, check, subject, detail in report.rows:
        lines.append(f"| {result} | `{check}` | {subject} | {detail} |")

    if report.failures:
        lines += ["", "## Failures", ""]
        for _, check, subject, detail in report.failures:
            lines.append(f"- `{check}` **{subject}** — {detail}")

    VALIDATION_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

    for result, check, subject, detail in report.rows:
        if result != "PASS":
            print(f"{result} {check} {subject}: {detail}")
    print()
    print(f"{status}: {len(report.failures)} failure(s), {len(report.warnings)} warning(s)")
    print(f"wrote {rel(VALIDATION_PATH)}")
    return 1 if report.failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
