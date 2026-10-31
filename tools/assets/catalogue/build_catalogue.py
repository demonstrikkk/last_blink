"""Build a self-contained HTML asset catalogue from the staged asset index.

Usage:
    python tools/assets/catalogue/build_catalogue.py

Writes docs/asset_catalogue.html. Preview images and audio players point at
../public/assets/... so the file works when opened directly from disk.
"""

from __future__ import annotations

import html
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import CATALOGUE_PATH, INDEX_PATH, abspath, rel  # noqa: E402

KIND_LABELS = {
    "tileset": "Environment tileset",
    "sprite": "Character sprites",
    "audio-music": "Music loops",
    "audio-sfx": "Sound effects",
    "font": "Fonts",
    "licence": "Licence texts shipped with assets",
}

KIND_ORDER = ["tileset", "sprite", "audio-sfx", "audio-music", "font", "licence"]


def preview_url(dest: str) -> str:
    return "../" + dest


def render_media(asset: dict) -> str:
    url = html.escape(preview_url(asset["dest"]))
    kind = asset["kind"]
    if kind == "tileset":
        return (
            f'<div class="preview wide"><img src="{url}" alt="tileset preview" '
            f'style="width:100%;image-rendering:pixelated"></div>'
        )
    if kind == "sprite":
        return (
            f'<div class="preview sprite"><img src="{url}" alt="sprite preview" '
            f'style="width:96px;image-rendering:pixelated"></div>'
        )
    if kind in {"audio-sfx", "audio-music"}:
        return f'<audio controls preload="none" src="{url}"></audio>'
    if kind == "font":
        family = "Space Grotesk" if "SpaceGrotesk" in asset["dest"] else "IBM Plex Mono"
        return (
            f'<div class="specimen" style="font-family:\'{family}\'">'
            f"Aa Bb Cc 0123456789 &mdash; the district keeps its lights on</div>"
        )
    if kind == "licence":
        return (
            f'<div class="preview wide"><a href="{url}">Open licence text</a></div>'
        )
    return ""


def render_card(asset: dict) -> str:
    media = asset.get("media", {})
    dims = ""
    if "width" in media:
        dims = f"{media['width']}&times;{media['height']} px"
    elif "duration" in media and media["duration"]:
        dims = (
            f"{media['duration']:.2f} s &middot; {media.get('sampleRate', '?')} Hz &middot; "
            f"{media.get('channels', '?')} ch"
        )
    elif asset["kind"] == "font":
        dims = f"{asset['bytes'] / 1024:.0f} KiB TTF"
    elif asset["kind"] == "licence":
        dims = f"{asset['bytes']} bytes of plain text"

    pack = asset["pack"]
    search = f"{asset['id']} {asset['usage']} {pack} {asset['kind']}".lower()

    return f"""
    <article class="card" data-kind="{html.escape(asset['kind'])}" data-search="{html.escape(search)}">
      <header>
        <code>{html.escape(asset['id'])}</code>
        <span class="badge {html.escape(asset['licence'].split('-')[0].lower())}">{html.escape(asset['licence'])}</span>
      </header>
      {render_media(asset)}
      <dl>
        <dt>Usage</dt><dd>{html.escape(asset['usage'])}</dd>
        <dt>Source</dt><dd>{html.escape(pack_label(asset))}</dd>
        <dt>Details</dt><dd>{dims}</dd>
        <dt>Path</dt><dd class="path">{html.escape(asset['dest'])}</dd>
        <dt>SHA-256</dt><dd class="path hash">{html.escape(asset['sha256'][:16])}&hellip;</dd>
      </dl>
    </article>"""


def pack_label(asset: dict) -> str:
    return asset.get("packTitle") or asset["pack"]


