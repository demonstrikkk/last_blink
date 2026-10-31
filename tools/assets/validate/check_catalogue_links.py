import re
from pathlib import Path

root = Path(".").resolve()
html_path = root / "docs" / "asset_catalogue.html"
html = html_path.read_text(encoding="utf-8")

refs = re.findall(r'(?:src|href)="([^"]+)"', html)
missing = []
checked = 0
for ref in refs:
    if ref.startswith(("http://", "https://", "#", "mailto:")):
        continue
    target = (html_path.parent / ref).resolve()
    checked += 1
    if not target.exists():
        missing.append((ref, str(target)))

print(f"local references: {checked}, missing: {len(missing)}")
for ref, target in missing:
    print("MISSING", ref, "->", target)

# crude tag balance check for the containers we generate
for tag in ("article", "section", "table", "thead", "tbody", "dl", "div"):
    opens = len(re.findall(rf"<{tag}[\s>]", html))
    closes = len(re.findall(rf"</{tag}>", html))
    status = "ok" if opens == closes else "MISMATCH"
    print(f"{tag:8} open={opens:3} close={closes:3} {status}")
