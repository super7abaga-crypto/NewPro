# Original project vs Mystery Island 3D — forensic comparison

Reference archive: `mystery_island-main.zip` (36 entries), extracted and inspected in full.
Comparison target: `mystery-island-3d/` at commit `7b12c21`.

Classification vocabulary used throughout: **VERIFIED IN ORIGINAL PROJECT**, **VERIFIED IN 3D PROJECT**,
**MISSING IN 3D PROJECT**, **IMPLEMENTED INCORRECTLY**, **IMPROVEMENT RECOMMENDED**, **NOT VERIFIABLE**.

---

## 1. Archive inventory

| File | Size | Role |
|---|---|---|
| `main.py` | 7,980 | Canonical CLI game and rules |
| `tests/test_game.py` | 3,631 | CLI unit tests |
| `README.md` | 4,068 | Rules, controls, how to run |
| `README_ALIVE.md` | 948 | Notes on the web motion upgrade |
| `LICENSE` | 35,149 | **GNU GPL v3** |
| `web/index.html` | 3,664 | Web shell: intro, character select, HUD, touch pads |
| `web/third-person.js` | 24,508 | Web game: markers, state, camera, interaction |
| `web/world.js` | 28,550 | Physics world: platforms, jumps, rolls, ledges |
| `web/main.js` | 32,971 | Rendering, painted scene art, player figure |
| `web/pose.js` | 7,793 | Pose blender: idle/walk/run/sprint/jump/land/crouch/slide/turn/interact/hurt |
| `web/alive.js` | 8,867 | Wind sway, mist, leaves, ground ripple |
| `web/style.css`, `web/third-person.css` | 10,836 / 10,193 | Styling |
| `web/tests/movement.test.js` | 7,925 | Double jump, roll, ledge hang, climb |
| `web/tests/pose.test.js` | 4,124 | Pose blending |
| `web/tests/water.test.js` | 7,795 | Water behaviour |
| `web/img/` (13 files) | ~2.4 MB | Painted scene art and four character figures |

The original is not only a CLI: it contains a **2.5D painted web game** with a full parkour physics
layer and a four-character selection screen.

---

## 2. Comparison matrix

| Category | Finding | Status |
|---|---|---|
| Game mechanics | Five locations, rope and lantern gates, energy 5, −1 per move, win on beacon, loss at 0 energy | **VERIFIED IN BOTH** |
| Locations | All five present in both | **VERIFIED IN BOTH** |
| Location graph | Original: `Beach → {Jungle, Old Bridge}`, `Old Bridge → {Beach, Cave, Lighthouse}`. 3D: `Beach → Jungle` only, `Old Bridge → {Cave, Lighthouse}` | **IMPLEMENTED INCORRECTLY** in 3D |
| Inventory | Collection restricted to the correct location; duplicate refused with the same wording | **VERIFIED IN BOTH** |
| Rope gate | Bridge/Lighthouse requires rope | **VERIFIED IN BOTH** |
| Lantern gate | Beacon requires lantern at the Lighthouse | **VERIFIED IN BOTH** |
| Energy | Start 5, max 5, −1 per move, exhaustion ends the run | **VERIFIED IN BOTH** |
| Navigation | Invalid move rejected without changing state | **VERIFIED IN BOTH** |
| Game outcomes | Win sets won + game over; energy loss sets game over | **VERIFIED IN BOTH** |
| Save system | Original has none (in-memory only); 3D adds localStorage save/continue | **VERIFIED IN 3D PROJECT (extension)** |
| Player name | Original accepts any non-empty trimmed name; 3D rejected digits and symbols until this review | **IMPLEMENTED INCORRECTLY** — corrected below |
| Character selection | Original offers four operatives (castaway, explorer, sailor, scavenger) | **MISSING IN 3D PROJECT** |
| Stamina | Original web HUD has a stamina bar | **MISSING IN 3D PROJECT** |
| Pose system | Original blends idle/walk/run/sprint/rise/apex/fall/land/crouch/crouch-walk/slide/wall-cling/turn/interact/hurt | **MISSING IN 3D PROJECT** |
| Parkour | Original has double jump, roll on hard landing, ledge hang, climb-up, drop | **MISSING IN 3D PROJECT** (out of 3D design) |
| Ambient motion | Original has wind sway, mist, leaves, ground ripple | **MISSING IN 3D PROJECT** |
| Offline build | Original loads three@0.170.0 from a CDN via importmap; 3D vendors three and makes zero network requests | **3D BETTER** |
| Testing | Original: CLI 31 + web movement/pose/water. 3D: 408 checks across 10 suites | **VERIFIED IN BOTH** |
| Performance | Original: painted billboards, cheap. 3D: real geometry, heavier | **IMPROVEMENT RECOMMENDED** |

---

## 3. Discrepancies, with files and corrections

