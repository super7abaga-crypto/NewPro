# EASY TRACK — MYSTERY ISLAND: The Lost Lighthouse

## Project Description

Mystery Island: The Lost Lighthouse is a beginner-friendly, text-based adventure game developed in Python.

The player is stranded on a mysterious island and must explore different locations, collect useful items, manage their energy, and restore the lost lighthouse to win the game.

The game runs entirely in the terminal and uses Python's standard library.

## Game Objectives

Your mission is to restore the island's lighthouse by:

1. Exploring the five locations on the island.
2. Searching for useful items.
3. Deciding whether to collect discovered items.
4. Managing your limited energy.
5. Using the required items to overcome obstacles.
6. Successfully reaching and lighting the lighthouse.

## Game Locations

The game contains five locations:

- **Beach:** Starting location. Search here to find a Rope.
- **Jungle:** An area to explore on your journey.
- **Cave:** Search here to find a Lantern.
- **Old Bridge:** Requires a Rope to cross.
- **Lighthouse:** The final destination. Requires a Lantern to restore its light.

## Game Features

- Player registration using a chosen name.
- Menu-driven gameplay.
- Five explorable locations.
- Player energy management.
- Item discovery and collection.
- Choice-based item collection: players can accept or leave discovered items.
- Inventory management.
- Movement restrictions between locations.
- Obstacles that require specific items.
- Win, lose, and quit conditions.
- Replay option with a fresh player state.
- Input validation to prevent invalid choices from crashing the game.
- Dictionary-based action dispatch for handling menu and collection choices.

## Game Rules

- Every new player starts with **5 energy points**.
- The player starts at the Beach.
- Each successful movement costs 1 energy point.
- Invalid or restricted movements do not consume energy.
- Energy cannot fall below zero.
- The Rope can only be collected at the Beach.
- The Lantern can only be collected in the Cave.
- Players can decide whether to collect or leave a discovered item.
- Items can only be collected once.
- The Old Bridge cannot be crossed without the Rope.
- The lighthouse cannot be restored without the Lantern.
- Running out of energy ends the game.
- Successfully restoring the lighthouse wins the game.

## Menu Options

The player can interact with the game using the following menu:

1. Travel to another location.
2. Search for an item.
3. View player status.
4. Light the lighthouse.
5. Quit the game.

## Project Structure

```text
Mystery-Island/
│
├── main.py
├── game.py
├── README.md
│
└── tests/
    └── test_game.py
```

### File Descriptions

- **main.py:** Handles the game's user interface, menu, player interactions, and replay system.
- **game.py:** Contains the core game logic, including player creation, movement, item collection, and lighthouse completion.
- **tests/test_game.py:** Contains unit tests for verifying the game's functionality.
- **README.md:** Provides project documentation, setup instructions, and game rules.

## Installation and Setup

### Requirements

- Python 3.10 or later.
- A terminal or command-line interface.

No external Python packages are required.

### Running the Game

Clone or download the project and navigate into its directory:

```bash
cd Mystery-Island
```

Run the game:

```bash
python3 main.py
```

## Running the Tests

The project uses Python's built-in `unittest` framework.

To execute the tests, run:

```bash
python3 -m unittest discover -s tests -v
```

To check the Python files for syntax errors, run:

```bash
python3 -m py_compile main.py game.py tests/test_game.py
```

## Technologies Used

- Python 3
- Python Standard Library
- Unittest

## Known Limitations

- The game runs exclusively in the terminal.
- Player progress is not saved after the game ends.
- Locations and collectible items are predefined.
- The game does not support multiplayer.

## Project Goal

This project demonstrates fundamental Python programming concepts, including:

- Variables and data structures.
- Functions and modular programming.
- Dictionaries and lists.
- Conditional statements and loops.
- User input and output.
- Dictionary-based function dispatch.
- State management.
- Error handling and input validation.
- Unit testing.

---

**Project:** EASY TRACK — MYSTERY ISLAND: The Lost Lighthouse

**Language:** Python

**Type:** Text-Based Adventure Game