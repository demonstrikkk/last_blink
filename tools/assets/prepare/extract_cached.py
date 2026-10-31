"""Materialise extracted pack contents from the committed raw archives.

`assets/raw/extracted/` is deliberately not versioned (see .gitignore): it is
derived from the archives in `assets/raw/*.zip`, which are committed and
hash-pinned in `docs/asset_manifest.json`. Local runs usually already have the
directory; CI checkouts do not.

This script restores the derived directory without any network access, so the
register can be rebuilt and proven idempotent on a clean checkout.

Usage:
    python tools/assets/prepare/extract_cached.py [--force]

Idempotent: a pack whose extracted directory already exists is left untouched
unless `--force` is given. Every archive is checked against its manifest hash
before it is used, so a corrupted or swapped archive fails loudly.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import (  # noqa: E402
    Manifest,
    abspath,
    extract_zip,
    rel,
    sha256_file,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="re-extract every pack even when its directory already exists",
    )
    args = parser.parse_args(argv)

    manifest = Manifest.load()
    failures = 0
    extracted = 0
    cached = 0

    for pack in manifest.packs.values():
        archive_rel = pack.get("rawArchive")
        extracted_rel = pack.get("extractedDir")
        if not archive_rel or not extracted_rel:
            continue

        archive = abspath(archive_rel)
        target = abspath(extracted_rel)

        if not archive.exists():
            print(f"[  fail  ] {pack['id']:<30} missing archive {archive_rel}")
            failures += 1
            continue

        expected = pack.get("archiveSha256")
        if expected:
            actual = sha256_file(archive)
            if actual != expected:
                print(
                    f"[  fail  ] {pack['id']:<30} archive hash {actual[:12]} "
                    f"!= manifest {expected[:12]}"
                )
                failures += 1
                continue

        if target.exists() and not args.force:
            print(f"[  cached] {pack['id']:<30} {rel(target)}")
            cached += 1
            continue

        extract_zip(archive, target)
        print(f"[ extract] {pack['id']:<30} {rel(target)}")
        extracted += 1

    print(f"{extracted} extracted, {cached} cached, {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
