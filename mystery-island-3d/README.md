# Mystery Island — The Lost Lighthouse (3D)

A third-person survival horror game in the browser. You wake on a wrecked beach,
find a rope and a lantern, cross a broken bridge and light the lighthouse beacon
before your energy runs out.

This folder is the 3D remake. The original Python CLI in `../easy-mystery-island/`
is untouched and still runs.

**Status: prototype.** Automated tests pass. It has not yet been run in a real
browser or on a phone — see `VERIFICATION.md`.

## Play it

```bash
# no server needed: the built game is one self-contained file
open dist/index.html        # macOS   (Linux: xdg-open, Windows: start)

# or serve it, which is what a phone needs
python3 -m http.server 8000
# then open http://localhost:8000/dist/index.html
```

On a phone, use the laptop's LAN address: `http://192.168.x.x:8000/dist/index.html`.

URL flags: `?debug=1` shows fps and room state, `?selftest=1` runs twelve
in-browser checks and prints the result on screen.

## Controls

**Desktop**

| Input | Action |
| --- | --- |
| `W A S D` or arrows | Move, relative to the camera |
| `Shift` | Run |
| Mouse drag, or click to lock the pointer | Orbit the camera |
| `E` | Use whatever is in reach |
| `F` | Lamp on or off |
| `Esc` | Pause |

The camera drifts back behind the survivor on its own when you stop steering it.

**Mobile**

| Input | Action |
| --- | --- |
| Left half of the screen | Virtual stick — move |
| Right half | Drag to orbit the camera |
| Push the stick to the edge | Run |
| `Use` / `Lamp` / `II` buttons | Interact, lamp, pause |

## What is in the game

**Third person.** The survivor is a visible figure built from primitives — head,
torso, arms, legs, backpack, a lamp in the right hand. The gait is driven by
distance travelled, not by a timer, so the feet move at the speed the body
moves: walk at 2.7 m/s, run at 5.2 m/s, and the character leans into a run, bobs,
and swings arms opposite to legs. Collecting an item reaches out with the right
arm; taking damage rocks the body. The camera sits 5.6 m behind and 2.5 m up,
eases into place, and never clips through the floor.

**Five connected rooms.** Beach, Jungle, Cave, Old Bridge, Lighthouse, with the
same geography and the same exits as the CLI.

**Navigation.** A minimap bottom-right shows the five rooms and the paths between
them, the room you are in, your position inside it, and a dashed route to the
next goal. Above it, an arrow points at the immediate next thing to do with a
distance in metres and a compass direction. The objective line names the
ultimate goal. Room names are announced on arrival. The map shows direction, not
secrets: it never marks a horror event.

**Survivor creation.** A proper screen replaces the browser prompt: an intro, a
name field with validation (2–20 characters, letters, spaces, hyphens,
apostrophes), an inline error, and a fade into play. The name is used in the HUD,
in story events and on the ending screens.

**Visibility.** Moonlight, lifted ambient light, thinner fog, and a trail of
faintly glowing stones from the centre of every room to each exit. Interactive
objects are emissive. The lamp is useful without being the only way to see.

**Survival.** Five energy, one move per room transition, one campfire rest, a
swim gamble at the bridge, and the watcher in the jungle that costs you energy
and drives you back to the beach.

## Architecture

```
index.html            markup and CSS for every screen
build.mjs             inlines src/ and vendor/ into dist/index.html
src/rules.js          pure game rules — a port of game.py, no DOM, no Three
src/save.js           settings and one save slot, versioned and validated
src/audio.js          synthesised ambience and effects (Web Audio, no files)
src/world.js          the five rooms, lighting, collisions, interactables
src/character.js      the survivor rig and its procedural animation
src/player.js         third-person controller: movement, camera, lamp
src/nav.js            roadmap graph, objectives, bearings, minimap drawing
src/controls.js       keyboard, mouse, pointer lock, touch
src/horror.js         scares, the watcher, scheduled events
src/ui.js             screens, HUD, guidance, survivor creation
src/main.js           state machine, game loop, wiring
tests/                six suites plus a structural Three.js mock
```

Rules live in `rules.js` and know nothing about rendering. `nav.js` and
`character.js` are likewise independent of the DOM, which is why they can be
tested without a browser.

## Testing

```bash
npm install          # dev only, for jsdom
npm test             # 365 checks
```

| Suite | Checks | What it covers |
| --- | --- | --- |
| `rules.test.mjs` | 38 | Rules, plus nine command sequences replayed through the real `game.py` and compared message by message |
| `world.test.mjs` | 82 | Every room builds; every anchor is reachable; exits match the rules both ways |
| `save.test.mjs` | 41 | Round trip, corrupt slot, blocked storage, version mismatch |
| `offline.test.mjs` | 14 | The bundle makes zero network requests |
| `nav.test.mjs` | 44 | Objectives, routes, bearings, minimap projection |
| `character.test.mjs` | 31 | Limbs, walk and run gaits, turning, pickup, flinch |
| `dom.test.mjs` | 64 | Boots the game headlessly and plays a full winning run and a full losing run |

The original CLI keeps its own suite: `python3 -m unittest discover -s tests`
from `../easy-mystery-island/` (31 tests).

## Dependencies

- Three.js **0.157.0** plus `GLTFLoader`, bundled to `vendor/three.js` (ESM sources, esbuild IIFE, no external imports) and inlined into `dist/`.
  Nothing is fetched at runtime.
- `jsdom` (dev only) for the headless integration test. The game itself has no
  runtime dependencies.

## Known limitations

- Not yet run in a browser or on a phone. Lighting balance, touch ergonomics,
  audio unlock behaviour and jump-scare timing are all untuned by observation.
- Lighting is tuned analytically, not by eye.
- Quality changes take effect immediately for resolution; shadows change on the
  next room load.
- There is no falling off the bridge: the chasm is walled, because falling is not
  a loss condition in the original game.

## Defect fix — 24 November 2026

Two release-blocking defects in survivor creation were reported and fixed.

**Names were restricted to ASCII.** `NAME_PATTERN` was `/^[A-Za-z][A-Za-z' -]{1,19}$/`,
which rejected José, Ñoño, Chukwuemeka with any accent, and — most damagingly —
O'Connor typed on a phone, because mobile keyboards insert U+2019 rather than
U+0027. Validation is now Unicode-aware: any script's letters, plus spaces,
hyphens, apostrophes (straight and curly) and full stops, up to 24 characters.
Input is NFC-normalised, control characters are stripped, whitespace is trimmed
and collapsed, and the name must contain at least one letter.

**Confirming a name did not start the game on a phone.** `.screen` used
`position:fixed` with `justify-content:center` and no overflow, so when the
survivor form was taller than the viewport — which it is on a phone, especially
with the keyboard open — the confirm button was clipped and could not be scrolled
into reach. Taps landed on nothing. The screen now scrolls, centres only when
there is room, respects the safe-area inset, and pulls the button into view when
the field gains focus. A rejected name now shows a visible message instead of
silently doing nothing, and the button reports that it is working.
