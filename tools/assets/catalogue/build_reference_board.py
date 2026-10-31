"""Render docs/visual_reference_board.png from the shipped assets.

Usage:
    python tools/assets/catalogue/build_reference_board.py

The board is the visual evidence for Stage 0: palette, the night grade that
unifies the environment and character packs, the cast, the identity markers and
the type specimen.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageChops

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import REFERENCE_BOARD_PATH, abspath, rel  # noqa: E402

INK_900 = (7, 10, 15)
INK_800 = (13, 19, 27)
INK_700 = (20, 28, 38)
INK_600 = (30, 40, 51)
TEXT_PRIMARY = (234, 241, 248)
TEXT_SECONDARY = (169, 184, 199)
TEXT_MUTED = (126, 143, 161)
CYAN = (56, 225, 232)
MAGENTA = (255, 92, 200)
AMBER = (255, 178, 77)
GREEN = (111, 242, 168)
ECHO = (169, 240, 198)
BONE = (232, 220, 198)
RUST = (255, 122, 69)

FONT_DISPLAY = "public/assets/fonts/SpaceGrotesk-VariableFont_wght.ttf"
FONT_MONO = "public/assets/fonts/IBMPlexMono-Regular.ttf"

PALETTE_ROWS = [
    ("ink-900", "#070A0F", "canvas"),
    ("ink-700", "#141C26", "panel"),
    ("ink-500", "#2B3846", "structure"),
    ("steel-300", "#5A6E82", "metal"),
    ("steel-100", "#C3CFDB", "light metal"),
    ("neon-cyan", "#38E1E8", "V1 / blink"),
    ("neon-magenta", "#FF5CC8", "V2 / echo route"),
    ("neon-amber", "#FFB24D", "sodium lamp"),
    ("danger", "#FF4D5E", "blocked"),
    ("warning", "#FFC24B", "caution"),
    ("success", "#5BE58A", "verified"),
    ("identity-echo", "#A9F0C6", "ECHO trace"),
]

CAST = [
    ("cap", "Rin", "player"),
    ("woman", "Jaya", "agentic NPC"),
    ("miner", "Dax", "mechanic"),
    ("sage", "Okonkwo", "archivist"),
    ("oldwoman", "Sable", "ward elder"),
    ("kid", "Pip", "messenger"),
    ("girl", "Tessa", "child"),
]


def font(relative: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(abspath(relative)), size)


def night_grade(image: Image.Image, strength: float = 1.0) -> Image.Image:
    """Cool, desaturating night grade applied to every art pack.

    Multiplies toward a blue-grey light, pulls ~18% saturation, then lifts the
    shadows slightly so outlines stay readable on a dark canvas.
    """
    rgba = image.convert("RGBA")
    rgb = rgba.convert("RGB")

    tint = (0.72, 0.84, 1.04)
    channels = rgb.split()
    tinted = Image.merge(
        "RGB",
        [channel.point(lambda v, k=k: min(255, int(v * k))) for channel, k in zip(channels, tint)],
    )

    luminance = rgb.convert("L").convert("RGB")
    desaturated = Image.blend(tinted, luminance, 0.18 * strength)

    lifted = desaturated.point(lambda v: min(255, int(v * 0.92 + 10)))
    graded = Image.blend(rgb, lifted, strength)

    alpha = rgba.getchannel("A")
    result = graded.convert("RGBA")
    result.putalpha(alpha)
    return result


def vignette(size: tuple[int, int], strength: float = 0.55) -> Image.Image:
    width, height = size
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    cx, cy = width / 2, height / 2
    max_r = math.hypot(cx, cy)
    steps = 48
    for i in range(steps, 0, -1):
        radius = max_r * i / steps
        value = int(255 * strength * (i / steps) ** 2)
        draw.ellipse(
            [cx - radius, cy - radius * 0.78, cx + radius, cy + radius * 0.78],
            fill=255 - value,
        )
    return mask


def section(draw: ImageDraw.ImageDraw, y: int, label: str, note: str = "") -> None:
    draw.text((56, y), label.upper(), font=font(FONT_MONO, 13), fill=CYAN)
    if note:
        draw.text((56 + 12 * len(label) + 24, y), note, font=font(FONT_MONO, 13), fill=TEXT_MUTED)
    draw.line([(56, y + 22), (1544, y + 22)], fill=INK_600, width=1)


def dashed_polygon(draw, points, colour, width, dash=7, gap=6):
    for start, end in zip(points, points[1:] + points[:1]):
        length = math.hypot(end[0] - start[0], end[1] - start[1])
        if length == 0:
            continue
        steps = max(1, int(length // (dash + gap)) + 1)
        for step in range(steps):
            t0 = step * (dash + gap) / length
            t1 = min(1.0, (step * (dash + gap) + dash) / length)
            if t0 >= 1:
                break
            p0 = (start[0] + (end[0] - start[0]) * t0, start[1] + (end[1] - start[1]) * t0)
            p1 = (start[0] + (end[0] - start[0]) * t1, start[1] + (end[1] - start[1]) * t1)
            draw.line([p0, p1], fill=colour, width=width)


def dotted_circle(draw, box, colour, width, count=18):
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    rx, ry = (box[2] - box[0]) / 2, (box[3] - box[1]) / 2
    for i in range(count):
        angle = 2 * math.pi * i / count
        x = cx + rx * math.cos(angle)
        y = cy + ry * math.sin(angle)
        draw.ellipse([x - width, y - width, x + width, y + width], fill=colour)


def identity_markers(draw: ImageDraw.ImageDraw, y: int) -> None:
    box_w, box_h = 350, 190
    gap = 14
    specs = [
        ("V1", CYAN, "ring, solid", "current timeline", "circle"),
        ("V2", MAGENTA, "diamond, dashed", "alternate timeline", "diamond"),
        ("ECHO", ECHO, "hexagon, dotted + scan", "remembered dialogue", "hexagon"),
        ("MORROW", BONE, "square, notched, double", "municipal policy voice", "notch"),
    ]
    for index, (label, colour, shape_note, meaning, shape) in enumerate(specs):
        x0 = 56 + index * (box_w + gap)
        draw.rounded_rectangle([x0, y, x0 + box_w, y + box_h], radius=10, fill=INK_800, outline=INK_600)
        cx, cy, r = x0 + 62, y + 86, 34

        if shape == "circle":
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=colour, width=4)
        elif shape == "diamond":
            points = [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]
            dashed_polygon(draw, points, colour, 4)
        elif shape == "hexagon":
            points = [
                (cx + r * math.cos(math.pi / 3 * i - math.pi / 6),
                 cy + r * math.sin(math.pi / 3 * i - math.pi / 6))
                for i in range(6)
            ]
            dotted_circle(draw, [cx - r, cy - r, cx + r, cy + r], colour, 2, 20)
            draw.polygon(points, outline=colour, width=2)
            for offset in range(-20, 21, 8):
                draw.line([(cx - 26, cy + offset), (cx + 26, cy + offset)], fill=colour + (0,), width=1)
        else:
            draw.rectangle([cx - r, cy - r, cx + r, cy + r], outline=colour, width=2)
            draw.rectangle([cx - r + 6, cy - r + 6, cx + r - 6, cy + r - 6], outline=colour, width=1)
            draw.rectangle([cx + r - 14, cy - r, cx + r, cy - r + 14], fill=INK_800)
            draw.rectangle([cx + 6, cy + r + 6, cx + r, cy + r + 12], fill=RUST)

        draw.text((x0 + 120, y + 40), label, font=font(FONT_DISPLAY, 26), fill=colour)
        draw.text((x0 + 120, y + 76), shape_note, font=font(FONT_MONO, 12), fill=TEXT_SECONDARY)
        draw.text((x0 + 120, y + 100), meaning, font=font(FONT_MONO, 12), fill=TEXT_MUTED)
        draw.text((x0 + 120, y + 132), "never colour alone", font=font(FONT_MONO, 12), fill=TEXT_MUTED)


def main() -> int:
    width, height = 1600, 1320
    board = Image.new("RGBA", (width, height), INK_900 + (255,))
    draw = ImageDraw.Draw(board)

    draw.text((56, 40), "THE LAST BLINK — VISUAL REFERENCE", font=font(FONT_DISPLAY, 38), fill=TEXT_PRIMARY)
    draw.text(
        (56, 92),
        "Orthogonal top-down · 16×16 tiles · integer 2× scale · retro-futurist industrial city at night · restrained neon",
        font=font(FONT_MONO, 13),
        fill=TEXT_SECONDARY,
    )

    section(draw, 136, "Palette", "WCAG-checked text tokens · see docs/contrast_report.md")

    swatch_w, swatch_h, gap = 110, 66, 18
    for index, (name, hex_value, role) in enumerate(PALETTE_ROWS):
        x = 56 + index * (swatch_w + gap)
        colour = tuple(int(hex_value[i : i + 2], 16) for i in (1, 3, 5))
        draw.rounded_rectangle([x, 176, x + swatch_w, 176 + swatch_h], radius=6, fill=colour, outline=INK_600)
        draw.text((x, 250), name, font=font(FONT_MONO, 11), fill=TEXT_PRIMARY)
        draw.text((x, 266), hex_value, font=font(FONT_MONO, 11), fill=TEXT_MUTED)
        draw.text((x, 282), role, font=font(FONT_MONO, 10), fill=TEXT_MUTED)

    section(draw, 322, "Night grade", "the same tileset, before and after the shared lighting pass")

    tileset = Image.open(abspath("public/assets/environment/modern-city/tilemap.png"))
    crop = tileset.crop((0, 0, 18 * 16, 9 * 16)).convert("RGBA")
    scale = 2
    raw_panel = crop.resize((crop.width * scale, crop.height * scale), Image.NEAREST)
    graded_crop = night_grade(crop)
    graded_panel = graded_crop.resize((crop.width * scale, crop.height * scale), Image.NEAREST)

    panel_y = 360
    for offset, panel, label in [(0, raw_panel, "raw source"), (raw_panel.width + 24, graded_panel, "night grade")]:
        x = 56 + offset
        draw.text((x, panel_y - 22), label, font=font(FONT_MONO, 12), fill=TEXT_MUTED)
        backdrop = Image.new("RGBA", panel.size, INK_800 + (255,))
        backdrop.alpha_composite(panel)
        backdrop.putalpha(vignette(panel.size, 0.35))
        board.paste(backdrop, (x, panel_y))

    section(draw, 700, "Cast", "one 16×16 silhouette per role, 2-frame step cycle, per-character tint at runtime")

    cast_y = 742
    for index, (folder, name, role) in enumerate(CAST):
        x = 56 + index * 214
        frame = Image.open(abspath(f"public/assets/characters/{folder}/1.png")).convert("RGBA")
        frame = night_grade(frame)
        big = frame.resize((96, 96), Image.NEAREST)
        draw.rounded_rectangle([x, cast_y, x + 190, cast_y + 150], radius=8, fill=INK_800, outline=INK_600)
        board.alpha_composite(big, (x + 47, cast_y + 18))
        draw.text((x + 16, cast_y + 104), name, font=font(FONT_DISPLAY, 17), fill=TEXT_PRIMARY)
        draw.text((x + 16, cast_y + 128), role, font=font(FONT_MONO, 10), fill=TEXT_MUTED)

    section(draw, 918, "Identity language", "colour + shape + stroke pattern + label, so state never depends on hue")

    identity_markers(draw, 958)

    section(draw, 1170, "Type", "Space Grotesk for voice, IBM Plex Mono for machine output")

    draw.text((56, 1204), "The district keeps its lights on.", font=font(FONT_DISPLAY, 30), fill=TEXT_PRIMARY)
    draw.text(
        (56, 1244),
        "EVIDENCE 04 · ANCHOR 0x1F · MORROW: \"compliance is a courtesy you extend to the living.\"",
        font=font(FONT_MONO, 13),
        fill=TEXT_SECONDARY,
    )

    board = board.convert("RGB")
    REFERENCE_BOARD_PATH.parent.mkdir(parents=True, exist_ok=True)
    board.save(REFERENCE_BOARD_PATH, optimize=True)
    print(f"wrote {rel(REFERENCE_BOARD_PATH)} ({REFERENCE_BOARD_PATH.stat().st_size / 1024:.0f} KiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
