# Visual Style Guide — The Last Blink: Second Settlement

**Status:** Stage 0 deliverable for the first gate. Applies to every scene, sprite, panel and sound cue from here on.
**Reference board:** [`visual_reference_board.png`](./visual_reference_board.png) · **Palette maths:** [`contrast_report.md`](./contrast_report.md)

---

## 1. Intent

A city that survived the first blink and never recovered its confidence. The player reads the district as **industrial infrastructure at night**: concrete, wet asphalt, sodium lamps, cable runs, and a small amount of neon that means something because it is rare.

The tone is restrained. Neon is a signal, not decoration: cyan marks the current timeline, magenta marks the timeline that did not happen, pale green marks remembered speech, bone white marks institutional policy. If everything glows, nothing does.

---

## 2. Camera, grid and scale

| Property | Value | Reason |
|---|---|---|
| Projection | Orthogonal top-down (no isometric skew, no perspective) | Matches the environment tileset and keeps collision maths trivial |
| Tile size | 16 × 16 px | Native size of both the environment and character packs |
| Render scale | Integer 2× only | 1.5× and 2.5× produce uneven pixel widths and shimmer while walking |
| Logical resolution | 512 × 288 px (32 × 18 tiles) | Fits a 1024 × 576 window at 2×; letterboxed to any other size |
| Camera | Follows the player, dead-zone 64 × 40 px, snapped to whole pixels | Prevents sub-pixel crawl on tile seams |
| Sprite anchor | Feet, 16 × 16 with the body occupying y = 2…15 | Keeps depth sorting honest against props |
| Depth sort | `y + height`, ties broken by entity id | Deterministic draw order, also stable across reloads |
| Max viewport | Never scale above 8× or below 2×; below 2× show a "window too small" panel | 1× makes 16 px text illegible |

**Rule:** nothing in the world layer may be drawn at a fractional pixel offset. The camera position, sprite positions and shadows are all integers. UI is the only layer allowed sub-pixel positioning, because text renders better that way.

---

## 3. Palette

Twelve working tokens plus text tokens. Full contrast table: [`contrast_report.md`](./contrast_report.md).

### Night neutrals

| Token | Hex | Use |
|---|---|---|
| `ink-900` | `#070A0F` | Canvas, letterbox, deepest shadow |
| `ink-800` | `#0D131B` | Panel background |
| `ink-700` | `#141C26` | Raised panel, input background |
| `ink-600` | `#1E2833` | Panel border, table rules |
| `ink-500` | `#2B3846` | Structural blocks, disabled fill |
| `steel-400` | `#3E4E5F` | Secondary structure |
| `steel-300` | `#5A6E82` | Metal, cable, pipe |
| `steel-200` | `#8A9BAE` | Light metal, icon fill |
| `steel-100` | `#C3CFDB` | Highlight edge, cool light |

### Diegetic neon and semantics

| Token | Hex | Use |
|---|---|---|
| `neon-cyan` | `#38E1E8` | V1 identity, blink charge, primary interactive accent |
| `neon-magenta` | `#FF5CC8` | V2 identity, alternate-timeline artefacts |
| `neon-amber` | `#FFB24D` | Sodium lamp pools, warm practical light |
| `neon-green` | `#6FF2A8` | Verified evidence, confirmed anchor |
| `danger` | `#FF4D5E` | Blocked action, lost anchor, refusal |
| `warning` | `#FFC24B` | Caution, unresolved contradiction |
| `success` | `#5BE58A` | Quest step accepted |
| `info` | `#58C8FF` | Neutral system message |
| `identity-echo` | `#A9F0C6` | ECHO trace, remembered dialogue |
| `identity-morrow` | `#E8DCC6` | MORROW voice and chrome |
| `identity-morrow-accent` | `#FF7A45` | MORROW active volition, policy stamp |

### Text tokens

| Token | Hex | Worst-case contrast |
|---|---|---|
| `text-primary` | `#EAF1F8` | 13.11:1 (on `ink-600`) |
| `text-secondary` | `#A9B8C7` | 7.37:1 (on `ink-600`) |
| `text-muted` | `#7E8FA1` | 4.50:1 (on `ink-600`) — decorative/disabled only |

**Budget:** at most three palette colours plus two neutrals in a single 16 × 16 tile. More than that and the tile reads as noise at 2×.

---

## 4. Lighting and the night grade

The environment and character packs come from different artists, so a single shared lighting pass is what makes them look like one game. It is a fixed transform, applied identically to both, not a per-scene judgement call.

