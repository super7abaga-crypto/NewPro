# Verification Record — Mystery Island 3D

This file states exactly what has been observed, how, and what has not been
observed. It exists because the acceptance criteria require evidence rather than
assurances, and because a passing unit test is not the same thing as a game that
looks right on a phone.

**Last updated:** 2026-11-23
**Build:** `dist/index.html`, 749 KB, sha256 recorded in `MANIFEST.txt`

---

## 1. What could not be done, and why

| Required | Status | Reason |
|---|---|---|
| Launch in a real browser | **NOT DONE** | No browser automation available: integration credits exhausted (99.83/100 used) |
| Desktop screenshots | **NOT DONE** | Same |
| Mobile screenshots | **NOT DONE** | Same, and no physical device access |
| Gameplay recording | **NOT DONE** | Same |
| Upload / deploy a playable URL | **NOT DONE** | File upload returns `CREDIT_LIMIT_REACHED` |
| Push to GitHub | **NOT DONE** | No repository token available |

No screenshots are included in this delivery. None were generated, synthesised or
described as if they existed.

Everything below was actually executed in this environment.

---

## 2. What was verified, and how

### 2.1 Automated suites — 211 checks, all passing

| Suite | Checks | Command | Covers |
|---|---|---|---|
| rules | 38 | `node tests/rules.test.mjs` | Every rule, plus 9 sequences replayed through the real `game.py` and compared message-for-message |
| world | 82 | `node tests/world.test.mjs` | Reachability of every interactable, exits present both ways, items only where the rules place them, spawn safety, fog and light |
| save | 41 | `node tests/save.test.mjs` | Round trip, 9 corrupt-save shapes, blocked storage, refusing storage, settings clamping |
| offline | 14 | `node tests/offline.test.mjs` | Bundle makes zero external requests, nothing un-inlined, dependency pinned and checksummed |
| dom | 36 | `node tests/dom.test.mjs` | Boots the real game in jsdom and plays a full win and a full loss |
| original CLI | 31 | `python3 -m unittest discover -s tests` in `../easy-mystery-island` | The untouched original still passes |

Last run: `rules 38/0`, `world 82/0`, `save 41/0`, `offline 14/0`, `dom 36/0`,
`python CLI 31 OK`.

### 2.2 What the DOM integration test actually proves

It loads `index.html` with the real `rules.js`, `world.js`, `player.js`,
`controls.js`, `horror.js`, `ui.js` and `main.js`, replacing only Three.js (with a
structural mock) and Web Audio (with a silent mock). It then:

1. Boots, removes the loading screen, reaches the menu.
2. Clicks **New Game**, asserts the HUD appears at the Beach with 5 energy.
3. Walks to the campfire anchor, asserts the prompt reads "Rest by the campfire",
   presses use, asserts `rested` in the real rules state.
4. Walks to the north gate, presses use, asserts the location becomes Jungle and
   energy becomes 4 — proving the move cost is charged through the real rules.
5. Walks to the rope, presses use, asserts inventory becomes `["rope"]` and the
   HUD chip and objective text update.
6. Pauses and resumes.
7. Runs the in-browser self-test: 12/12 checks pass, all five locations build.
8. Asserts the save slot was written with the right location and inventory.
9. Continues to the Cave, takes the lantern, crosses to the Bridge, crosses to the
   Lighthouse, lights the beacon, asserts `won === true` and the win screen reads
   "You escaped".
10. Asserts the save is cleared after the run ends.
11. Plays again, walks to the bridge and swims, asserts the loss screen and that
    the ending names drowning rather than energy.

This is real end-to-end evidence of the state machine, the rules, the world
anchors and the UI wiring. It is **not** evidence that the game renders correctly.

### 2.3 Defect found and fixed during this work

`tests/world.test.mjs` asserts that every interactable can be reached from inside
the walkable area. It failed on the Old Bridge: the west gate sat at x = -14 while
the walkable deck clamps to |x| ≤ 7.4, so the Cave was unreachable on the return
trip. The gate moved to x = -6.6 and the invariant test now guards it.

