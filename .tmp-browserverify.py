"""Browser verification for THE LAST BLINK: boot, HUD, Pulse, Brief, Case Board,
ECHO Meko archive, AI diagnostics and cloud save against the real server."""
import json
import pathlib
import time
import traceback

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5177"
OUT = pathlib.Path(".playwright-cli")
OUT.mkdir(exist_ok=True)

report = {"errors": [], "console": [], "checks": {}, "steps": []}


def shot(page, name):
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=False)


def text(page, selector, default=None):
    try:
        node = page.locator(selector).first
        if node.count() and node.is_visible():
            return node.inner_text().strip()
    except Exception:
        pass
    return default


def step(page, name, fn):
    try:
        fn()
        report["steps"].append({"step": name, "ok": True})
    except Exception as error:
        report["steps"].append({"step": name, "ok": False, "error": str(error)[:300]})
        shot(page, f"fail-{name}")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on(
        "console",
        lambda msg: report["console"].append(f"{msg.type}: {msg.text}")
        if msg.type == "error"
        else None,
    )
    page.on("pageerror", lambda err: report["errors"].append(str(err)))

    page.goto(BASE, wait_until="networkidle")
    page.wait_for_selector(".hud-topbar", timeout=30000)
    page.wait_for_selector("canvas", timeout=30000)
    time.sleep(2.0)
    shot(page, "verify-01-boot")

    enter = page.get_by_role("button", name="Enter Relay Street")
    report["checks"]["introShown"] = enter.count() > 0
    if enter.count() > 0:
        shot(page, "verify-02-brief")
        enter.click()
        time.sleep(0.8)

    report["checks"]["clock"] = text(page, ".hud-clock")
    report["checks"]["remaining"] = text(page, ".hud-clock-remaining")
    report["checks"]["loop"] = text(page, ".hud-loop-badge")
    report["checks"]["cloudChipBefore"] = text(page, ".hud-cloud-chip")
    minimap_before = text(page, ".hud-minimap-card")

    page.keyboard.press("q")
    time.sleep(0.9)
    report["checks"]["pulseToast"] = text(page, ".toast")
    shot(page, "verify-03-pulse")

    page.mouse.click(1200, 820)
    page.keyboard.down("ArrowUp")
    time.sleep(1.4)
    page.keyboard.up("ArrowUp")
    page.keyboard.down("ArrowLeft")
    time.sleep(1.4)
    page.keyboard.up("ArrowLeft")
    time.sleep(0.5)
    report["checks"]["minimapBefore"] = minimap_before
    report["checks"]["minimapAfterWalk"] = text(page, ".hud-minimap-card")
    report["checks"]["clockAfterWalking"] = text(page, ".hud-clock")
    shot(page, "verify-04-walk")

    def open_ledger():
        page.get_by_role("button", name="Case Board").click()
        time.sleep(0.8)
        shot(page, "verify-05-ledger")
        report["checks"]["ledgerTabs"] = text(page, ".ledger-tabs")

    step(page, "ledger", open_ledger)
    for tab in ("Challenges", "Decisions", "Endings", "Evidence"):
        node = page.get_by_role("tab", name=tab)
        if node.count() and node.first.is_visible():
            node.first.click()
            time.sleep(0.4)
            shot(page, f"verify-05-{tab.lower()}")
    page.keyboard.press("Escape")
    time.sleep(0.5)

    def ask_meko():
        page.get_by_role("button", name="ECHO", exact=True).click()
        time.sleep(0.7)
        page.get_by_role("button", name="Meko archive").click()
        time.sleep(0.3)
        page.get_by_placeholder("Relay 7 zeroing charge ward protocol").fill(
            "relay seven zeroing charge ward protocol preservation hold"
        )
        page.get_by_role("button", name="Query Meko archive").click()
        page.wait_for_selector(".echo-answer", timeout=30000)
        time.sleep(0.6)
        shot(page, "verify-06-meko")
        report["checks"]["mekoAnswer"] = text(page, ".echo-archive")

    step(page, "meko", ask_meko)
    page.keyboard.press("Escape")
    time.sleep(0.5)

    def diagnostics():
        page.get_by_role("button", name="AI DIAG").click()
        time.sleep(2.0)
        shot(page, "verify-07-diagnostics")
        report["checks"]["diagnostics"] = text(page, ".echo-panel")

    step(page, "diagnostics", diagnostics)
    page.keyboard.press("Escape")
    time.sleep(0.5)

    def cloud_save():
        page.get_by_role("button", name="SAVE").click()
        deadline = time.time() + 25
        while time.time() < deadline:
            chip = text(page, ".hud-cloud-chip", default="")
            if chip and "CLOUD" in chip and "…" not in chip and "—" not in chip:
                break
            time.sleep(0.5)
        report["checks"]["cloudChipAfterSave"] = text(page, ".hud-cloud-chip")
        report["checks"]["saveButton"] = text(page, ".hud-save-btn")
        shot(page, "verify-08-saved")

    step(page, "cloud", cloud_save)
    browser.close()

print(json.dumps(report, indent=2)[:9000])
