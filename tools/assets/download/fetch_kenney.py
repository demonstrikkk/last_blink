"""Fetch the Kenney packs recorded in the manifest.

Usage:
    python tools/assets/download/fetch_kenney.py [--force]

Kenney does not publish static archive URLs. The flow is:

  1. GET  https://kenney.nl/assets/<slug>          -> read data-download-id
  2. GET  https://kenney.nl/download-link/<id>     -> JSON { "url": <signed url> }
  3. GET  <signed url>                             -> the zip

Step 2 needs a browser-like session and Referer, otherwise it answers 403.

The script is idempotent: an archive that already matches the manifest hash is
left untouched, so re-running the pipeline never duplicates or corrupts assets.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import (  # noqa: E402
    MANIFEST_PATH,
    Manifest,
    abspath,
    download_file,
    extract_zip,
    http_text,
    rel,
    sha256_file,
)


def kenney_slug(source_page: str) -> str:
    return source_page.rstrip("/").rsplit("/", 1)[-1]


def fetch_pack(pack: dict, *, force: bool) -> bool:
    archive = abspath(pack["rawArchive"])
    expected = pack.get("archiveSha256")
    slug = kenney_slug(pack["sourcePage"])
    page_url = f"https://kenney.nl/assets/{slug}"

    if archive.exists() and not force:
        actual = sha256_file(archive)
        if not expected or actual == expected:
            print(f"[   cached] {pack['id']:<30} {rel(archive)} sha256={actual[:12]}")
            return True
        print(f"[re-fetch ] {pack['id']:<30} cached archive hash differs from manifest")

    page = http_text(page_url, {"Accept": "text/html"})
    match = re.search(r"data-download-id='([0-9a-f]+)'", page)
    if not match:
        print(f"[    fail ] {pack['id']:<30} no data-download-id on {page_url}")
        return False

    payload = http_text(
        f"https://kenney.nl/download-link/{match.group(1)}",
        {
            "Referer": page_url,
            "Accept": "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest",
        },
    )
    signed = json.loads(payload)["url"]

    actual = download_file(signed, archive)
    if expected and actual != expected:
        print(f"[    fail ] {pack['id']:<30} hash mismatch: {actual} != {expected}")
        return False

    print(f"[    ok   ] {pack['id']:<30} {rel(archive)} sha256={actual[:12]}")

    extracted = abspath(pack["extractedDir"])
    if force or not extracted.exists():
        extract_zip(archive, extracted)
        print(f"[ extract ] {pack['id']:<30} {rel(extracted)}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="re-download even if cached")
    args = parser.parse_args()

    manifest = Manifest.load(MANIFEST_PATH)
    kenney_packs = [
        pack for pack in manifest.packs.values() if pack["sourcePage"].startswith("https://kenney.nl/")
    ]

    failures = [pack["id"] for pack in kenney_packs if not fetch_pack(pack, force=args.force)]
    print()
    print(f"{len(kenney_packs) - len(failures)}/{len(kenney_packs)} Kenney packs ready")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
