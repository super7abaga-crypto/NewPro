# Mystery Island — The Lost Lighthouse

A terminal text adventure in pure Python (standard library only, no
dependencies). You wake on Mystery Island after a storm. The lighthouse is
dark and the bridge is broken. Find the rope, find the lantern, cross the
bridge and light the beacon before your energy runs out.

## Setup

Requires Python 3.8 or newer. Nothing to install.

```bash
cd easy-mystery-island
python main.py
```

## Run the tests

```bash
python -m unittest discover -s tests -v
```

31 tests covering the ten required acceptance rules (T1–T10) plus input
handling, the menu, rest, swimming and replay.

## Game rules

* The map has five locations: **Beach → Jungle → Cave → Old Bridge → Lighthouse**.
  You can walk back the way you came.
* You start on the Beach with **5 energy** and nothing in your pockets.
* Every move costs **1 energy**. A refused or unknown action costs nothing and
  changes nothing.
* The **rope** lies in the Jungle, the **lantern** in the Cave. Each can be
  picked up once. Taking an item is free.
* The Bridge is impassable **without the rope** — the planks will not hold you.
* The beacon needs the **lantern**; the rope is no use for lighting it.
* **Rest** at the Beach campfire once per game to recover 2 energy (never above 5).
* At the Bridge you may **swim the channel** instead of crossing: it needs no rope
  but costs 3 energy, and if you have 2 or less left you drown.
* At the Lighthouse you may **call for help** instead of lighting the beacon. The
  boat does not see you: that choice loses the game.
* Energy reaching **0** ends the game in a loss. Energy never goes negative.
* After a win or a loss you can replay; replay starts from a completely fresh
  state (new inventory list, energy back to 5, back on the Beach).

### The three decisions that matter

1. **Rest or push on** — resting costs nothing but you only get one rest, so
   spending it early can be wasted if you are still at full energy.
2. **Bridge or swim** — swimming skips the rope hunt but burns 3 energy, so
   taking it too tired is fatal.
3. **Light the beacon or call for help** — shouting into the wind loses the game.

### Winning path (energy in brackets)

```
Beach [5] --north--> Jungle [4]  take rope
Jungle [4] --north--> Cave [3]   take lantern
Cave [3] --east--> Old Bridge [2]
Old Bridge [2] --north--> Lighthouse [1]   (needs rope)
Lighthouse: light beacon -> WIN
```

A sample winning session:

```
What is your name, survivor? Ada
== Beach ==
> go north
You follow the trail north and reach the Jungle. (-1 energy, 4 left)
> take rope
You work the rope free of the vines. It is sound.
...
> light beacon
You strike the match and the beacon roars into life.
Ada, you escaped Mystery Island with 1 energy to spare.
```

A sample losing session: walk to the Bridge with 2 energy left and type `swim`.
The current takes you and the boat sails past.

## Files

| File | Purpose |
| --- | --- |
| `main.py` | Terminal front end: title, instructions, name prompt, numbered menu, replay loop. |
| `game.py` | All rules. No `input()` and no `print()`, so every rule is testable. |
| `tests/test_game.py` | 31 unittest tests. |

## How it is built (and why)

* **Rules separate from the terminal.** `game.py` takes a player dictionary and
  returns message strings; `main.py` does the printing and typing. That is why
  tests can play a whole game without a keyboard.
* **One player dictionary is the state**: `name, location, energy, inventory,
  rested, turns, game_over, won, quit`. Nothing lives in global variables, so a
  replay is simply `game.new_game(name)`.
* **Small single-purpose functions**: `available_actions()`, `apply_action()`,
  `can_cross_bridge()`, `can_light_beacon()`, `_move()`, `_take()`, `_rest()`.
  `can_cross_bridge(inventory)` answers one yes/no question and prints nothing.
* **The map is data, not code**: `LOCATIONS` holds descriptions, exits and exit
  requirements, so adding a room means adding a dictionary entry.
* **Validation before mutation**: an action is checked first (does the exit
  exist, do you hold the item, is the item here?) and only then does the state
  change. A rejected action leaves the state byte-identical.

## Known limits

* English-only, single player, no save/load between runs.
* No random events: the same state plus the same action always gives the same
  result, which is what makes the tests reliable.
* The numbered menu is rebuilt from the current room, so an old number may mean
  something else after a move. Type a command word instead if you prefer.
* `main.py` needs an interactive terminal; piping input works for scripted
  demos but there is no colour or cursor handling.
