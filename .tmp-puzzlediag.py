import json
import time

from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto("http://localhost:5177/?debug=1", wait_until="networkidle")
    page.wait_for_selector(".hud-topbar", timeout=30000)
    time.sleep(2)
    enter = page.get_by_role("button", name="Enter Relay Street")
    print("enter count", enter.count())
    if enter.count():
        enter.click()
        time.sleep(0.8)
    diag = page.evaluate(
        """() => {
          const game = window.__lastBlinkGame;
          const scene = game && game.scene.getScene('DistrictScene');
          if (!scene) return { error: 'no scene' };
          scene.player.x = 59 * 16 + 8;
          scene.player.y = 31 * 16 + 24;
          return {
            active: scene.scene.isActive(),
            paused: scene.scene.isPaused(),
            x: scene.player.x,
            y: scene.player.y,
            lastPromptId: scene.lastPromptId,
          };
        }"""
    )
    time.sleep(1.0)
    after = page.evaluate(
        """() => {
          const game = window.__lastBlinkGame;
          const scene = game && game.scene.getScene('DistrictScene');
          return scene ? { x: scene.player.x, y: scene.player.y, lastPromptId: scene.lastPromptId } : null;
        }"""
    )
    print(json.dumps({"diag": diag, "after": after, "prompt": page.locator(".interact-prompt").count(),
                      "loading": page.locator(".world-loading").count(),
                      "brief": page.locator(".brief-panel").count(),
                      "canvas": page.locator("canvas").count()}, ensure_ascii=False))
    page.screenshot(path=".playwright-cli/puzzle-diag.png")
    browser.close()
