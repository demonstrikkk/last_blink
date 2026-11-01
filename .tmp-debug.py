import json
import pathlib
import time

from playwright.sync_api import sync_playwright

OUT = pathlib.Path(".playwright-cli")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    logs = []
    page.on("console", lambda msg: logs.append(f"{msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: logs.append(f"pageerror: {err}"))
    page.goto("http://localhost:5177", wait_until="load")
    time.sleep(5)
    page.screenshot(path=str(OUT / "debug-boot.png"))
    info = {
        "title": page.title(),
        "canvasCount": page.locator("canvas").count(),
        "hud": page.locator(".hud-topbar").count(),
        "bodyText": page.locator("body").inner_text()[:600],
        "logs": logs[-40:],
    }
    print(json.dumps(info, indent=2))
    browser.close()
