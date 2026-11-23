# Mystery Island — The Lost Lighthouse (3D)

A first-person survival horror remake of the original terminal game. Same island,
same five locations, same rope, same lantern, same energy — rebuilt as a browser
game for desktop and mobile.

The original CLI game is untouched and still runs. See `../easy-mystery-island/`.

---

## Play it

**Fastest:** open `dist/index.html` in a browser. It is a single 749 KB file with
Three.js inlined. No server, no build, no network, no dependencies. Double-click
it from a USB stick and it works.

**From source (development):**

```bash
cd mystery-island-3d
python3 -m http.server 8000
# then open http://localhost:8000
```

On a phone, use `http://<your-computer-ip>:8000` on the same Wi-Fi.

**Rebuild the single-file bundle after editing `src/`:**

```bash
node build.mjs        # writes dist/index.html and fails if anything external slipped in
```

---

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | `W A S D` or arrow keys | left thumb, drag anywhere on the left half |
| Look | mouse (click the canvas to lock the pointer) | right thumb, drag anywhere on the right half |
| Interact | `E` | **Use** button |
| Flashlight | `F` | **Lamp** button |
| Pause | `Esc` | **II** button |
| Mute | `M` | in Settings |

A prompt appears at the bottom of the screen when you are close enough to
something. Nothing happens automatically: you choose every move, exactly like the
CLI, and every move costs one energy.

---

## What is in the game

**Five locations**, each generated in code rather than loaded from model files, so
there is nothing to 404: the storm beach and its wreck, the jungle with its
watcher, the cave where the lantern waits, the broken bridge over the channel, and
the lighthouse.

**Rules identical to the original.** 5 energy, 1 per move, a refused action costs
nothing, rope in the Jungle, lantern in the Cave, the bridge needs the rope, the
beacon needs the lantern, one rest at the beach campfire for +2, swimming costs 3
and drowns you if you cannot pay, calling for help loses the game. The rules module
is a line-for-line port of `game.py` and is tested against it directly (see
*Testing*).

**Horror systems.**
- Synthesised audio: wind and rain beds per location, footsteps that change with
  the surface, whispers, thunder, cave drips, creaks, a heartbeat that quickens as
  energy drains, a scream and a beacon roar. No audio files, nothing to load.
- Darkness and fog tuned per room; the cave is close to unlit until you find the
  lantern.
- A failing torch: below 3 energy the beam stutters.
- Camera shake on scares and on damage.
- The watcher in the jungle: linger too long and something closes on you. If it
  reaches you it takes 1 energy and drives you back to the Beach. That is a real
  consequence in the real state, not a cutscene.
- Two story-tied jump scares: the lantern in the cave, and the bridge when you try
  to cross without a rope.

**Systems.** Main menu, continue, settings (volume, brightness, look sensitivity,
quality, subtitles), pause, save on every action, win and lose sequences, and
adaptive resolution that drops pixels rather than frames on a slow phone.

**Diagnostics.** Add `?debug=1` for an fps/location/pixel-ratio readout. Add
`?selftest=1` to run the in-browser self-test panel (12 checks: renderer, rules,
win path, bridge gate, all five locations, audio, save).

---

## Architecture

```
index.html            markup, CSS, screen definitions
build.mjs             inlines src/*.js + vendor/three.min.js → dist/index.html
vendor/three.min.js   Three.js r157, vendored (no CDN, no network)
src/
  rules.js      pure game rules — no DOM, no Three.js, no audio
  world.js      procedural geometry for the five locations
  player.js     first-person camera, movement, collision, flashlight
  controls.js   keyboard, pointer lock, touch joystick
  audio.js      Web Audio synthesis — every sound is generated
  horror.js     the director: scares, the watcher, atmosphere events
  save.js       versioned save slot and settings, resilient to broken storage
  ui.js         screens, HUD, prompts, settings wiring
  main.js       state machine and game loop
tests/
  rules.test.mjs    rules + parity against the real Python engine
  world.test.mjs    invariants: reachability, exits, items, spawns
  save.test.mjs     save/settings reliability
  offline.test.mjs  the bundle really is offline and dependency-pinned
  dom.test.mjs      jsdom integration: full winning and losing runs
  three-mock.mjs    structural Three.js stand-in for headless tests
dist/index.html       the shipped single file
```

The rules engine has no knowledge of rendering, audio or input, which is why the
same module can be tested headlessly and played in a browser. `main.js` is the
only place that knows about all of them.

---

## Testing

```bash
npm install            # jsdom, dev-only, for the DOM test
npm test               # everything
npm run test:rules     # 38  rules + parity with game.py
npm run test:world     # 82  world invariants
npm run test:save      # 41  save reliability
npm run test:offline   # 14  bundle/offline/dependency checks
npm run test:dom       # 36  full playthroughs in jsdom
npm run test:python-cli # 31  the original CLI, untouched
```

The parity layer inside `rules.test.mjs` is the important one: it replays nine
command sequences through the real `game.py` with Python and through `src/rules.js`
with Node, then compares every message and the final state. If the port ever drifts
from the original, that test fails.

`tests/dom.test.mjs` boots the actual game in jsdom with a structural Three.js
mock and plays a complete winning run (Beach → Jungle → Cave → Bridge → Lighthouse
→ beacon) and a complete losing run (drowning in the channel), asserting HUD state,
inventory, energy, save and the end screens along the way.

---

## Dependencies

| What | Version | Where |
|---|---|---|
| Three.js | 0.157.0 | vendored at `vendor/three.min.js`, sha256 `445798e31f78915517816443e59440b3ab575633c40c278e30b3ac9ea55fa0c0` |
| jsdom | ^24 | dev only, for the DOM test |
| Node | ≥ 18 | build and tests |
| Python | ≥ 3.8 | only for the original CLI and the parity test |

Runtime dependencies: **none**. No fonts, no textures, no audio files, no CDN.

---

## Known limitations

- **Not yet verified in a real browser or on a real phone.** The logic is tested
  hard, but rendering, audio and touch have only been exercised headlessly. See
  `VERIFICATION.md` for exactly what has and has not been observed.
- Lighting is tuned blind. If a room reads too dark or too bright, use Settings →
  Brightness (40–160) rather than editing code.
- Changing Quality applies resolution immediately; shadows switch on the next
  location load.
- No fall death on the bridge: invisible walls keep you on the planks, because
  falling is not a loss condition in the original.
- Swimming is always fatal on the intended route (energy at the bridge is always
  2). That is faithful to the original, where the same is true.
- The original CLI still reports both drowning and "call for help" as *ran out of
  energy*. A patch for that is at `../mystery_island_patched/loss-reason.patch`;
  the 3D version already reports the correct cause.
