"""Shared helpers for the Last Blink asset pipeline.

Every tool in tools/assets/ imports from here so the manifest stays the single
source of truth and the hashing / probing rules are identical everywhere.

Run any tool from the repository root.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "docs" / "asset_manifest.json"
INDEX_PATH = ROOT / "docs" / "asset_index.json"
REGISTER_PATH = ROOT / "docs" / "ASSET_REGISTER.csv"
VALIDATION_PATH = ROOT / "docs" / "VALIDATION_REPORT.md"
CATALOGUE_PATH = ROOT / "docs" / "asset_catalogue.html"
REFERENCE_BOARD_PATH = ROOT / "docs" / "visual_reference_board.png"

PUBLIC_ROOT = ROOT / "public"

# A shipped budget that the validator enforces.
SHIPPED_BUDGET_BYTES = 20 * 1024 * 1024


def rel(path: Path) -> str:
    """Repository-relative POSIX path, for stable output across platforms."""
    return path.resolve().relative_to(ROOT).as_posix()


def abspath(relative: str) -> Path:
    return (ROOT / relative).resolve()


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(chunk), b""):
            digest.update(block)
    return digest.hexdigest()


@dataclass
class Manifest:
    raw: dict[str, Any]
    packs: dict[str, dict[str, Any]] = field(default_factory=dict)
    assets: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def load(cls, path: Path = MANIFEST_PATH) -> "Manifest":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            raw=data,
            packs={pack["id"]: pack for pack in data["packs"]},
            assets=list(data["assets"]),
        )


def probe_image(path: Path) -> dict[str, Any]:
    from PIL import Image

    with Image.open(path) as image:
        frame_count = getattr(image, "n_frames", 1)
        has_alpha = image.mode in {"RGBA", "LA", "PA"} or "transparency" in image.info
        alpha_min = None
        if image.mode in {"RGBA", "LA"}:
            alpha = image.convert("RGBA").getchannel("A")
            alpha_min = alpha.getextrema()[0]
        return {
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "frames": frame_count,
            "hasAlpha": bool(has_alpha),
            "minAlpha": alpha_min,
        }


def probe_audio(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(result.stdout)
    stream = next(
        (s for s in payload.get("streams", []) if s.get("codec_type") == "audio"), {}
    )
    fmt = payload.get("format", {})
    return {
        "codec": stream.get("codec_name"),
        "sampleRate": int(stream["sample_rate"]) if stream.get("sample_rate") else None,
        "channels": stream.get("channels"),
        "duration": float(fmt["duration"]) if fmt.get("duration") else None,
    }


def probe_media(path: Path, kind: str) -> dict[str, Any]:
    if kind in {"tileset", "sprite"}:
        return probe_image(path)
    if kind in {"audio-sfx", "audio-music"}:
        return probe_audio(path)
    return {}


def ensure_within_public(dest: Path) -> None:
    resolved = dest.resolve()
    if PUBLIC_ROOT.resolve() not in resolved.parents:
        raise ValueError(f"destination escapes public/: {dest}")


def stage_asset(asset: dict[str, Any], *, dry_run: bool = False) -> dict[str, Any]:
    """Copy one manifest asset into public/ and return its index record.

    Idempotent: an identical destination is left untouched, a drifted
    destination is replaced, and a missing destination is created.
    """
    source = abspath(asset["source"])
    dest = abspath(asset["dest"])
    ensure_within_public(dest)

    if not source.exists():
        raise FileNotFoundError(f"missing source for {asset['id']}: {rel(source)}")

    source_hash = sha256_file(source)
    action = "unchanged"

    if dest.exists():
        dest_hash = sha256_file(dest)
        if dest_hash != source_hash:
            if not dry_run:
                shutil.copy2(source, dest)
            action = "replaced"
    else:
        if not dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, dest)
        action = "created"

    record: dict[str, Any] = {
        "id": asset["id"],
        "kind": asset["kind"],
        "pack": asset["pack"],
        "source": asset["source"],
        "dest": asset["dest"],
        "bytes": source.stat().st_size,
        "sha256": source_hash,
        "usage": asset.get("usage", ""),
        "notes": asset.get("notes", ""),
        "action": action,
    }
    for extra in ("tileSize", "margin", "spacing", "frameIndex", "frameCount"):
        if extra in asset:
            record[extra] = asset[extra]
    return record


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)


def http_text(url: str, headers: dict[str, str] | None = None, timeout: int = 30) -> str:
    import urllib.request

    merged = {"User-Agent": USER_AGENT, "Accept": "text/html,*/*"}
    merged.update(headers or {})
    request = urllib.request.Request(url, headers=merged)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def download_file(
    url: str,
    dest: Path,
    headers: dict[str, str] | None = None,
    timeout: int = 180,
) -> str:
    """Stream a URL to disk and return the SHA-256 of what was written."""
    import hashlib
    import urllib.request

    merged = {"User-Agent": USER_AGENT}
    merged.update(headers or {})
    request = urllib.request.Request(url, headers=merged)
    dest.parent.mkdir(parents=True, exist_ok=True)

    digest = hashlib.sha256()
    with urllib.request.urlopen(request, timeout=timeout) as response, dest.open("wb") as handle:
        for block in iter(lambda: response.read(1 << 16), b""):
            handle.write(block)
            digest.update(block)
    return digest.hexdigest()


def extract_zip(archive: Path, target: Path) -> None:
    import shutil
    import zipfile

    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(target)
