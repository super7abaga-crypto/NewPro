# MYSTERY ISLAND — PROJECT SUBMISSION EVIDENCE

## 1. GitHub Repository

**Repository URL:**

https://github.com/super7abaga-crypto/NewPro

**Project directory:** `Mystery-Island/`

**Branch:** `main`

**Final commit SHA:** To be updated after the final documentation commit.

## 2. Python Version

Python 3.12.3

To verify the installed version:

```bash
python3 --version
```

## 3. Running the Application

Navigate to the project directory:

```bash
cd ~/Desktop/NewPro/Mystery-Island
```

Run the game:

```bash
python3 main.py
```

Follow the menu instructions to play Mystery Island: The Lost Lighthouse.

## 4. Running the Unit Tests

Run:

```bash
python3 -m unittest discover -s tests -v
```

### Test Results

**12 tests passed successfully.**

The test suite covers:

1. Initial player state.
2. Invalid destinations.
3. Successful movement.
4. Non-adjacent movement.
5. Rope requirement at the bridge.
6. Collecting the Rope only once.
7. Preventing collection outside the correct location.
8. Preventing movement after game over.
9. Energy exhaustion.
10. Lantern requirement for lighthouse completion.
11. Successful lighthouse completion.
12. Fresh inventory for a new player.

Expected test summary from the previously completed run:

```text
Ran 12 tests in 0.001s

OK
```

## 5. Syntax Verification

The following command was executed successfully:

```bash
python3 -m py_compile main.py game.py tests/test_game.py
```

No syntax errors were reported.

## 6. Project Documentation

The project README is located at:

`Mystery-Island/README.md`

Additional documentation:

- `docs/AI_LEARNING_LOG.md` — two AI learning-log entries.
- `docs/DEFENCE_REFLECTION.md` — personal learning reflection.
- `docs/SUBMISSION_EVIDENCE.md` — submission details and verification evidence.

## 7. Manual Gameplay Demonstrations

The game was manually tested using three scenarios:

**Happy path:** The player collects the Rope and Lantern, crosses the bridge, reaches the Lighthouse and successfully restores it.

**Losing path:** The player exhausts their energy, triggering the game-over condition.

**Invalid-input path:** The player enters invalid menu choices, destinations and item-collection responses. The program handles these inputs without crashing.