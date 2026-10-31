"""Fetch the packs that have stable direct URLs (OpenGameArt zip, Google Fonts).

Usage:
    python tools/assets/download/fetch_direct.py [--force]

Idempotent like fetch_kenney.py: cached files whose hash matches the manifest
are not touched.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import (  # noqa: E402
    MANIFEST_PATH,
    Manifest,
    ROOT,
    abspath,
    download_file,
    extract_zip,
    rel,
    sha256_file,
)

FONT_FILES = {
    "google-fonts-space-grotesk": [
        (
            "https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf",
            "assets/raw/fonts/SpaceGrotesk-VariableFont_wght.ttf",
        ),
        (
            "https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/OFL.txt",
            "assets/raw/fonts/LICENSE-SpaceGrotesk-OFL.txt",
        ),
    ],
    "google-fonts-ibm-plex-mono": [
        (
            "https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/IBMPlexMono-Regular.ttf",
            "assets/raw/fonts/IBMPlexMono-Regular.ttf",
        ),
        (
            "https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/OFL.txt",
            "assets/raw/fonts/LICENSE-IBMPlexMono-OFL.txt",
        ),
    ],
}


def fetch_archive(pack: dict, *, force: bool) -> bool:
    archive = abspath(pack["rawArchive"])
    expected = pack.get("archiveSha256")

    if archive.exists() and not force and (not expected or sha256_file(archive) == expected):
        print(f"[   cached] {pack['id']:<30} {rel(archive)}")
    else:
        actual = download_file(pack["downloadUrl"], archive)
        if expected and actual != expected:
            print(f"[    fail ] {pack['id']:<30} hash mismatch: {actual} != {expected}")
            return False
        print(f"[    ok   ] {pack['id']:<30} {rel(archive)} sha256={actual[:12]}")

    extracted = abspath(pack["extractedDir"])
    if force or not extracted.exists():
        extract_zip(archive, extracted)
        print(f"[ extract ] {pack['id']:<30} {rel(extracted)}")
    return True


def fetch_fonts(pack_id: str, *, force: bool) -> bool:
    ok = True
    for url, relative in FONT_FILES[pack_id]:
        dest = ROOT / relative
        if dest.exists() and not force:
            print(f"[   cached] {pack_id:<30} {relative}")
            continue
        digest = download_file(url, dest)
        print(f"[    ok   ] {pack_id:<30} {relative} sha256={digest[:12]}")
    return ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    manifest = Manifest.load(MANIFEST_PATH)
    failures: list[str] = []

    for pack in manifest.packs.values():
        if pack.get("rawArchive"):
            if not fetch_archive(pack, force=args.force):
                failures.append(pack["id"])
        elif pack["id"] in FONT_FILES:
            if not fetch_fonts(pack["id"], force=args.force):
                failures.append(pack["id"])

    print()
    print("all direct sources ready" if not failures else f"failed: {', '.join(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