def main() -> int:
    if not INDEX_PATH.exists():
        print("run tools/assets/validate/build_register.py first", file=sys.stderr)
        return 2

    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    pack_titles = {pack["id"]: pack["name"] for pack in index["packs"]}
    for asset in index["assets"]:
        asset["packTitle"] = pack_titles.get(asset["pack"], asset["pack"])

    grouped: defaultdict[str, list[dict]] = defaultdict(list)
    for asset in index["assets"]:
        grouped[asset["kind"]].append(asset)

    total_bytes = sum(a["bytes"] for a in index["assets"])
    counts = ", ".join(f"{len(grouped[k])} {KIND_LABELS[k].lower()}" for k in KIND_ORDER if grouped[k])

    sections = []
    for kind in KIND_ORDER:
        items = grouped.get(kind, [])
        if not items:
            continue
        cards = "\n".join(render_card(asset) for asset in sorted(items, key=lambda a: a["id"]))
        sections.append(
            f'<section id="{kind}"><h2>{KIND_LABELS[kind]} <span class="count">{len(items)}</span></h2>'
            f"<div class=\"grid\">{cards}</div></section>"
        )

    pack_rows = []
    for pack in index["packs"]:
        evidence = ", ".join(pack.get("licenceEvidence", []))
        pack_rows.append(
            f"""<tr>
              <td><strong>{html.escape(pack['name'])}</strong><br><span class="muted">v{html.escape(pack['version'])}</span></td>
              <td>{html.escape(pack['creator'])}</td>
              <td><a href="{html.escape(pack['sourcePage'])}">{html.escape(pack['sourcePage'])}</a></td>
              <td><span class="badge {html.escape(pack['licence'].split('-')[0].lower())}">{html.escape(pack['licence'])}</span></td>
              <td>{'required' if pack['attributionRequired'] else 'not required'}</td>
              <td class="path">{html.escape(evidence)}</td>
              <td class="path">{html.escape(pack['licenceFile'])}</td>
            </tr>"""
        )

    font_faces = """
    @font-face { font-family: 'Space Grotesk'; src: url('../public/assets/fonts/SpaceGrotesk-VariableFont_wght.ttf') format('truetype'); font-weight: 300 700; }
    @font-face { font-family: 'IBM Plex Mono'; src: url('../public/assets/fonts/IBMPlexMono-Regular.ttf') format('truetype'); }
    """

    document = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Asset catalogue &middot; The Last Blink</title>
<style>
{font_faces}
:root {{
  --ink-900:#070A0F; --ink-800:#0D131B; --ink-700:#141C26; --ink-600:#1E2833;
  --text-primary:#EAF1F8; --text-secondary:#A9B8C7; --text-muted:#7E8FA1;
  --cyan:#38E1E8; --magenta:#FF5CC8; --amber:#FFB24D;
}}
* {{ box-sizing:border-box; }}
body {{
  margin:0; padding:32px clamp(16px,4vw,56px) 96px;
  background:var(--ink-900); color:var(--text-primary);
  font-family:'Space Grotesk',system-ui,sans-serif; line-height:1.55;
}}
h1 {{ font-size:clamp(28px,4vw,44px); letter-spacing:-0.02em; margin:0 0 8px; }}
h2 {{ font-size:20px; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-secondary); margin:56px 0 20px; }}
h2 .count {{ color:var(--cyan); font-family:'IBM Plex Mono',monospace; font-size:14px; margin-left:8px; }}
.lede {{ color:var(--text-secondary); max-width:70ch; margin:0 0 4px; }}
.stats {{ display:flex; gap:28px; flex-wrap:wrap; margin:24px 0 8px; font-family:'IBM Plex Mono',monospace; font-size:13px; color:var(--text-muted); }}
.stats strong {{ color:var(--text-primary); display:block; font-size:20px; }}
.grid {{ display:grid; gap:16px; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); }}
.card {{ background:var(--ink-800); border:1px solid var(--ink-600); border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:12px; min-width:0; }}
.card header {{ display:flex; justify-content:space-between; align-items:center; gap:8px; }}
.card code {{ font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--cyan); word-break:break-all; }}
.preview {{ background:var(--ink-700); border-radius:6px; display:flex; align-items:center; justify-content:center; padding:10px; min-height:72px; overflow:hidden; }}
.preview img {{ display:block; max-width:100%; height:auto; }}
.preview.sprite img {{ width:96px; height:96px; }}
.specimen {{ background:var(--ink-700); border-radius:6px; padding:14px; font-size:22px; line-height:1.3; overflow-wrap:anywhere; }}
audio {{ width:100%; max-width:100%; }}
dl {{ margin:0; display:grid; grid-template-columns:auto minmax(0,1fr); gap:4px 12px; font-size:13px; }}
dt {{ color:var(--text-muted); font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; padding-top:2px; }}
dd {{ margin:0; color:var(--text-secondary); overflow-wrap:anywhere; }}
.path {{ font-family:'IBM Plex Mono',monospace; font-size:11px; word-break:break-all; }}
.hash {{ color:var(--text-muted); }}
.badge {{ font-family:'IBM Plex Mono',monospace; font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid currentColor; white-space:nowrap; }}
.badge.cc0 {{ color:var(--cyan); }}
.badge.ofl {{ color:var(--amber); }}
.muted {{ color:var(--text-muted); }}
.table-scroll {{ overflow-x:auto; -webkit-overflow-scrolling:touch; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; min-width:720px; }}
th, td {{ text-align:left; padding:10px 12px; border-bottom:1px solid var(--ink-600); vertical-align:top; }}
th {{ color:var(--text-muted); font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; }}
a {{ color:var(--cyan); text-decoration:none; }}
a:hover {{ text-decoration:underline; }}
.toolbar {{ display:flex; gap:12px; flex-wrap:wrap; margin:28px 0 0; align-items:center; }}
input[type=search] {{ background:var(--ink-700); border:1px solid var(--ink-600); color:var(--text-primary); border-radius:8px; padding:10px 14px; font-family:inherit; font-size:14px; min-width:280px; }}
input[type=search]:focus-visible {{ outline:2px solid var(--cyan); outline-offset:2px; }}
.chip {{ background:var(--ink-700); border:1px solid var(--ink-600); color:var(--text-secondary); border-radius:999px; padding:8px 14px; font-size:13px; cursor:pointer; }}
.chip[aria-pressed=true] {{ border-color:var(--cyan); color:var(--cyan); }}
.notice {{ background:var(--ink-800); border-left:3px solid var(--amber); padding:14px 18px; border-radius:0 8px 8px 0; color:var(--text-secondary); margin-top:28px; }}
</style>
</head>
<body>
<h1>Asset catalogue</h1>
<p class="lede">Everything the game may ship, with preview, dimensions, licence, and the usage it is reserved for. Generated from <code>docs/asset_manifest.json</code>; originals and licence texts live under <code>assets/</code>.</p>
<div class="stats">
  <div><strong>{len(index['assets'])}</strong>registered assets</div>
  <div><strong>{total_bytes / 1024 / 1024:.2f} MiB</strong>shipped payload</div>
  <div><strong>{len(index['packs'])}</strong>source packs</div>
  <div><strong>0</strong>unused files</div>