| Step | Operation | Value |
|---|---|---|
| 1. Tint | Multiply per channel | R × 0.72, G × 0.84, B × 1.04 |
| 2. Desaturate | Blend toward luminance | 18 % |
| 3. Shadow lift | `v × 0.92 + 10` | Keeps 1 px outlines visible on `ink-900` |
| 4. Vignette | Radial ellipse, 78 % vertical squash | 35 % at the edges, 0 % at centre |

Applied to the same tileset crop, the before/after pair on the reference board shows the intended result: warm brickwork cools to slate, the sodium lamp accents stay warm, and the cyan signage becomes the brightest thing on screen.

**Practical lights are separate.** Lamp pools, terminal glow and blink flash are additive overlays drawn above the graded layer, so they can animate without re-grading the source art.

---

## 5. Environment rules

1. **Ground first.** Asphalt, pavement and dirt are the lowest value-contrast surfaces; nothing decorative may compete with a walkable edge.
2. **One outline rule.** Tiles carry no outline. Characters, props and interactive objects carry a 1 px near-black outline (`#0A0C10`) so they separate from the ground at 2×.
3. **Contact shadow.** Every character and prop gets a 1 px high, 2 px inset ellipse at 45 % black under its feet. No ambient drop shadows.
4. **Interactables get one accent.** A single `neon-cyan` 1 px pip or 2 px bracket marks anything the player can touch. Everything else stays neutral.
5. **No text baked into tiles.** Signage is either abstract glyph tiles or UI text, so it can be localised and read by a screen reader.
6. **Walkable edge honesty.** A tile that looks walkable must be walkable. No decorative floor that blocks movement.

---

## 6. Characters

