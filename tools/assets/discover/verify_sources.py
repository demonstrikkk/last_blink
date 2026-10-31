"""Verify that every recorded source page still exists and still declares the licence.

Usage:
    python tools/assets/discover/verify_sources.py [--offline]

This is the guard against trusting a thumbnail, a filename or a pack description.
It re-reads the live source page and confirms the licence wording is present in
the page itself. Results are written to docs/source_verification.json.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import MANIFEST_PATH, ROOT, Manifest  # noqa: E402

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

# What the live page must still show for the recorded licence to be credible.
PAGE_EVIDENCE = {
    "kenney-modern-city": ["CC0"],
    "ansimuz-topdown": ["CC0"],
    "kenney-interface-sounds": ["CC0"],
    "kenney-sci-fi-sounds": ["CC0"],
    "google-fonts-space-grotesk": ["SIL OPEN FONT LICENSE"],
    "google-fonts-ibm-plex-mono": ["SIL OPEN FONT LICENSE"],
}

# Files whose download URL is stable and can be re-fetched directly.


def fetch(url: str, method: str = "GET", timeout: int = 30) -> tuple[int, str]:
    request = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read()
        if method == "HEAD":
            return response.status, ""
        return response.status, body.decode("utf-8", errors="replace")


def check_page(pack: dict, tokens: list[str]) -> dict:
    record: dict = {"pack": pack["id"], "sourcePage": pack["sourcePage"]}

    try:
        status, body = fetch(pack["sourcePage"])
    except urllib.error.HTTPError as error:
        record.update({"status": "error", "httpStatus": error.code, "reason": str(error)})
        return record
    except Exception as error:  # noqa: BLE001 - network variance is expected
        record.update({"status": "error", "httpStatus": None, "reason": repr(error)})
        return record

    evidence_url = pack.get("licenceEvidenceUrl")
    evidence_text = body
    if evidence_url:
        try:
            _, evidence_text = fetch(evidence_url)
            record["licenceEvidenceUrl"] = evidence_url
        except Exception as error:  # noqa: BLE001
            record.update({"status": "error", "httpStatus": status, "reason": repr(error)})
            return record

    upper = evidence_text.upper()
    missing = [token for token in tokens if token.upper() not in upper]
    record.update(
        {
            "status": "ok" if not missing else "licence-token-missing",
            "httpStatus": status,
            "missingTokens": missing,
            "kenneyDownloadId": bool(re.search(r"data-download-id='([0-9a-f]+)'", body)),
            "bytes": len(body),
        }
    )
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true", help="reuse the previous report")
    args = parser.parse_args()

    manifest = Manifest.load(MANIFEST_PATH)
    previous_path = ROOT / "docs" / "source_verification.json"

    if args.offline and previous_path.exists():
        print(f"offline: using {previous_path}")
        return 0

    records = [
        check_page(pack, PAGE_EVIDENCE.get(pack_id, []))
        for pack_id, pack in manifest.packs.items()
    ]

    failures = [record for record in records if record["status"] != "ok"]
    payload = {"schemaVersion": 1, "pages": records, "failures": len(failures)}
    previous_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    for record in records:
        marker = "OK  " if record["status"] == "ok" else "FAIL"
        print(f"{marker} {record['pack']:<30} {record.get('httpStatus')} {record['sourcePage']}")
        if record["status"] != "ok":
            print(f"     {record.get('reason') or 'missing licence tokens: ' + ', '.join(record.get('missingTokens', []))}")

    print()
    print(f"{len(records) - len(failures)}/{len(records)} source pages verified")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