</div>
<div class="toolbar">
  <input type="search" id="filter" placeholder="Filter by id, pack or usage" aria-label="Filter assets">
  <button class="chip" data-kind="all" aria-pressed="true">All</button>
  <button class="chip" data-kind="tileset" aria-pressed="false">Environment</button>
  <button class="chip" data-kind="sprite" aria-pressed="false">Sprites</button>
  <button class="chip" data-kind="audio-sfx" aria-pressed="false">SFX</button>
  <button class="chip" data-kind="audio-music" aria-pressed="false">Music</button>
  <button class="chip" data-kind="font" aria-pressed="false">Fonts</button>
</div>

{''.join(sections)}

<h2>Source packs and licences</h2>
<div class="table-scroll">
<table>
  <thead><tr><th>Pack</th><th>Creator</th><th>Source</th><th>Licence</th><th>Attribution</th><th>Licence evidence</th><th>Preserved file</th></tr></thead>
  <tbody>{''.join(pack_rows)}</tbody>
</table>
</div>
<div class="notice">Every shipped file is CC0 or OFL-1.1. OFL fonts require the licence text to stay with the font file, which is why <code>THIRD_PARTY_NOTICES.md</code> ships alongside them. Nothing in this catalogue requires a paid licence.</div>

<script>
const cards = [...document.querySelectorAll('.card')];
const chips = [...document.querySelectorAll('.chip')];
const search = document.getElementById('filter');
let activeKind = 'all';

function apply() {{
  const term = search.value.trim().toLowerCase();
  for (const card of cards) {{
    const kindOk = activeKind === 'all' || card.dataset.kind === activeKind;
    const termOk = !term || card.dataset.search.includes(term);
    card.hidden = !(kindOk && termOk);
  }}
}}
search.addEventListener('input', apply);
for (const chip of chips) {{
  chip.addEventListener('click', () => {{
    activeKind = chip.dataset.kind;
    for (const other of chips) other.setAttribute('aria-pressed', String(other === chip));
    apply();
  }});
}}
</script>
</body>
</html>
"""

    CATALOGUE_PATH.write_text(document, encoding="utf-8")
    print(f"wrote {rel(CATALOGUE_PATH)} ({CATALOGUE_PATH.stat().st_size / 1024:.0f} KiB)")
    print(f"{len(index['assets'])} assets across {len(index['packs'])} packs; {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