### 3.1 Location graph (Critical candidate — needs approval)

- Original: `main.py`, `VALID_MOVES`.
- 3D: `src/rules.js`, `LOCATIONS`.
- Original allows **Beach ↔ Old Bridge directly**. The 3D requires Beach → Jungle → Cave → Old Bridge.
- Correction requires new exits in `rules.js`, new anchors and gates in `src/world.js`, and a map edge in
  `src/nav.js`. That is a location redesign, which the active freeze forbids. **Not implemented.
  Requires CEO approval.**

### 3.2 Name validation (corrected in this review)

- Original: `main.py`, `player_name()` — any non-empty trimmed string.
- 3D: `src/main.js`, `validateName()` — additionally required a letter and restricted the charset,
  so `R2D2` or `123` were refused.
- Corrected: the 3D now accepts any non-empty name up to 24 characters, still NFC-normalised,
  control characters stripped, whitespace collapsed. Tests updated to assert the aligned behaviour.

### 3.3 Character selection (Missing)

- Original: `web/index.html` — four operators with distinct kits.
- 3D: name entry only.
- **Not implemented.** It is a new screen and new player-facing choice, which the freeze forbids.

### 3.4 Pose system (Missing, high value)

- Original: `web/pose.js` — 15 named poses with slew-limited blending, explicitly designed so
  "transitions never snap".
- 3D: `src/character.js` — procedural limb swing only, no named states, no blending.
- **Not implemented.** This is the reference to follow when the GLB character is integrated; the
  original's state names map cleanly onto the required idle/walk/run/turn/stop/pickup/hit/death set.

### 3.5 Energy additions in 3D (Divergence)

- Original: no rest, no swim.
- 3D: `rest` (+2, once, Beach) and `swim` (−3 gamble at the bridge).
- These are additive mechanics that soften the energy economy. Documented, not removed: the freeze
  also forbids removing working features. **CEO decision requested.**

### 3.6 Quit semantics (Divergence, 3D better)

- Original: `quit` sets `game_over`, ending the run as a loss.
- 3D: quitting returns to the menu and preserves the save. Better UX; preserved.

---

## 4. Reusable original logic and assets

| Item | Reusable? | Note |
|---|---|---|
| `main.py` rules | Yes, as reference | Already matched except the graph in 3.1 |
| `tests/test_game.py` cases | Yes | Ported as `tests/journey.test.mjs` |
| `web/pose.js` state list and blend rules | Yes, as design reference | GPL v3 code: copy with care |
| `web/tests/*.js` assertions | Partly | Only where the 3D has the same mechanic |
| `web/img/*` painted art | **No** | Provenance unstated; GPL covers the repo, not the artwork's origin |

---

## 5. Ranked recommendations

**A. Critical**
1. Decide on the Beach ↔ Old Bridge edge (3.1). Restoring it changes world layout.
2. Name validation — **done**.

**B. Important**
3. Port the pose state machine from `web/pose.js` when the GLB lands (3.4).
4. Add stamina only if the CEO wants parity with the original web build.
5. Reduce 3D draw calls and geometry for mobile parity.

**C. Optional**
6. Character selection screen (3.3) — new UI, needs approval.
7. Ambient wind/mist/ripple from `alive.js`.

---

## 6. File-by-file plan

| File | Change | Status |
|---|---|---|
| `src/main.js` | Relax `validateName` to match `main.py` | Done |
| `index.html` | Survivor hint text matches the new rule | Done |
| `tests/survivor.test.mjs` | Assert original-aligned acceptance | Done |
| `tests/dom.test.mjs` | Rejection path now uses an over-long name | Done |
| `src/rules.js` | Beach ↔ Old Bridge exits | **Blocked: needs approval** |
| `src/world.js`, `src/nav.js` | Anchors and map edge for the above | **Blocked: needs approval** |

## 7. Regression tests added or required

Added: name acceptance aligned with `main.py` (digits, symbols, Unicode, empty, over-length).
Already present and covering the original's cases: transitions, gates, duplicates, energy,
exhaustion, win, loss, save/continue, restart, invalid actions (`tests/journey.test.mjs`).
Required once approved: a Beach ↔ Old Bridge transition test, and a character-selection test.

## 8. Licensing

- Original repository: **GNU GPL v3**. Copying `main.py` or `web/*.js` into the 3D project would put the
  3D project under GPL v3. The 3D project currently copies none of it; the rules were reimplemented.
- `web/img/*.jpg|png` (13 files, ~2.4 MB): no provenance or licence statement in the archive beyond the
  repository GPL. **Do not reuse.** Their origin is unknown and they may be third-party photographs.
- 3D character assets: MakeHuman system assets, **CC0**, evidenced on the publisher's pack page.
- 3D toolchain: MPFB2 (GPL v3, authoring only), Blender (GPL, tool only) — neither affects the shipped
  game.