| Property | Rule |
|---|---|
| Canvas | 16 × 16, feet on the bottom row |
| Body height | 12–14 px; head 6 px, torso 5 px, legs 3 px |
| Outline | 1 px `#0A0C10` on the silhouette only |
| Palette | 5–6 colours per character, drawn from the night palette |
| Animation | 2-frame step cycle (the pack's authored `1.png` / `2.png`) |
| Frame rate | Idle 2 fps, walking 8 fps, alternating frames |
| Tinting | Per-character `setTint` at ±12 % of the base silhouette colour |
| Facing | Single facing with a vertical bob; the pack has no directional frames (see §12) |

The cast is deliberately silhouette-first: a cap for the player, an apron for the mechanic, a long coat for the archivist, a shawl for the ward elder. At 16 px, silhouette and palette do the identification work, not detail.

---

## 7. Identity language

Every timeline and voice has **a colour, a shape, a stroke pattern and a text label**. Colour is never the only carrier.

| Identity | Colour | Shape | Stroke | Label |
|---|---|---|---|---|
| **V1** current timeline | `neon-cyan` | circle | solid 2 px | `V1` in mono |
| **V2** alternate timeline | `neon-magenta` | diamond | dashed | `V2` in mono |
| **ECHO** remembered speech | `identity-echo` | hexagon | dotted + horizontal scan lines | `ECHO` in mono, dialogue in italic |
| **MORROW** municipal policy | `identity-morrow` | square with a notched corner | double stroke, rust accent bar | `MORROW` in mono, all caps |

Rules:

- A V2 element always shows the diamond, even in a screenshot with colour removed.
- ECHO dialogue is quoted, italic, prefixed with `ECHO:` and never presented as a live speaker.
- MORROW never appears as a character sprite. It is chrome, type and sound only, so it cannot be mistaken for an NPC.

---

## 8. Evidence and state language

| State | Colour | Glyph | Word |
|---|---|---|---|
| Unread | `steel-200` | hollow square | `NEW` |
| Read | `text-secondary` | filled square | — |
| Verified | `neon-green` | check | `VERIFIED` |
| Contradicted | `warning` | crossed bars | `CONFLICT` |
| Anchor | `neon-cyan` | ring | `ANCHOR` |
| Lost | `danger` | broken ring | `LOST` |

A contradiction is always shown with both the glyph and the word; the two-source comparison view uses `warning` for the conflicting claim only, never for the whole panel.

---

## 9. Typography

| Role | Face | Size | Weight | Line height |
|---|---|---|---|---|
| Title | Space Grotesk | 40 / 32 / 24 px | 600 | 1.15 |
| Section | Space Grotesk | 18 px | 600 | 1.25 |
| Body | Space Grotesk | 16 px | 400 | 1.55 |
| UI label | Space Grotesk | 14 px | 500 | 1.4 |
| Machine output, codes, MORROW | IBM Plex Mono | 13 px | 400 | 1.5 |
| Micro label | IBM Plex Mono | 11 px | 400, uppercase, 0.08 em tracking | 1.3 |

Both faces are SIL OFL 1.1 and ship with their licence files. Body text never drops below 13 px; the 11 px mono size is reserved for non-essential labels that are duplicated in an accessible name.

---

## 10. UI construction

- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48 px. Nothing between.
- **Radii:** 6 px inputs, 10 px panels, 999 px chips.
- **Borders:** 1 px `ink-600`; active state swaps the border to `neon-cyan`, never thickens it.
- **Targets:** minimum 44 × 44 px hit area, including 32 px visual chips (padding makes up the difference).
- **Focus:** 2 px `neon-cyan` ring, 2 px offset, visible on keyboard focus only.
- **Dialogue:** maximum measure 68 characters, portrait-free by default; speaker name in mono above the line.
- **Panels:** never more than two nested surfaces. A panel inside a panel inside a panel is a design failure, not a layout.

---

## 11. Accessibility rules

1. **Contrast.** Body text ≥ 4.5:1 (actual worst case 7.37:1). Large text and icon strokes ≥ 3:1. `text-muted` never carries unique information.
2. **Colour independence.** Every state pairs colour with a glyph, stroke pattern, or word (§7, §8). Verified by rendering the identity markers with colour removed.
3. **Motion.** All motion respects `prefers-reduced-motion`: blink flashes become a single 120 ms fade, camera shake becomes a 1 px nudge, the scanline shimmer stops.
4. **Flashing.** No more than three luminance flashes in any one second; the blink effect is a single ramp, not a strobe.
5. **Keyboard.** The whole game is playable without a pointer: arrow/WASD to move, `E` interact, `Tab` cycle targets, `Esc` close panel, `Space` advance dialogue.
6. **Screen reader.** Dialogue, evidence changes and MORROW announcements go through a polite live region. The canvas itself is `aria-hidden`; the game state is mirrored in DOM text.
7. **Zoom.** UI scales with the window up to 4× without clipping or overlapping; the world layer letterboxes instead of stretching.
8. **No colour-only minimap.** The minimap uses shape markers plus a legend.

---

## 12. Asset requirements

| Category | Requirement | Enforced by |
|---|---|---|
| Environment | One 16 × 16 sheet, alpha channel, dimensions divisible by 16 | `validate_assets.py` `img.tile-*` |
| Characters | 16 × 16 RGBA, 2 frames per role, transparent background | `img.sprite-size`, `anim.frame-count` |
| SFX | Ogg Vorbis, 0.02–8 s, mean −45…−3 dB | `audio.duration`, `audio.loudness` |
| Music | Ogg Vorbis, 8–180 s, loop point at end | `audio.duration` |
| Fonts | TTF/OTF with OFL text preserved | `font.signature`, `pack.licence-text` |
| Budget | ≤ 20 MiB shipped, zero unused files | `ship.budget`, `ship.orphans` |

---

## 13. Recorded incompatibilities and how they are handled

These are real gaps in the available art, not preferences. Each has a decision and a verification method.

1. **Character art and environment art come from different artists.** The character pack is warmer and softer than the flat city tileset. *Handled by* the shared night grade (§4) plus a 1 px outline on characters only (§5.2). *Verified by* the before/after pair on the reference board and, at Stage 4, a side-by-side screenshot in the actual scene.
2. **No four-directional walk.** The character pack ships a single facing with a two-frame step. *Decision:* accept it. Movement uses a vertical bob, facing is implied by movement direction through the shadow and a horizontal flip. *Consequence:* no back-facing view; scenes are framed so the player mostly reads from the front and side. *Risk:* low, it is a narrative game, not an action game.
3. **Music is chiptune, the setting is industrial.** *Handled by* using music only as a bed under ambience, at −18 dB relative to SFX, and choosing the three least melodic loops. *Consequence:* the district must carry atmosphere through sound effects (engine, door, field hum) rather than score.
4. **No authored UI kit.** All panels are drawn in CSS, not from a sprite sheet. *Decision:* keep it that way — it is sharper at any scale and needs no extra asset budget.

---

## 14. Do / Don't

**Do**

- Grade every sprite through the same night transform before it reaches the screen.
- Keep one accent per scene so the eye knows where to go.
- Snap world positions to whole pixels.
- Pair every colour-coded state with a glyph and a word.

**Don't**

- Add a new hue because a screen feels flat; add contrast or a lamp pool instead.
- Outline environment tiles.
- Bake readable text into tiles.
- Animate at a non-integer scale.
- Use `neon-magenta` for anything except V2 and its artefacts.
