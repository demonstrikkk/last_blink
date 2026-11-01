import json
import time

from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto("http://localhost:5177/?debug=1", wait_until="networkidle")
    page.wait_for_selector(".hud-topbar", timeout=30000)
    time.sleep(2)
    for _ in range(3):
        cont = page.get_by_role("button", name="Continue")
        if cont.count():
            cont.click(); time.sleep(0.4); continue
        enter = page.get_by_role("button", name="Enter Relay Street")
        if enter.count():
            enter.click(); time.sleep(0.4)
        break

    page.evaluate("""() => {
      const s = window.__lastBlinkGame.scene.getScene('DistrictScene');
      s.player.x = 59 * 16 + 8; s.player.y = 31 * 16 + 16;
    }""")
    time.sleep(1.0)
    print(json.dumps(page.evaluate("""() => {
      const s = window.__lastBlinkGame.scene.getScene('DistrictScene');
      return { lastPromptId: s.lastPromptId, player: {x:s.player.x,y:s.player.y}, companion: s.companionPos };
    }"""), ensure_ascii=True))
    print("prompt:", page.locator(".interact-prompt").inner_text() if page.locator(".interact-prompt").count() else "none")
    print("all visible:", page.locator(".interact-prompt").count())
    print(page.evaluate("""() => [...document.querySelectorAll('.interact-prompt')].map(n => n.innerText)"""))
    browser.close()