### 2.4 Changes made in this round (production readiness)

- Three.js **vendored** at `vendor/three.min.js`; the bundle now makes no network
  requests at all. The build fails if anything external or relative slips in.
- WebGL capability probe with a readable error instead of a black screen.
- Adaptive resolution: below 45 fps the renderer sheds pixels, never above the
  quality ceiling.
- Per-frame allocation removed from the movement path (reused vector).
- Save schema versioned (`SAVE_VERSION = 2`), validated field by field, corrupt
  slots discarded, settings clamped.
- Camera shake, torch flicker below 3 energy, and set dressing added to all five
  locations (driftwood, dead trees, bones, crates, chain, barrels).

---

## 3. Acceptance criteria — honest status

| Criterion | Status | Basis |
|---|---|---|
| Original CLI remains functional | **VERIFIED** | 31 Python tests pass, scripted run wins, files untouched |
| New game launches | **PARTIAL** | Boots in jsdom; not launched in a browser |
| Desktop movement and interactions | **PARTIAL** | Logic verified headlessly; input devices not exercised |
| Mobile movement and interactions | **NOT VERIFIED** | No device or browser access |
| All five locations playable | **PARTIAL** | All five build and are traversable in the integration run; not seen rendered |
| Flashlight works | **PARTIAL** | Created and toggled in code; not seen |
| Inventory and item collection | **VERIFIED (logic)** | Asserted through the real state in the integration test |
| Rope and lantern requirements enforced | **VERIFIED** | Rules tests and integration run |
| Energy and survival mechanics | **VERIFIED** | Rules tests, integration run |
| Horror effects and audio | **NOT VERIFIED** | Code paths execute under a silent mock; nothing heard |
| Threat encounters have consequences | **VERIFIED (logic)** | Watcher drains 1 energy and forces a return to the Beach |
| Player can win and lose | **VERIFIED (logic)** | Both completed in the integration run |
| Save and continue | **VERIFIED (logic)** | 41 save checks plus integration assertions |
| Settings and audio controls | **PARTIAL** | Wiring and clamping tested; not heard |
| No major broken assets or console errors | **NOT VERIFIED** | No console available; bundle is self-contained with no asset loads |
| Existing automated tests pass | **VERIFIED** | 31/31 |
| Documentation reflects implementation | **VERIFIED** | README rewritten against the code |

---

## 4. Outstanding defects and risks

1. **Lighting is untuned by eye.** Intensities were chosen analytically for
   physically-correct lights. Risk: rooms too dark or too bright. Mitigation:
   Settings → Brightness, plus `?debug=1`.
2. **Touch ergonomics unproven.** The joystick is zone-based (left half moves,
   right half looks). Comfort and reach are untested on a real handset.
3. **Audio autoplay policy.** Audio starts on the first menu click, which
   satisfies iOS and Chrome, but has not been confirmed on a device.
4. **Performance on low-end Android** is unknown. Adaptive resolution should
   absorb it; unmeasured.
5. **Jump-scare timing** is scripted by clock, not by pacing analysis. They may
   land early or feel mechanical.
6. **Original CLI endings.** Drowning and "call for help" still print *you ran out
   of energy*. Patch available, not applied (the CLI is deliberately frozen).

---

## 5. Deployment readiness

**Locally: ready.** Single self-contained file, no dependencies, no network.
`dist/index.html` will run from disk or any static host.

**Publicly: blocked.** Upload and deployment both fail with
`CREDIT_LIMIT_REACHED`. When credits return, the plan is:

1. Upload `dist/index.html`, serve it as `text/html` through a backend function
   (the same pattern already used for the attendance portal).
2. Open it on desktop and phone, capture real screenshots and a recording.
3. Fix whatever the screenshots reveal — lighting and touch first.
4. Push `mystery-island-3d/` to `NewPro` once a token is available.

**Not production-ready.** It is a complete, tested prototype that has never been
seen running.
