# Verification Record — Mystery Island 3D

What has actually been observed, how, and what has not been observed at all.
Written 23 November 2026, after the third-person redesign.

## 1. What could not be done, and why

**No browser has run this game. No phone has run this game. There are no
screenshots and no recording.**

Integration credits on this account are exhausted (99.83 of 100 used), which
blocks the browser automation tools, public and private file upload, and
therefore any hosted URL. Every visual claim below is absent on purpose. Nothing
in this document is a screenshot description.

This means the following are **unverified**: how the game looks, whether the
lighting reads on a real screen, whether touch controls feel usable, whether iOS
unlocks audio, whether a mid-range Android phone holds a playable frame rate, and
whether the jump scares land at the right moment.

## 2. What was verified, and how

### 2.1 Automated suites — 314 checks, all passing

Run on 23 November 2026, Node 24 and Python 3.11.

| Suite | Result | Covers |
| --- | --- | --- |
| `rules.test.mjs` | 38 pass, 0 fail | Game rules, plus nine command sequences replayed through the real `game.py` and compared message by message |
| `world.test.mjs` | 82 pass, 0 fail | All five rooms build; every interactable is reachable under the movement clamp; every rules exit exists in the world and vice versa; items appear only where the rules put them |
| `save.test.mjs` | 41 pass, 0 fail | Save round trip, corrupt slot discarded, blocked storage, refused writes, version mismatch |
| `offline.test.mjs` | 14 pass, 0 fail | The built bundle makes zero external requests and no local script is left un-inlined |
| `nav.test.mjs` | 44 pass, 0 fail | Objective selection per game state, route finding, bearing and compass maths, minimap projection, and that guidance never names a horror event |
| `character.test.mjs` | 31 pass, 0 fail | Rig structure, idle stillness, walk and run gaits, opposite arm and leg swing, easing turns, pickup animation, flinch, lamp toggle |
| `dom.test.mjs` | 64 pass, 0 fail | Boots the real game headlessly and plays a full winning run and a full losing run |

The original Python CLI suite still passes: 31 tests, unchanged.

### 2.2 What the headless integration test actually proves

`dom.test.mjs` loads the real `index.html`, the real modules and the real state
machine. Three.js is replaced by a structural mock that records the scene graph
instead of rendering, and Web Audio by a silent mock. So it proves wiring and
state, not pixels. Specifically it confirms:

- the game boots to the menu and reaches play through the survivor screen;
- the survivor exists in the scene, parented, with separate limb groups;
- the camera sits 4 to 9 m behind the player and above it;
- the character physically moves when movement input is applied;
- legs and arms swing while walking and the run gait exceeds the walk;
- the HUD shows room, energy, inventory, objective and guidance;
- walking to an anchor and using it changes real game state;
- the rope and lantern are collected, and the inventory chips update;
- the bridge refuses passage without the rope and allows it with;
- the beacon wins the game and the win screen names the survivor;
- drowning ends the game with the correct ending text;
- save survives to `localStorage` and is cleared when a run ends;
- pause and resume work;
- play again returns to survivor creation.

### 2.3 What the redesign changed

- First-person camera replaced by a third-person follow camera: 5.6 m behind,
  2.5 to 3.9 m up depending on pitch, exponential easing, auto-recentring behind
  the survivor, orbit by mouse drag or touch drag.
- New `character.js`: a visible survivor built from primitives with a gait driven
  by distance travelled. Walk 2.7 m/s, run 5.2 m/s. Pickup and flinch animations.
- New `nav.js`: roadmap graph over the five rooms, objective selection from the
  rules state, route finding, bearings, minimap drawing.
- New HUD: minimap with room nodes, player position and a dashed remaining
  route; a rotating guidance arrow with distance and compass direction; an
  objective line naming the ultimate goal.
- Survivor creation screen replaces `window.prompt`, with validation and an
  inline error.
- Visibility: moonlight added per room, ambient lifted, fog thinned by roughly
  40%, and a trail of emissive stones laid from each room centre to every exit.
- The lamp now hangs on the character and lights from the character rather than
  from an invisible camera.

### 2.4 Defects found and fixed during this work

1. **Bridge west gate unreachable.** The gate sat at x = -14 while the walkable
   deck clamps to |x| ≤ 7.4, so the Cave could not be re-entered from the bridge.
   Fixed, and `world.test.mjs` now asserts reachability for every anchor in every
   room.
2. **Real Three.js overwrote the test mock.** Once the vendor file was added, the
   jsdom harness loaded the real library and threw on WebGL. The harness now
   inlines the dev sources and removes the vendor tag.
3. **Two character tests compared angles naively.** A yaw of −π and +π are the
   same direction; the assertions now compare modulo a full turn. This was a
   test defect, not a gameplay defect, and the tests were corrected rather than
   removed.
4. **`action` referenced out of scope** in the interaction handler after the
   pickup-animation line was added. Fixed to use the anchor's action.

## 3. Acceptance criteria — honest status

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Player visibly rendered throughout gameplay | Structure verified (character in scene, parented, limbs). **Not seen.** |
| 2 | Walking and running animations | Verified structurally: limb rotation changes with speed, run exceeds walk. **Not seen.** |
| 3 | Turning and directional movement | Verified: facing eases toward movement direction. **Not seen.** |
| 4 | Camera follows smoothly | Verified: camera positioned behind and above, eased. **Not seen.** |
| 5 | All five environments navigable | Verified by tests. **Not seen.** |
| 6 | Collisions and boundaries | Verified by invariant tests. **Not felt.** |
| 7 | Rope and Lantern collection, visually and mechanically | Mechanically verified; animation triggered. **Visuals not seen.** |
| 8 | Bridge enforces the rope | Verified. |
| 9 | Lighthouse enforces the lantern | Verified. |
| 10 | Roadmap shows location and next objective | Verified by tests. **Not seen.** |
| 11 | Environment sufficiently visible | Brightened and pathway-lit in code. **This is the criterion most in need of eyes.** |
| 12 | Desktop and mobile controls implemented | Both implemented; keyboard path exercised in tests. **Touch never used.** |
| 13 | Save and continue | Verified. |
| 14 | Original win and loss conditions intact | Verified, including parity against `game.py`. |
| 15 | Existing tests pass, new tests added | 314 pass, including 75 new checks for nav and character. |

## 4. Outstanding defects and risks

- Lighting is tuned by reasoning, not by looking. It may be too dark or too flat.
- Touch ergonomics are unproven: stick size, look sensitivity and button
  placement have never been used by a hand.
- iOS audio unlock is unverified; the first gesture should start audio, but that
  is untested on Safari.
- Frame rate on low-end Android is unknown; adaptive resolution drops pixels
  below 45 fps but has never had to.
- The watcher's approach speed and the jump-scare timings are untuned.
- The character is built from primitives. It reads as a person in silhouette, but
  it has no textures and no skeletal animation.

## 5. Deployment readiness

The build is packaged, offline-capable and reproducible: `node build.mjs`
regenerates `dist/index.html` byte for byte from source. It is ready to be
inspected. It is **not** ready to be called finished, because nobody has played
it.
