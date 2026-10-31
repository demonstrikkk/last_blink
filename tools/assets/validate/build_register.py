"""Stage curated assets into public/ and rebuild the asset register.

Usage:
    python tools/assets/validate/build_register.py [--dry-run]

Idempotent by design: re-running copies nothing when the destination already
matches the manifest source, replaces drifted files, and never leaves orphaned
destination files (the validator reports those separately).
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import (  # noqa: E402
    INDEX_PATH,
    MANIFEST_PATH,
    REGISTER_PATH,
    Manifest,
    abspath,
    probe_media,
    rel,
    stage_asset,
    write_json,
)

CSV_COLUMNS = [
    "id",
    "kind",
    "pack",
    "creator",
    "licence",
    "attribution_required",
    "source_page",
    "source_path",
    "dest_path",
    "bytes",
    "sha256",
    "width",
    "height",
    "alpha",
    "duration_s",
    "sample_rate",
    "channels",
    "usage",
    "notes",
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    manifest = Manifest.load(MANIFEST_PATH)
    records = []

    for asset in manifest.assets:
        pack = manifest.packs[asset["pack"]]
        record = stage_asset(asset, dry_run=args.dry_run)
        media = probe_media(abspath(asset["dest"]), asset["kind"]) if not args.dry_run else {}
        record.update(
            {
                "creator": pack["creator"],
                "licence": pack["licence"],
                "attributionRequired": pack["attributionRequired"],
                "sourcePage": pack["sourcePage"],
                "media": media,
            }
        )
        records.append(record)
        print(f"[{record['action']:>9}] {asset['id']:<28} -> {asset['dest']}")

    payload = {
        "schemaVersion": 1,
        "manifest": rel(MANIFEST_PATH),
        "packs": manifest.raw["packs"],
        # `action` describes what this particular run did, so it stays out of
        # the committed index: including it would make the regenerated file
        # depend on local run history instead of on repo content.
        "assets": [
            {key: value for key, value in record.items() if key != "action"}
            for record in records
        ],
    }
    if not args.dry_run:
        write_json(INDEX_PATH, payload)

        REGISTER_PATH.parent.mkdir(parents=True, exist_ok=True)
        with REGISTER_PATH.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS, lineterminator="\n")
            writer.writeheader()
            for record in records:
                media = record["media"]
                writer.writerow(
                    {
                        "id": record["id"],
                        "kind": record["kind"],
                        "pack": record["pack"],
                        "creator": record["creator"],
                        "licence": record["licence"],
                        "attribution_required": str(record["attributionRequired"]).lower(),
                        "source_page": record["sourcePage"],
                        "source_path": record["source"],
                        "dest_path": record["dest"],
                        "bytes": record["bytes"],
                        "sha256": record["sha256"],
                        "width": media.get("width", ""),
                        "height": media.get("height", ""),
                        "alpha": media.get("hasAlpha", ""),
                        "duration_s": f"{media['duration']:.3f}" if media.get("duration") else "",
                        "sample_rate": media.get("sampleRate", ""),
                        "channels": media.get("channels", ""),
                        "usage": record["usage"],
                        "notes": record["notes"],
                    }
                )

    changed = sum(1 for r in records if r["action"] != "unchanged")
    total = sum(r["bytes"] for r in records)
    print()
    print(f"{len(records)} assets, {changed} changed, {total / 1024:.1f} KiB shipped")
    if not args.dry_run:
        print(f"wrote {rel(REGISTER_PATH)} and {rel(INDEX_PATH)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
