import json
import time

from playwright.sync_api import sync_playwright

TARGETS = [
    ("frequency_console", 139, 34),
    ("puzzle_timeline", 59, 31),
    ("puzzle_contradiction", 30, 73),
    ("relay_disarm", 34, 28),
]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    logs = []
    page.on("console", lambda msg: logs.append(f"{msg.type}: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda err: logs.append(f"pageerror: {err}"))

    page.goto("http://localhost:5177/?debug=1", wait_until="networkidle")
    page.wait_for_selector(".hud-topbar", timeout=30000)
    time.sleep(2)
    for _ in range(3):
        cont = page.get_by_role("button", name="Continue")
        if cont.count():
            cont.click()
            time.sleep(0.5)
            continue
        enter = page.get_by_role("button", name="Enter Relay Street")
        if enter.count():
            enter.click()
            time.sleep(0.5)
        break
    print("brief open:", page.locator(".brief-layer").count())

    for target_id, tx, ty in TARGETS:
        info = page.evaluate(
            """({tx, ty}) => {
              const game = window.__lastBlinkGame;
              if (!game) return { error: 'no game' };
              const scene = game.scene.getScene('DistrictScene');
              if (!scene) return { error: 'no scene' };
              scene.player.x = tx * 16 + 8;
              scene.player.y = ty * 16 + 16;
              return { ok: true, x: scene.player.x, y: scene.player.y };
            }""",
            {"tx": tx, "ty": ty},
        )
        time.sleep(0.9)
        prompt = page.locator(".interact-prompt")
        prompt_text = prompt.inner_text() if prompt.count() else "(no prompt)"
        state = {"target": target_id, "teleport": info, "prompt": prompt_text}
        if prompt.count():
            prompt.click()
            time.sleep(0.9)
            panel = page.locator(".puzzle-panel")
            state["panel"] = panel.count()
            if panel.count():
                state["panelText"] = panel.inner_text()[:700]
                state["buttons"] = page.locator(".puzzle-panel button:visible").all_inner_texts()
                page.keyboard.press("Escape")
                time.sleep(0.5)
        print(json.dumps(state, ensure_ascii=True))

    print("logs:", logs[-8:])
    browser.close()
