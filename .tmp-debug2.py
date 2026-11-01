import json
import pathlib
import time

from playwright.sync_api import sync_playwright

OUT = pathlib.Path(".playwright-cli")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    logs = []
    page.on("console", lambda msg: logs.append(f"{msg.type}: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda err: logs.append(f"pageerror: {err}"))
    reqs = []
    page.on("request", lambda req: reqs.append(f"{req.method} {req.url}") if "/api/" in req.url else None)
    page.on("response", lambda res: reqs.append(f"{res.status} {res.url}") if "/api/" in res.url else None)

    page.goto("http://localhost:5177", wait_until="networkidle")
    page.wait_for_selector(".hud-topbar", timeout=30000)
    time.sleep(2)
    enter = page.get_by_role("button", name="Enter Relay Street")
    if enter.count():
        enter.click()
        time.sleep(0.8)

    page.get_by_role("button", name="ECHO", exact=True).click()
    time.sleep(1.0)
    page.screenshot(path=str(OUT / "debug-echo.png"))
    buttons = page.locator("button:visible").all_inner_texts()
    print(json.dumps({"echoPanel": page.locator(".echo-panel").count(), "buttons": buttons[:30]}, indent=2))

    mode = page.get_by_role("button", name="Meko archive")
    print("mode count:", mode.count())
    if mode.count():
        mode.click()
        time.sleep(0.5)
        page.get_by_placeholder("Relay 7 zeroing charge ward protocol").fill(
            "relay seven zeroing charge ward protocol preservation hold"
        )
        page.get_by_role("button", name="Query Meko archive").click()
        page.wait_for_selector(".echo-answer", timeout=30000)
        time.sleep(0.5)
        page.screenshot(path=str(OUT / "debug-meko.png"))
        print("meko:", page.locator(".echo-archive").inner_text()[:1200])

    page.keyboard.press("Escape")
    time.sleep(0.5)

    save = page.locator(".hud-save-btn")
    print("saveVisible:", save.is_visible(), "enabled:", save.is_enabled())
    try:
        save.click(timeout=5000)
    except Exception as error:
        print("save click failed:", str(error)[:400])
        page.screenshot(path=str(OUT / "debug-save-blocked.png"))
        print("topmost at save:", page.evaluate(
            "() => { const el = document.elementFromPoint(1380, 30); return el ? el.outerHTML.slice(0,200) : 'none'; }"
        ))
    deadline = time.time() + 20
    while time.time() < deadline:
        chip = page.locator(".hud-cloud-chip").inner_text()
        if "CLOUD ✓" in chip or "CLOUD !" in chip:
            break
        time.sleep(0.5)
    print("chip:", page.locator(".hud-cloud-chip").inner_text())
    page.screenshot(path=str(OUT / "debug-saved.png"))

    print("logs:", logs[-10:])
    print("api:", reqs)
    browser.close()
